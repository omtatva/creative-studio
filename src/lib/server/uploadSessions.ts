import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { WorkspaceQuotaError, ensureCounterInitialized } from "@/lib/server/workspaceQuota";
import { resolveWorkspaceEntitlements } from "@/lib/server/workspaceEntitlements";
import { abortMultipart } from "@/lib/server/gcsMultipart";
import { adminStorage } from "@/lib/server/firebaseAdmin";
import { formatBytesShort } from "@/lib/constants/uploadPolicy";
import { buildFileDocument, type FileRecordInput } from "@/lib/server/fileRecords";

/**
 * `upload_sessions/{sessionId}` — SERVER-ONLY (no client rule grants access; the Admin SDK is the only reader/writer). One document per multipart upload.
 *
 * STATES
 *   active      bytes may still be uploaded; the session HOLDS a storage reservation of `reservedBytes`
 *   completing  the server is assembling the object; the reservation is still held
 *   completed   the object is verified, counted in storageBytesUsed and the file record exists; reservation gone (terminal)
 *   aborted     cancelled by the user; reservation released, GCS upload aborted (terminal)
 *   expired     abandoned; swept lazily; reservation released, GCS upload aborted (terminal)
 *   failed      verification failed; reservation released (terminal)
 *
 * QUOTA: a reservation is simply "this session is active/completing", so
 *   available = limit - storageBytesUsed - SUM(reservedBytes of the workspace's active/completing sessions)
 * is evaluated inside the same Firestore transaction that creates the session — two concurrent uploads can never both claim the last bytes, and a
 * released/expired session frees its bytes automatically with no counter that could drift or go negative. Settlement (reservation -> real usage)
 * happens in ONE transaction together with the file record, and is guarded by the session state, so it can only ever happen once.
 */

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionStatus = "active" | "completing" | "completed" | "aborted" | "expired" | "failed";

export interface UploadSession {
  sessionId: string;
  uid: string;
  workspaceId: string;
  projectId: string;
  fileId: string;
  objectPath: string;
  gcsUploadId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  stageId: string | null;
  newVersionOfId: string | null;
  versionNumber: number;
  assetGroupId: string;
  previousVersionId: string | null;
  /** Cheap identity of the source file, so a resumed upload can be checked against the same file. */
  fingerprint: { name: string; size: number; lastModified: number };
  status: SessionStatus;
  reservedBytes: number;
  resultFileId?: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

const col = () => adminDb().collection("upload_sessions");
const ACTIVE: SessionStatus[] = ["active", "completing"];

export class SessionError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function newSessionId(): Promise<string> {
  return randomUUID().replace(/-/g, "");
}

/** Loads a session that belongs to THIS caller (a session id alone grants nothing). */
export async function loadOwnedSession(uid: string, sessionId: string): Promise<UploadSession> {
  if (!/^[0-9a-f]{32}$/.test(sessionId)) throw new SessionError(400, "INVALID_SESSION", "Invalid upload session.");
  const snap = await col().doc(sessionId).get();
  const s = snap.data() as UploadSession | undefined;
  // Same answer for "doesn't exist" and "isn't yours" — never reveal another user's session.
  if (!snap.exists || !s || s.uid !== uid) throw new SessionError(404, "SESSION_NOT_FOUND", "This upload session doesn't exist.");
  return s;
}

export function assertSessionUsable(s: UploadSession) {
  if (s.status === "aborted" || s.status === "expired" || s.status === "failed") throw new SessionError(410, "SESSION_CLOSED", `This upload was ${s.status}. Start the upload again.`);
  if (s.status === "active" && s.expiresAt < Date.now()) throw new SessionError(410, "SESSION_EXPIRED", "This upload session expired. Start the upload again.");
}

/** Pushes the expiry forward on activity, bounded by the maximum session age. */
export async function touchSession(s: UploadSession): Promise<void> {
  const expiresAt = Math.min(Date.now() + SESSION_TTL_MS, s.createdAt + SESSION_MAX_AGE_MS);
  await col().doc(s.sessionId).update({ expiresAt, updatedAt: Date.now() });
}

/** Abandoned sessions of a workspace release their reservation and abort their GCS upload. Lazy — runs before every new reservation. */
export async function expireStaleSessions(workspaceId: string): Promise<number> {
  const snap = await col().where("workspaceId", "==", workspaceId).where("status", "in", ACTIVE).get();
  let n = 0;
  for (const d of snap.docs) {
    const s = d.data() as UploadSession;
    if (s.expiresAt >= Date.now()) continue;
    const moved = await adminDb().runTransaction(async (tx) => {
      const cur = (await tx.get(d.ref)).data() as UploadSession | undefined;
      if (!cur || !ACTIVE.includes(cur.status) || cur.expiresAt >= Date.now()) return false;
      tx.update(d.ref, { status: "expired", reservedBytes: 0, updatedAt: Date.now() });
      return true;
    });
    if (moved) {
      n++;
      await abortMultipart(s.objectPath, s.gcsUploadId).catch((err) => console.error("[uploadSessions] abort of an expired session failed:", err instanceof Error ? err.message : err));
    }
  }
  return n;
}

/** An existing live session for the same person + project + file identity: init is idempotent, never a second upload / second reservation. */
export async function findResumableSession(uid: string, projectId: string, fp: UploadSession["fingerprint"], newVersionOfId: string | null): Promise<UploadSession | null> {
  const snap = await col().where("uid", "==", uid).where("projectId", "==", projectId).where("status", "==", "active").get();
  for (const d of snap.docs) {
    const s = d.data() as UploadSession;
    if (s.expiresAt >= Date.now() && s.fingerprint.name === fp.name && s.fingerprint.size === fp.size && s.fingerprint.lastModified === fp.lastModified && (s.newVersionOfId ?? null) === newVersionOfId) return s;
  }
  return null;
}

/**
 * Atomically checks the workspace's live storage entitlement against used + already-reserved + this upload, and creates the session (= the reservation)
 * in the SAME transaction. Throws WorkspaceQuotaError("STORAGE_LIMIT_REACHED") if it doesn't fit.
 */
export async function createSessionWithReservation(session: UploadSession): Promise<void> {
  const { limits } = await resolveWorkspaceEntitlements(session.workspaceId);
  const limit = limits.maxStorageBytes;
  await ensureCounterInitialized(session.workspaceId, "storage");
  const wsRef = adminDb().collection("workspaces").doc(session.workspaceId);
  const sessionRef = col().doc(session.sessionId);

  await adminDb().runTransaction(async (tx) => {
    const [wsSnap, activeSnap] = await Promise.all([tx.get(wsRef), tx.get(col().where("workspaceId", "==", session.workspaceId).where("status", "in", ACTIVE))]);
    if (!wsSnap.exists) throw new Error(`Workspace ${session.workspaceId} not found.`);
    const used = (wsSnap.data()?.storageBytesUsed as number | undefined) ?? 0;
    const reserved = activeSnap.docs.reduce((sum, d) => sum + ((d.data() as UploadSession).reservedBytes || 0), 0);
    if (Number.isFinite(limit) && used + reserved + session.reservedBytes > limit) {
      throw new WorkspaceQuotaError(
        "STORAGE_LIMIT_REACHED",
        `This upload (${formatBytesShort(session.reservedBytes)}) doesn't fit: ${formatBytesShort(Math.max(0, limit - used - reserved))} of storage is free (including uploads already in progress).`
      );
    }
    tx.set(sessionRef, session);
  });
}

/** Releases the reservation (cancel / failure). Idempotent: only an active/completing session can move. */
export async function closeSession(sessionId: string, to: "aborted" | "failed" | "expired"): Promise<UploadSession | null> {
  return adminDb().runTransaction(async (tx) => {
    const ref = col().doc(sessionId);
    const snap = await tx.get(ref);
    const s = snap.data() as UploadSession | undefined;
    if (!s || !ACTIVE.includes(s.status)) return s ?? null;
    tx.update(ref, { status: to, reservedBytes: 0, updatedAt: Date.now() });
    return s;
  });
}

/**
 * SETTLEMENT: reservation -> real usage + file record, ONE transaction, guarded by the session state so a repeated call can't double-count.
 * Returns the file id (the same one on every call).
 */
export async function settleSession(sessionId: string, actualBytes: number, record: FileRecordInput): Promise<{ fileId: string; alreadyCompleted: boolean }> {
  const ref = col().doc(sessionId);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const s = snap.data() as UploadSession | undefined;
    if (!s) throw new SessionError(404, "SESSION_NOT_FOUND", "This upload session doesn't exist.");
    if (s.status === "completed") return { fileId: s.resultFileId ?? s.fileId, alreadyCompleted: true };
    if (!ACTIVE.includes(s.status)) throw new SessionError(410, "SESSION_CLOSED", `This upload was ${s.status}.`);
    if (actualBytes !== s.sizeBytes) throw new SessionError(409, "SIZE_MISMATCH", "The uploaded object's size doesn't match what was declared.");
    const wsRef = adminDb().collection("workspaces").doc(s.workspaceId);
    const fileRef = adminDb().collection("files").doc(s.fileId);
    const [wsSnap, fileSnap] = await Promise.all([tx.get(wsRef), tx.get(fileRef)]);
    if (!wsSnap.exists) throw new Error(`Workspace ${s.workspaceId} not found.`);
    if (fileSnap.exists) throw new SessionError(409, "FILE_EXISTS", "A file record already exists for this upload.");
    const used = (wsSnap.data()?.storageBytesUsed as number | undefined) ?? 0;
    tx.update(wsRef, { storageBytesUsed: used + actualBytes, updatedAt: FieldValue.serverTimestamp() });
    tx.set(fileRef, buildFileDocument(record));
    if (s.newVersionOfId) tx.update(adminDb().collection("files").doc(s.newVersionOfId), { isLatestVersion: false, updatedAt: FieldValue.serverTimestamp() });
    tx.update(ref, { status: "completed", reservedBytes: 0, resultFileId: s.fileId, updatedAt: Date.now() });
    return { fileId: s.fileId, alreadyCompleted: false };
  });
}

/** Marks a session as being assembled (keeps the reservation). */
export async function markCompleting(sessionId: string): Promise<void> {
  await col().doc(sessionId).update({ status: "completing", updatedAt: Date.now() });
}

export async function deleteObjectQuietly(path: string): Promise<void> {
  await adminStorage().file(path).delete({ ignoreNotFound: true }).catch((err) => console.error("[uploadSessions] object cleanup failed:", err instanceof Error ? err.message : err));
}
