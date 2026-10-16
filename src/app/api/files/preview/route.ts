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
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }
  try {
    await enforceRateLimit(`file-preview:${uid}`, 120, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  let body: { workspaceId?: unknown; fileId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.workspaceId !== "string" || typeof body.fileId !== "string" || !body.workspaceId || !body.fileId) {
    return NextResponse.json({ error: "workspaceId and fileId are required." }, { status: 400 });
  }
  const snap = await adminDb().collection("files").doc(body.fileId).get();
  const file = snap.data();
  if (!snap.exists || !file || file.workspaceId !== body.workspaceId || typeof file.storagePath !== "string") {
    return NextResponse.json({ error: "This file isn't available." }, { status: 404 });
  }
  const access = await resolveProjectAccess(uid, body.workspaceId, file.projectId);
  if (!access.canRead) return NextResponse.json({ error: "You don't have access to this project's files." }, { status: 403 });
  if (!file.storagePath.startsWith(`workspaces/${body.workspaceId}/projects/${file.projectId}/`)) {
    return NextResponse.json({ error: "This file isn't available." }, { status: 404 });
  }

  const ticket = randomBytes(24).toString("hex");
  const expiresAtMs = Date.now() + PREVIEW_TICKET_TTL_MS;
  await adminDb().collection("preview_tickets").doc(ticket).set({
    uid, workspaceId: body.workspaceId, projectId: file.projectId, fileId: snap.id, storagePath: file.storagePath, contentType: file.contentType, expiresAtMs, expireAt: expireAt(expiresAtMs),
  });
  return NextResponse.json({ ticket, expiresAtMs });
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
  if (!/^[0-9a-f]{48}$/.test(ticketId)) return NextResponse.json({ error: "Invalid preview link." }, { status: 400 });

  const snap = await adminDb().collection("preview_tickets").doc(ticketId).get();
  const ticket = snap.data() as { uid: string; workspaceId: string; projectId: string; fileId: string; storagePath: string; contentType: string; expiresAtMs: number } | undefined;
  // EXPIRY IS CHECKED FIRST, from the numeric field — a ticket past its time is refused immediately, whether or not
  // Firestore's TTL sweep has deleted the document yet. Deletion timing is never part of the authorization decision.
  if (!snap.exists || !ticket || !(ticket.expiresAtMs > Date.now())) return NextResponse.json({ error: "This preview has expired. Reload the page." }, { status: 410 });

  const [access, fileSnap] = await Promise.all([
    resolveProjectAccess(ticket.uid, ticket.workspaceId, ticket.projectId),
    adminDb().collection("files").doc(ticket.fileId).get(),
  ]);
  const file = fileSnap.data();
  if (!access.canRead) return NextResponse.json({ error: "You don't have access to this file." }, { status: 403 });
  if (!fileSnap.exists || !file || file.projectId !== ticket.projectId || file.workspaceId !== ticket.workspaceId || file.storagePath !== ticket.storagePath) {
    return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });
  }
  if (!ticket.storagePath.startsWith(`workspaces/${ticket.workspaceId}/projects/${ticket.projectId}/`)) return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });
  return streamStorageObject(request, ticket.storagePath, ticket.contentType);
}
