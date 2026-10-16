import "server-only";
import { NextResponse } from "next/server";
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { createNotificationOnce } from "@/lib/server/notifications";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { fileReviewRoute, projectRoute } from "@/lib/constants/routes";
import { expireAt } from "@/lib/server/ttl";
import type { ReviewSession, ReviewShare, ReviewShareStatus, ExternalComment } from "@/types/reviewShare.types";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/* ───────────────────────────── tokens ───────────────────────────── */

/** 256 bits from the OS CSPRNG — never derived from ids, timestamps or Math.random. */
export const generateToken = (): string => randomBytes(32).toString("base64url");
export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/* ───────────────────────────── passwords ───────────────────────────── */
// scrypt (Node's built-in, memory-hard KDF) with a per-password random salt. The stored string
// carries its own parameters so they can be raised later without invalidating old hashes.

const SCRYPT_N = 16384;
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 32);
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, , saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ───────────────────────────── share lifecycle ───────────────────────────── */

export function effectiveShareStatus(share: Pick<ReviewShare, "status" | "expiresAt">, now = Date.now()): ReviewShareStatus {
  if (share.status === "revoked") return "revoked";
  if (share.expiresAt && Date.parse(share.expiresAt) <= now) return "expired";
  return "active";
}

export interface ShareFile {
  id: string;
  workspaceId: string;
  projectId: string;
  fileName: string;
  contentType: string;
  assetType: string;
  storagePath: string;
  stageId: string | null;
  assetGroupId?: string;
  versionNumber?: number;
  durationSeconds?: number | null;
  reviewStatus?: string;
  createdAt?: unknown;
}

/** Resolves a raw token to its share + the file it is scoped to. Anything not exactly `active` is refused here, so no caller can forget the expiry/revocation check. */
export async function loadShareByToken(token: string): Promise<{ ok: true; share: ReviewShare; file: ShareFile } | { ok: false; reason: "unavailable" | "expired" | "revoked" }> {
  if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: "unavailable" };
  const found = await adminDb().collection("review_shares").where("tokenHash", "==", sha256Hex(token)).limit(1).get();
  const doc = found.docs[0];
  if (!doc) return { ok: false, reason: "unavailable" };
  const share = doc.data() as ReviewShare;
  const status = effectiveShareStatus(share);
  if (status !== "active") return { ok: false, reason: status };
  const fileSnap = await adminDb().collection("files").doc(share.fileId).get();
  const file = fileSnap.data() as ShareFile | undefined;
  // The scope recorded on the share must still match reality (a deleted file, or a file moved to another project, ends the link).
  if (!fileSnap.exists || !file || file.workspaceId !== share.workspaceId || file.projectId !== share.projectId || file.reviewStatus === "archived") {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, share, file: { ...file, id: fileSnap.id } };
}

/** Re-checks a share by id (used when a download ticket is redeemed): still active, not expired, and downloads still allowed. */
export async function shareAllowsDownload(shareId: string): Promise<boolean> {
  const snap = await adminDb().collection("review_shares").doc(shareId).get();
  const share = snap.data() as ReviewShare | undefined;
  return !!share && effectiveShareStatus(share) === "active" && share.permissions.canDownload === true;
}

/* ───────────────────────────── sessions / cookies ───────────────────────────── */

const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const cookieName = (shareId: string) => `ofr_${shareId}`;

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

export function sessionCookie(share: ReviewShare, sessionToken: string, expiresAtMs: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${cookieName(share.id)}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(share: ReviewShare, patch: Partial<ReviewSession> = {}): Promise<{ sessionToken: string; session: ReviewSession }> {
  const sessionToken = generateToken();
  const expiresAtMs = Math.min(Date.now() + SESSION_MAX_MS, share.expiresAt ? Date.parse(share.expiresAt) : Infinity);
  const session: ReviewSession = {
    shareId: share.id,
    reviewerId: randomUUID(),
    displayName: null,
    email: null,
    emailVerified: false,
    passwordOk: false,
    authEpoch: share.authEpoch,
    createdAt: new Date().toISOString(),
    expiresAtMs,
    openedLogged: false,
    ...patch,
  };
  await adminDb().collection("review_sessions").doc(sha256Hex(sessionToken)).set({ ...session, expireAt: expireAt(session.expiresAtMs) });
  return { sessionToken, session };
}

/** The reviewer's session for THIS share, or null (missing, expired, wrong share, or invalidated by an auth change). */
export async function readSession(request: Request, share: ReviewShare): Promise<{ sessionToken: string; session: ReviewSession } | null> {
  const sessionToken = readCookie(request, cookieName(share.id));
  if (!sessionToken || !TOKEN_PATTERN.test(sessionToken)) return null;
  const snap = await adminDb().collection("review_sessions").doc(sha256Hex(sessionToken)).get();
  const session = snap.data() as ReviewSession | undefined;
  if (!snap.exists || !session) return null;
  if (session.shareId !== share.id || session.authEpoch !== share.authEpoch || session.expiresAtMs <= Date.now()) return null;
  return { sessionToken, session };
}

export async function updateSession(sessionToken: string, patch: Partial<ReviewSession>): Promise<void> {
  await adminDb().collection("review_sessions").doc(sha256Hex(sessionToken)).update(patch);
}

/** Gates required before a session may see anything. */
export function remainingGates(share: ReviewShare, session: ReviewSession | null): ("password" | "email")[] {
  const out: ("password" | "email")[] = [];
  if (share.passwordHash && !session?.passwordOk) out.push("password");
  if (share.accessMode === "specific_emails" && !(session?.emailVerified && session.email && share.allowedEmails.includes(session.email))) out.push("email");
  return out;
}

/* ───────────────────────────── request gate ───────────────────────────── */

const jsonError = (error: string, status: number, code: string) => NextResponse.json({ error, code }, { status });

export const clientIp = (request: Request): string =>
  (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim();

export async function limit(key: string, max: number, windowSeconds: number): Promise<NextResponse | null> {
  try {
    await enforceRateLimit(key, max, windowSeconds);
    return null;
  } catch (err) {
    if (err instanceof RateLimitExceededError) return jsonError("Too many attempts. Please try again shortly.", 429, "rate_limited");
    throw err;
  }
}

export function denial(reason: "unavailable" | "expired" | "revoked") {
  if (reason === "expired") return jsonError("This review link has expired.", 410, "expired");
  if (reason === "revoked") return jsonError("This review link is no longer available.", 410, "revoked");
  return jsonError("This review link isn't available.", 404, "unavailable");
}

export interface ShareGate {
  share: ReviewShare;
  file: ShareFile;
  session: ReviewSession;
  sessionToken: string;
}

/**
 * THE gate every sensitive reviewer operation goes through. Resolves the token server-side and
 * enforces, in order: valid token → active (not revoked, not expired) → scope still intact →
 * a reviewer session whose password/email gates are satisfied → (optionally) the requested
 * permission. Nothing a client sends is trusted for workspace/project/file/version — those come
 * from the share.
 */
export async function authorizeShare(
  request: Request,
  token: unknown,
  opts: { permission?: "canComment" | "canApprove" | "canDownload"; needsIdentity?: boolean } = {}
): Promise<{ ok: true; gate: ShareGate } | { ok: false; response: NextResponse }> {
  if (typeof token !== "string") return { ok: false, response: denial("unavailable") };
  const loaded = await loadShareByToken(token);
  if (!loaded.ok) return { ok: false, response: denial(loaded.reason) };
  const found = await readSession(request, loaded.share);
  if (!found || remainingGates(loaded.share, found.session).length > 0) {
    return { ok: false, response: jsonError("Verification is required to open this review.", 401, "auth_required") };
  }
  if (opts.permission && !loaded.share.permissions[opts.permission]) {
    return { ok: false, response: jsonError("This link doesn't allow that action.", 403, "permission_denied") };
  }
  if (opts.needsIdentity && !found.session.displayName) {
    return { ok: false, response: jsonError("Enter your name to continue.", 400, "identity_required") };
  }
  return { ok: true, gate: { share: loaded.share, file: loaded.file, session: found.session, sessionToken: found.sessionToken } };
}

/* ───────────────────────────── scope (versions) ───────────────────────────── */

/** The file document a request may touch for `requestedVersion`: the shared version, or an EARLIER version of the same asset when the link allows it. Anything else → null. */
export async function resolveScopedFile(share: ReviewShare, shared: ShareFile, requestedVersion: unknown): Promise<ShareFile | null> {
  if (requestedVersion === undefined || requestedVersion === null || requestedVersion === share.version) return shared;
  if (!share.permissions.canViewPreviousVersions) return null;
  if (typeof requestedVersion !== "number" || !Number.isInteger(requestedVersion) || requestedVersion < 1 || requestedVersion >= share.version) return null;
  const snap = await adminDb().collection("files").where("assetGroupId", "==", share.assetGroupId).where("versionNumber", "==", requestedVersion).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return null;
  const f = doc.data() as ShareFile;
  if (f.workspaceId !== share.workspaceId || f.projectId !== share.projectId) return null;
  return { ...f, id: doc.id };
}

/* ───────────────────────────── audit / activity / notifications ───────────────────────────── */

export async function writeAudit(share: Pick<ReviewShare, "workspaceId" | "id" | "fileId">, entry: { action: string; actorId: string; actorName: string; details?: Record<string, unknown> }): Promise<void> {
  try {
    const ref = adminDb().collection("audit_logs").doc();
    const now = new Date().toISOString();
    // Never carries passwords, tokens or hashes — only ids and plain facts.
    await ref.set({
      id: ref.id,
      workspaceId: share.workspaceId,
      userId: entry.actorId,
      userName: entry.actorName,
      action: entry.action,
      targetType: "review_share",
      targetId: share.id,
      ipAddress: "Not recorded",
      userAgent: "server",
      previousValue: null,
      newValue: entry.details ? JSON.stringify(entry.details) : null,
      createdAt: now,
      updatedAt: now,
    });
    await adminDb().collection("workspaces").doc(share.workspaceId).collection("activity_logs").add({
      actorId: entry.actorId,
      actorName: entry.actorName,
      action: entry.action.replace(/_/g, " "),
      targetType: "file",
      targetId: share.fileId,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[reviewShare] audit write failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/** Notifies ONLY the person who sent the review (and only if they can still open the project) — never the whole workspace. Idempotent per eventKey. */
export async function notifyRequester(share: ReviewShare, file: ShareFile, eventKey: string, title: string, body: string): Promise<void> {
  try {
    const access = await resolveProjectAccess(share.createdBy, share.workspaceId, share.projectId);
    if (!access.canRead) return;
    const link = file.stageId ? fileReviewRoute(share.projectId, file.stageId, share.fileId) : projectRoute(share.projectId, "reviews");
    await createNotificationOnce(share.workspaceId, share.createdBy, `external_review:${eventKey}`, { title, body, link, type: "external_review", projectId: share.projectId });
  } catch (err) {
    console.error("[reviewShare] notification failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/* ───────────────────────────── DTOs ───────────────────────────── */

const iso = (v: unknown): string => {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") return (v as { toDate: () => Date }).toDate().toISOString();
  return typeof v === "string" ? v : new Date(0).toISOString();
};

/** Maps a stored comment to what a reviewer may see. Internal-only comments (`visibility: "internal"`, reserved for the Team-only phase) are filtered by the caller and never reach this. */
export function toExternalComment(id: string, c: Record<string, unknown>, reviewerId: string): ExternalComment {
  const authorKind = c.authorKind === "external" ? "external" : "member";
  return {
    id,
    authorName: String((c.author as { displayName?: string } | undefined)?.displayName ?? "Unknown"),
    authorKind,
    body: String(c.body ?? ""),
    parentCommentId: (c.parentCommentId as string | null) ?? null,
    isResolved: c.isResolved === true,
    timestampSeconds: (c.timestampSeconds as number | null) ?? null,
    positionX: (c.positionX as number | null) ?? null,
    positionY: (c.positionY as number | null) ?? null,
    pageNumber: (c.pageNumber as number | null) ?? null,
    markerNumber: (c.markerNumber as number | null) ?? null,
    createdAt: iso(c.createdAt),
    isMine: c.authorId === `ext:${reviewerId}`,
  };
}

export const isVisibleToExternal = (c: Record<string, unknown>): boolean => c.visibility !== "internal";
export { iso as isoDate };
