import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Readable } from "stream";
import { verifyRequestAuth, AuthVerificationError, adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { isFeatureAllowed, featureDisabledBody } from "@/lib/server/featureAccess";
import type { MemberRole } from "@/types/workspace.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 60_000;

type DownloadRequest =
  | { kind: "file"; workspaceId: string; fileId: string }
  | { kind: "attachment"; workspaceId: string; taskId: string; attachmentId: string; versionNumber?: number };

interface Target {
  projectId: string;
  storagePath: string;
  fileName: string;
  contentType: string;
}

/** The one place a downloadable object is resolved from a real record — never from a client-supplied path or URL. */
async function resolveTarget(req: DownloadRequest): Promise<Target | { error: string; status: number }> {
  if (req.kind === "file") {
    const snap = await adminDb().collection("files").doc(req.fileId).get();
    const file = snap.data();
    if (!snap.exists || !file || file.workspaceId !== req.workspaceId) return { error: "This file is no longer available.", status: 404 };
    return { projectId: file.projectId, storagePath: file.storagePath, fileName: file.fileName, contentType: file.contentType };
  }
  const taskSnap = await adminDb().collection("tasks").doc(req.taskId).get();
  const task = taskSnap.data();
  if (!taskSnap.exists || !task || task.workspaceId !== req.workspaceId) return { error: "This file is no longer available.", status: 404 };
  const attSnap = await adminDb().collection("tasks").doc(req.taskId).collection("attachments").doc(req.attachmentId).get();
  const attachment = attSnap.data() as { fileName: string; contentType: string; versions: { versionNumber: number; storagePath: string }[] } | undefined;
  if (!attSnap.exists || !attachment) return { error: "This file is no longer available.", status: 404 };
  const version = req.versionNumber ? attachment.versions.find((v) => v.versionNumber === req.versionNumber) : attachment.versions[attachment.versions.length - 1];
  if (!version) return { error: "That version doesn't exist.", status: 404 };
  return { projectId: task.projectId, storagePath: version.storagePath, fileName: attachment.fileName, contentType: attachment.contentType };
}

/**
 * Authorizes ONE download: the caller must be authenticated, and have
 * project access (workspace membership alone is never enough), and the
 * workspace's Feature Access matrix must allow `files.download` for their
 * role. Shared by the ticket-issuing POST and the streaming GET so the
 * two can't drift.
 */
async function authorize(uid: string, workspaceId: string, projectId: string): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const access = await resolveProjectAccess(uid, workspaceId, projectId);
  if (!access.canRead) {
    return { ok: false, response: NextResponse.json({ error: "You don't have access to this project's files.", code: "INSUFFICIENT_ROLE" }, { status: 403 }) };
  }
  if (!access.isSuperAdmin && !(await isFeatureAllowed((access.workspaceRole as MemberRole | null) ?? "member", "files.download"))) {
    return { ok: false, response: NextResponse.json(featureDisabledBody("files.download"), { status: 403 }) };
  }
  return { ok: true };
}

/**
 * STEP 1 — POST (Bearer-authenticated): verifies access, then issues a
 * 60-second, SINGLE-USE ticket bound to the caller and the exact
 * file/version. A plain browser navigation can't carry an Authorization
 * header, so the ticket is how the authorized decision reaches step 2.
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
    await enforceRateLimit(`file-download:${uid}`, 60, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }

  let body: DownloadRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const valid =
    body && typeof body.workspaceId === "string" && body.workspaceId &&
    ((body.kind === "file" && typeof body.fileId === "string" && body.fileId) ||
      (body.kind === "attachment" && typeof body.taskId === "string" && body.taskId && typeof body.attachmentId === "string" && body.attachmentId));
  if (!valid) return NextResponse.json({ error: "Invalid download request." }, { status: 400 });

  const target = await resolveTarget(body);
  if ("error" in target) return NextResponse.json({ error: target.error }, { status: target.status });
  if (!target.storagePath.startsWith(`workspaces/${body.workspaceId}/`)) return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });

  const auth = await authorize(uid, body.workspaceId, target.projectId);
  if (!auth.ok) return auth.response;

  const [exists] = await adminStorage().file(target.storagePath).exists();
  if (!exists) return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });

  const ticket = randomBytes(24).toString("hex");
  await adminDb().collection("download_tickets").doc(ticket).set({
    uid,
    workspaceId: body.workspaceId,
    projectId: target.projectId,
    storagePath: target.storagePath,
    fileName: target.fileName,
    contentType: target.contentType,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  return NextResponse.json({ ticket, fileName: target.fileName });
}

const safeAsciiName = (name: string) => name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\/;]/g, "_").slice(0, 180) || "download";

/**
 * STEP 2 — GET ?t=<ticket>: consumes the ticket (single use), RE-CHECKS
 * the access the ticket was issued for (so a member removed in the last
 * minute is refused), and streams the exact object as an attachment. The
 * bytes pass through the server — the permanent Firebase token URL is
 * never handed out by this route.
 */
export async function GET(request: NextRequest) {
  const ticketId = request.nextUrl.searchParams.get("t") ?? "";
  if (!/^[0-9a-f]{48}$/.test(ticketId)) return NextResponse.json({ error: "Invalid download link." }, { status: 400 });

  const ref = adminDb().collection("download_tickets").doc(ticketId);
  const ticket = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref); // single use, valid or not
    return snap.data() as { uid: string; workspaceId: string; projectId: string; storagePath: string; fileName: string; contentType: string; expiresAt: number };
  });
  if (!ticket || ticket.expiresAt < Date.now()) return NextResponse.json({ error: "This download link has expired. Try again." }, { status: 410 });

  const auth = await authorize(ticket.uid, ticket.workspaceId, ticket.projectId);
  if (!auth.ok) return auth.response;

  const file = adminStorage().file(ticket.storagePath);
  const [exists] = await file.exists();
  if (!exists) return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });
  const [metadata] = await file.getMetadata();

  const headers = new Headers({
    "Content-Type": ticket.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeAsciiName(ticket.fileName)}"; filename*=UTF-8''${encodeURIComponent(ticket.fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (metadata.size) headers.set("Content-Length", String(metadata.size));
  return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream, { headers });
}
