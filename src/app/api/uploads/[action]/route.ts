import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { isFeatureAllowed, featureDisabledBody } from "@/lib/server/featureAccess";
import { resolveWorkspaceFilePolicy } from "@/lib/server/workspaceEntitlements";
import { WorkspaceQuotaError } from "@/lib/server/workspaceQuota";
import {
  abortMultipart, choosePartSize, completeMultipart, initiateMultipart, listParts, MultipartGone, objectFacts, signPartUrl, type PartInfo,
} from "@/lib/server/gcsMultipart";
import {
  SessionError, assertSessionUsable, closeSession, createSessionWithReservation, deleteObjectQuietly, expireStaleSessions, findResumableSession,
  loadOwnedSession, markCompleting, newSessionId, settleSession, touchSession, SESSION_TTL_MS, type UploadSession,
} from "@/lib/server/uploadSessions";
import { formatFileLimit, isSupportedCreativeType } from "@/lib/constants/creativeFiles";
import { enqueueVideoProcessing } from "@/lib/server/videoProcessing";
import { MB } from "@/lib/constants/uploadPolicy";
import type { MemberRole } from "@/types/workspace.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default part size for a new upload. 64 MB is a provisional default (see docs/large-file-transfer.md — to be re-tuned from fast-network benchmarks). */
const DEFAULT_PART_BYTES = 64 * MB;
const PART_URL_TTL_SECONDS = 30 * 60;
const MAX_URLS_PER_REQUEST = 64;

const bad = (error: string, status = 400, code?: string) => NextResponse.json({ error, ...(code ? { code } : {}) }, { status });
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

/**
 * DIRECT-TO-GCS MULTIPART UPLOADS — the authorization half. NO file bytes ever reach this route: it authenticates, authorizes, checks entitlement and quota,
 * talks to GCS with the server credential (initiate / list parts / complete / abort) and signs short-lived, single-purpose part URLs for the browser.
 *
 *   POST /api/uploads/init      verify user/workspace/project/role/entitlement/quota, reserve storage, create the GCS multipart upload
 *   POST /api/uploads/parts     sign URLs for specific parts (session owner only)
 *   POST /api/uploads/status    what GCS actually holds (resume / progress truth)
 *   POST /api/uploads/complete  verify parts + final object, assemble, settle quota ONCE, create the file record
 *   POST /api/uploads/abort     cancel: abort the GCS upload and release the reservation
 *
 * Switched off with NEXT_PUBLIC_MULTIPART_UPLOADS != "1" (the classic resumable uploader + /api/files/finalize stay available).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (process.env.NEXT_PUBLIC_MULTIPART_UPLOADS !== "1") return bad("Multipart uploads are not enabled.", 404, "MULTIPART_DISABLED");

  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    return bad(err instanceof Error ? err.message : "Authentication failed.", err instanceof AuthVerificationError ? err.status : 401);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }

  try {
    await enforceRateLimit(`upload-${action}:${uid}`, action === "parts" || action === "status" ? 600 : 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return bad(err.message, 429);
    throw err;
  }

  try {
    if (action === "init") return await init(uid, body);
    if (action === "parts") return await parts(uid, body);
    if (action === "status") return await status(uid, body);
    if (action === "complete") return await complete(uid, body);
    if (action === "abort") return await abort(uid, body);
    return bad("Unknown action.", 404);
  } catch (err) {
    if (err instanceof SessionError) return bad(err.message, err.status, err.code);
    if (err instanceof WorkspaceQuotaError) return bad(err.message, 403, err.code);
    console.error(`[uploads/${action}] failed:`, err instanceof Error ? err.message : err);
    return bad("Something went wrong with this upload. Try again in a moment.", 500);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------- init
async function init(uid: string, b: Record<string, unknown>) {
  const workspaceId = str(b.workspaceId, 128);
  const projectId = str(b.projectId, 128);
  const fileName = str(b.fileName, 255);
  const sizeBytes = typeof b.sizeBytes === "number" && Number.isSafeInteger(b.sizeBytes) && b.sizeBytes > 0 ? b.sizeBytes : null;
  const lastModified = typeof b.lastModified === "number" && Number.isFinite(b.lastModified) ? Math.floor(b.lastModified) : 0;
  if (!workspaceId || !projectId || !fileName || !sizeBytes) return bad("workspaceId, projectId, fileName and sizeBytes are required.");
  if (/[\\/\u0000-\u001f]/.test(fileName)) return bad("That file name isn't allowed.");
  const contentType = (typeof b.contentType === "string" && b.contentType.length <= 200 ? b.contentType : "") || "application/octet-stream";
  if (!isSupportedCreativeType(contentType === "application/octet-stream" ? "" : contentType, fileName)) return bad(`"${fileName}" isn't a supported creative file type.`, 415, "UNSUPPORTED_TYPE");

  const newVersionOfId = typeof b.newVersionOfId === "string" && b.newVersionOfId ? b.newVersionOfId : null;
  const stageId = typeof b.stageId === "string" && b.stageId ? b.stageId : null;

  // Project belongs to the workspace; the caller can WRITE it (workspace membership alone never grants project access); not a disabled member.
  const projectSnap = await adminDb().collection("projects").doc(projectId).get();
  if (!projectSnap.exists || projectSnap.data()?.workspaceId !== workspaceId) return bad("This project doesn't belong to this workspace.", 400);
  const [access, memberSnap] = await Promise.all([resolveProjectAccess(uid, workspaceId, projectId), adminDb().collection("members").doc(`${workspaceId}_${uid}`).get()]);
  if (memberSnap.exists && memberSnap.data()?.status === "suspended") return bad("Your access to this workspace is disabled.", 403, "MEMBER_DISABLED");
  if (!access.canWrite) {
    const reason = !access.workspaceRole && !access.isSuperAdmin ? "you're not a member of this workspace" : access.projectRole === "viewer" ? "your role on this project is Viewer" : "you haven't been added to this project";
    return bad(`You don't have permission to upload files to this project — ${reason}.`, 403, "INSUFFICIENT_ROLE");
  }
  const featureId = newVersionOfId ? "files.uploadVersion" : "files.upload";
  if (!access.isSuperAdmin && !(await isFeatureAllowed((access.workspaceRole as MemberRole | null) ?? "member", featureId))) return NextResponse.json(featureDisabledBody(featureId), { status: 403 });

  // New version: derive the chain from the REAL previous record.
  let versionNumber = 1;
  let assetGroupId = "";
  let previousVersionId: string | null = null;
  let resolvedStageId = stageId;
  if (newVersionOfId) {
    const prev = (await adminDb().collection("files").doc(newVersionOfId).get()).data();
    if (!prev || prev.workspaceId !== workspaceId || prev.projectId !== projectId) return bad("The file you're replacing wasn't found in this project.", 404);
    versionNumber = (prev.versionNumber ?? 1) + 1;
    assetGroupId = prev.assetGroupId || newVersionOfId;
    previousVersionId = newVersionOfId;
    resolvedStageId = prev.stageId ?? stageId;
  }
  if (resolvedStageId) {
    const stage = (await adminDb().collection("stages").doc(resolvedStageId).get()).data();
    if (!stage || stage.projectId !== projectId) return bad("That stage doesn't belong to this project.", 400);
  }

  // The effective per-file limit from the one trusted policy (fails CLOSED), checked against the DECLARED size now and the REAL size at completion.
  let policy;
  try {
    policy = await resolveWorkspaceFilePolicy(workspaceId);
  } catch (err) {
    console.error("[uploads/init] couldn't resolve the file policy:", err instanceof Error ? err.message : err);
    return bad("Couldn't verify this workspace's upload limits right now. Try again in a moment.", 503, "ENTITLEMENTS_UNAVAILABLE");
  }
  if (sizeBytes > policy.maxFileBytes) {
    return bad(`This file is ${formatFileLimit(sizeBytes)}, over this workspace's per-file limit of ${formatFileLimit(policy.maxFileBytes)}.`, 413, "FILE_TOO_LARGE");
  }

  const fingerprint = { name: fileName, size: sizeBytes, lastModified };
  await expireStaleSessions(workspaceId);

  // Idempotent: the same person starting the same file again gets the SAME session (no second upload, no second reservation).
  const existing = await findResumableSession(uid, projectId, fingerprint, newVersionOfId);
  if (existing) {
    await touchSession(existing);
    const held = await listParts(existing.objectPath, existing.gcsUploadId).catch(() => [] as PartInfo[]);
    return NextResponse.json(sessionResponse(existing, true, held));
  }

  const sessionId = await newSessionId();
  const fileId = adminDb().collection("files").doc().id;
  const objectPath = `workspaces/${workspaceId}/projects/${projectId}/files/${fileId}/${fileName}`;
  const partSizeBytes = choosePartSize(sizeBytes, typeof b.partSizeBytes === "number" ? b.partSizeBytes : undefined, DEFAULT_PART_BYTES);
  const totalParts = Math.ceil(sizeBytes / partSizeBytes);
  const now = Date.now();

  const gcsUploadId = await initiateMultipart(objectPath, contentType, sessionId);
  const session: UploadSession = {
    sessionId, uid, workspaceId, projectId, fileId, objectPath, gcsUploadId, fileName, contentType, sizeBytes, partSizeBytes, totalParts,
    stageId: resolvedStageId, newVersionOfId, versionNumber, assetGroupId: assetGroupId || fileId, previousVersionId, fingerprint,
    status: "active", reservedBytes: sizeBytes, createdAt: now, updatedAt: now, expiresAt: now + SESSION_TTL_MS,
  };
  try {
    await createSessionWithReservation(session); // quota check + reservation in one transaction
  } catch (err) {
    await abortMultipart(objectPath, gcsUploadId).catch(() => undefined);
    throw err;
  }
  return NextResponse.json(sessionResponse(session, false, []));
}

function sessionResponse(s: UploadSession, resumed: boolean, held: PartInfo[]) {
  return {
    sessionId: s.sessionId, fileId: s.fileId, partSizeBytes: s.partSizeBytes, totalParts: s.totalParts, sizeBytes: s.sizeBytes, expiresAt: s.expiresAt, resumed,
    uploadedParts: held.filter((p) => partIsComplete(s, p)).map((p) => p.partNumber),
  };
}

const expectedPartSize = (s: UploadSession, n: number) => (n < s.totalParts ? s.partSizeBytes : s.sizeBytes - s.partSizeBytes * (s.totalParts - 1));
const partIsComplete = (s: UploadSession, p: PartInfo) => p.partNumber >= 1 && p.partNumber <= s.totalParts && p.size === expectedPartSize(s, p.partNumber);

// ---------------------------------------------------------------------------------------------------------------------------------- parts
async function parts(uid: string, b: Record<string, unknown>) {
  const s = await loadOwnedSession(uid, String(b.sessionId ?? ""));
  assertSessionUsable(s);
  if (s.status !== "active") return bad("This upload is being finalized.", 409, "SESSION_NOT_ACTIVE");
  const numbers = Array.isArray(b.partNumbers) ? b.partNumbers : [];
  if (numbers.length === 0 || numbers.length > MAX_URLS_PER_REQUEST || !numbers.every((n) => Number.isInteger(n) && n >= 1 && n <= s.totalParts)) {
    return bad(`Ask for 1-${MAX_URLS_PER_REQUEST} valid part numbers (1-${s.totalParts}).`);
  }
  await touchSession(s);
  const urls = await Promise.all(
    (numbers as number[]).map(async (n) => ({
      partNumber: n,
      url: await signPartUrl(s.objectPath, s.gcsUploadId, n, PART_URL_TTL_SECONDS),
      offset: (n - 1) * s.partSizeBytes,
      length: expectedPartSize(s, n),
    }))
  );
  return NextResponse.json({ urls, expiresInSeconds: PART_URL_TTL_SECONDS });
}

// ---------------------------------------------------------------------------------------------------------------------------------- status
async function status(uid: string, b: Record<string, unknown>) {
  const s = await loadOwnedSession(uid, String(b.sessionId ?? ""));
  if (s.status === "completed") return NextResponse.json({ status: "completed", fileId: s.resultFileId ?? s.fileId, totalParts: s.totalParts });
  if (s.status !== "active" && s.status !== "completing") return NextResponse.json({ status: s.status, totalParts: s.totalParts });
  if (s.status === "active" && s.expiresAt < Date.now()) return NextResponse.json({ status: "expired", totalParts: s.totalParts });
  let held: PartInfo[] = [];
  try {
    held = await listParts(s.objectPath, s.gcsUploadId);
  } catch (err) {
    if (!(err instanceof MultipartGone)) throw err;
  }
  return NextResponse.json({ status: s.status, totalParts: s.totalParts, partSizeBytes: s.partSizeBytes, uploadedParts: held.filter((p) => partIsComplete(s, p)).map((p) => p.partNumber) });
}

// ---------------------------------------------------------------------------------------------------------------------------------- complete
async function complete(uid: string, b: Record<string, unknown>) {
  const s = await loadOwnedSession(uid, String(b.sessionId ?? ""));
  // Idempotent: a repeated / retried completion (e.g. the network dropped after the server finished) returns the same file.
  if (s.status === "completed") return NextResponse.json({ success: true, fileId: s.resultFileId ?? s.fileId, sizeBytes: s.sizeBytes, alreadyCompleted: true });
  assertSessionUsable(s);

  // Re-check access NOW (the person may have been removed from the project mid-upload).
  const access = await resolveProjectAccess(uid, s.workspaceId, s.projectId);
  if (!access.canWrite) return bad("You no longer have permission to upload to this project.", 403, "INSUFFICIENT_ROLE");

  const bucketName = adminStorage().name;
  const ownBucketUrl = (value: unknown): value is string => {
    if (typeof value !== "string") return false;
    try {
      const u = new URL(value);
      return u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com" && u.pathname.startsWith(`/v0/b/${bucketName}/o/`);
    } catch {
      return false;
    }
  };
  const thumbnailUrl = b.thumbnailUrl == null ? null : ownBucketUrl(b.thumbnailUrl) ? (b.thumbnailUrl as string) : undefined;
  if (thumbnailUrl === undefined) return bad("thumbnailUrl must be a Firebase Storage download URL.");
  const durationSeconds = typeof b.durationSeconds === "number" && Number.isFinite(b.durationSeconds) && b.durationSeconds >= 0 ? b.durationSeconds : null;

  // 1) What GCS actually holds must be EXACTLY the declared parts, each of the declared size — the client's own claim is never used.
  let held: PartInfo[] = [];
  let gone = false;
  try {
    held = await listParts(s.objectPath, s.gcsUploadId);
  } catch (err) {
    if (!(err instanceof MultipartGone)) throw err;
    gone = true; // already assembled by an earlier attempt that died before settling — verified from the object below
  }
  if (!gone) {
    const have = new Set(held.filter((p) => partIsComplete(s, p)).map((p) => p.partNumber));
    const missing: number[] = [];
    for (let n = 1; n <= s.totalParts; n++) if (!have.has(n)) missing.push(n);
    if (missing.length > 0) return NextResponse.json({ error: "Some parts are missing or the wrong size.", code: "PARTS_INCOMPLETE", missingParts: missing.slice(0, 200), missingCount: missing.length }, { status: 409 });
    await markCompleting(s.sessionId);
    const ordered = held.filter((p) => partIsComplete(s, p)).sort((x, y) => x.partNumber - y.partNumber);
    try {
      await completeMultipart(s.objectPath, s.gcsUploadId, ordered);
    } catch (err) {
      if (!(err instanceof MultipartGone)) {
        console.error("[uploads/complete] GCS complete failed:", err instanceof Error ? err.message : err);
        return bad("Couldn't assemble the file. Try completing again.", 502, "GCS_COMPLETE_FAILED");
      }
    }
  }

  // 2) The finished object: it must exist, be OURS (session tag), and be exactly the declared size.
  const facts = await objectFacts(s.objectPath);
  if (!facts || facts.sessionTag !== s.sessionId || facts.size !== s.sizeBytes) {
    if (facts && facts.sessionTag === s.sessionId) await deleteObjectQuietly(s.objectPath);
    await closeSession(s.sessionId, "failed");
    return bad("The uploaded file didn't pass verification (size mismatch). Upload it again.", 409, "VERIFY_FAILED");
  }

  // 3) The per-file policy again, against the REAL size, from the trusted resolver (fails closed).
  let policy;
  try {
    policy = await resolveWorkspaceFilePolicy(s.workspaceId);
  } catch {
    return bad("Couldn't verify this workspace's upload limits right now. Try completing again in a moment.", 503, "ENTITLEMENTS_UNAVAILABLE");
  }
  if (facts.size > policy.maxFileBytes) {
    await deleteObjectQuietly(s.objectPath);
    await closeSession(s.sessionId, "failed");
    return bad(`This file is ${formatFileLimit(facts.size)}, over this workspace's per-file limit of ${formatFileLimit(policy.maxFileBytes)}.`, 413, "FILE_TOO_LARGE");
  }

  // 4) Settle: reservation -> real usage + the file record, one guarded transaction (can only ever happen once).
  const userRecord = await adminDb().collection("members").doc(`${s.workspaceId}_${uid}`).get();
  const result = await settleSession(s.sessionId, facts.size, {
    fileId: s.fileId, workspaceId: s.workspaceId, projectId: s.projectId, fileName: s.fileName, contentType: s.contentType, sizeBytes: facts.size,
    url: "", thumbnailUrl, storagePath: s.objectPath,
    uploadedBy: { uid, displayName: (userRecord.data()?.displayName as string | undefined) ?? undefined, photoURL: (userRecord.data()?.photoURL as string | null | undefined) ?? null, email: (userRecord.data()?.email as string | undefined) ?? undefined },
    stageId: s.stageId, assetGroupId: s.assetGroupId, versionNumber: s.versionNumber, previousVersionId: s.previousVersionId, durationSeconds, uploadMethod: "multipart",
  });
  // Background processing (thumbnail, metadata, playback proxy) starts AFTER the file is final; it never delays or fails this response.
  if (!result.alreadyCompleted) void enqueueVideoProcessing(result.fileId).catch((err) => console.error("[uploads/complete] couldn't queue video processing:", err instanceof Error ? err.message : err));
  return NextResponse.json({ success: true, fileId: result.fileId, sizeBytes: facts.size, alreadyCompleted: result.alreadyCompleted });
}

// ---------------------------------------------------------------------------------------------------------------------------------- abort
async function abort(uid: string, b: Record<string, unknown>) {
  const s = await loadOwnedSession(uid, String(b.sessionId ?? ""));
  if (s.status === "completed") return bad("This upload already completed.", 409, "ALREADY_COMPLETED");
  await closeSession(s.sessionId, "aborted"); // releases the reservation first
  await abortMultipart(s.objectPath, s.gcsUploadId).catch((err) => console.error("[uploads/abort] GCS abort failed:", err instanceof Error ? err.message : err));
  await deleteObjectQuietly(s.objectPath);
  return NextResponse.json({ success: true });
}
