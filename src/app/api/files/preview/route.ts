import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { streamStorageObject } from "@/lib/server/mediaStream";
import { expireAt, PREVIEW_TICKET_TTL_MS } from "@/lib/server/ttl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every failure carries a machine-readable `code` (TICKET_CREATE_FAILED, UNAUTHORIZED, PROJECT_ACCESS_DENIED, FILE_NOT_FOUND,
 * STORAGE_PATH_MISSING, TICKET_EXPIRED, INVALID_TICKET, UNSUPPORTED_MEDIA, STORAGE_OBJECT_NOT_FOUND, RANGE_ERROR, STREAM_ERROR) so the
 * player — and a developer — can tell WHICH step failed instead of a generic "couldn't load". The user-facing message stays friendly;
 * the underlying exception text is added only outside production, and never anything secret (no tokens, tickets, paths or URLs).
 */
function fail(status: number, code: string, error: string, cause?: unknown) {
  const detail = process.env.NODE_ENV !== "production" && cause ? (cause instanceof Error ? cause.message : String(cause)).slice(0, 200) : undefined;
  if (cause) console.error(`[files/preview] ${code}:`, cause instanceof Error ? cause.message : cause);
  return NextResponse.json({ error, code, ...(detail ? { detail } : {}) }, { status });
}

/**
 * Issues a PREVIEW ticket for ONE file — the normal (single-version) review player's replacement for the permanent
 * Firebase token URL in `file.url`. Authorization is from real records: signed in, the file exists in this workspace,
 * and the caller has PROJECT access (workspace membership alone is not enough). Previewing is not downloading:
 * nothing here consults or grants `files.download` (downloads keep their own route and permission).
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return fail(status, "UNAUTHORIZED", err instanceof Error ? err.message : "Authentication failed.");
  }
  try {
    await enforceRateLimit(`file-preview:${uid}`, 120, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return fail(429, "RATE_LIMITED", err.message);
    return fail(500, "TICKET_CREATE_FAILED", "Couldn't load the preview.", err);
  }

  let body: { workspaceId?: unknown; fileId?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_REQUEST", "Invalid request body.");
  }
  if (typeof body.workspaceId !== "string" || typeof body.fileId !== "string" || !body.workspaceId || !body.fileId) {
    return fail(400, "INVALID_REQUEST", "workspaceId and fileId are required.");
  }
  try {
    const snap = await adminDb().collection("files").doc(body.fileId).get();
    const file = snap.data();
    if (!snap.exists || !file || file.workspaceId !== body.workspaceId) return fail(404, "FILE_NOT_FOUND", "This file isn't available.");
    // The authoritative Storage object path is `storagePath` (what /api/files/finalize records). The permanent `url` is NEVER used or derived from.
    if (typeof file.storagePath !== "string" || !file.storagePath) return fail(404, "STORAGE_PATH_MISSING", "This file has no stored media path.");
    const access = await resolveProjectAccess(uid, body.workspaceId, file.projectId);
    if (!access.canRead) return fail(403, "PROJECT_ACCESS_DENIED", "You don't have access to this project's files.");
    if (!file.storagePath.startsWith(`workspaces/${body.workspaceId}/projects/${file.projectId}/`)) return fail(404, "STORAGE_PATH_MISSING", "This file isn't available.");

    const ticket = randomBytes(24).toString("hex");
    const expiresAtMs = Date.now() + PREVIEW_TICKET_TTL_MS; // milliseconds, compared with Date.now() on every GET
    await adminDb().collection("preview_tickets").doc(ticket).set({
      uid, workspaceId: body.workspaceId, projectId: file.projectId, fileId: snap.id, storagePath: file.storagePath, contentType: file.contentType ?? "application/octet-stream", expiresAtMs, expireAt: expireAt(expiresAtMs),
    });
    return NextResponse.json({ ticket, expiresAtMs });
  } catch (err) {
    // Typically a LOCAL configuration problem (e.g. Firebase Admin credentials), not an authorization decision — surfaced as such, in JSON.
    return fail(500, "TICKET_CREATE_FAILED", "Couldn't load the preview.", err);
  }
}

/**
 * Streams a PREVIEW for a signed-in user (see POST above and POST /api/files/compare). A <video>
 * element can't send an Authorization header, so the ticket in the URL stands in
 * for it — but it is NOT the authorization: every request (including each Range
 * request while scrubbing) re-checks that the ticket's owner STILL has project
 * access and that the file STILL exists in that project. Remove someone from the
 * project and their next media request fails, instead of a copied URL working
 * "forever" the way a Firebase token URL does. Multi-use within its life (playback
 * needs many requests), unlike single-use download tickets. Serves INLINE-previewable
 * types only — anything else is refused (415) so the preview route can never act as a
 * back door around the download permission.
 */
export async function GET(request: NextRequest) {
  const ticketId = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(ticketId)) return fail(400, "INVALID_TICKET", "Invalid preview link.");

  try {
  const snap = await adminDb().collection("preview_tickets").doc(ticketId).get();
  const ticket = snap.data() as { uid: string; workspaceId: string; projectId: string; fileId: string; storagePath: string; contentType: string; expiresAtMs: number } | undefined;
  // EXPIRY IS CHECKED FIRST, from the numeric field — a ticket past its time is refused immediately, whether or not
  // Firestore's TTL sweep has deleted the document yet. Deletion timing is never part of the authorization decision.
  if (!snap.exists || !ticket || !(ticket.expiresAtMs > Date.now())) return fail(410, "TICKET_EXPIRED", "This preview has expired. Reload the page.");

  const [access, fileSnap] = await Promise.all([
    resolveProjectAccess(ticket.uid, ticket.workspaceId, ticket.projectId),
    adminDb().collection("files").doc(ticket.fileId).get(),
  ]);
  const file = fileSnap.data();
  if (!access.canRead) return fail(403, "PROJECT_ACCESS_DENIED", "You don't have access to this file.");
  if (!fileSnap.exists || !file || file.projectId !== ticket.projectId || file.workspaceId !== ticket.workspaceId || file.storagePath !== ticket.storagePath) {
    return fail(404, "FILE_NOT_FOUND", "This file is no longer available.");
  }
  if (!ticket.storagePath.startsWith(`workspaces/${ticket.workspaceId}/projects/${ticket.projectId}/`)) return fail(404, "STORAGE_PATH_MISSING", "This file is no longer available.");
  return await streamStorageObject(request, ticket.storagePath, ticket.contentType);
  } catch (err) {
    return fail(500, "STREAM_ERROR", "Couldn't load the preview.", err);
  }
}
