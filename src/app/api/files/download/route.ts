import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { verifyRequestAuth, AuthVerificationError, adminDb, adminStorage } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { isFeatureAllowed, featureDisabledBody } from "@/lib/server/featureAccess";
import type { MemberRole } from "@/types/workspace.types";
import { shareAllowsDownload } from "@/lib/server/reviewShare";
import { expireAt } from "@/lib/server/ttl";
import { signOriginalDownloadUrl, DIRECT_URL_TTL_MS, contentDisposition } from "@/lib/server/directDownload";
import { downloadEventId, recordDownloadStarted, resolveDownload, EXTERNAL_BUCKET } from "@/lib/server/downloadHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 60_000;


type DownloadRequest =
  | { kind: "file"; workspaceId: string; fileId: string; requestId?: string }
  | { kind: "attachment"; workspaceId: string; taskId: string; attachmentId: string; versionNumber?: number; requestId?: string };

interface Target {
  projectId: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  /** for download history */
  fileId: string | null;
  taskId: string | null;
  attachmentId: string | null;
  assetGroupId: string | null;
  versionNumber: number | null;
  sizeBytes: number | null;
}

/** The one place a downloadable object is resolved from a real record — never from a client-supplied path or URL. */
async function resolveTarget(req: DownloadRequest): Promise<Target | { error: string; status: number }> {
  if (req.kind === "file") {
    const snap = await adminDb().collection("files").doc(req.fileId).get();
    const file = snap.data();
    if (!snap.exists || !file || file.workspaceId !== req.workspaceId) return { error: "This file is no longer available.", status: 404 };
    return {
      projectId: file.projectId, storagePath: file.storagePath, fileName: file.fileName, contentType: file.contentType,
      fileId: req.fileId, taskId: null, attachmentId: null, assetGroupId: file.assetGroupId ?? null,
      versionNumber: typeof file.versionNumber === "number" ? file.versionNumber : null, sizeBytes: typeof file.sizeBytes === "number" ? file.sizeBytes : null,
    };
  }
  const taskSnap = await adminDb().collection("tasks").doc(req.taskId).get();
  const task = taskSnap.data();
  if (!taskSnap.exists || !task || task.workspaceId !== req.workspaceId) return { error: "This file is no longer available.", status: 404 };
  const attSnap = await adminDb().collection("tasks").doc(req.taskId).collection("attachments").doc(req.attachmentId).get();
  const attachment = attSnap.data() as { fileName: string; contentType: string; versions: { versionNumber: number; storagePath: string }[] } | undefined;
  if (!attSnap.exists || !attachment) return { error: "This file is no longer available.", status: 404 };
  const version = req.versionNumber ? attachment.versions.find((v) => v.versionNumber === req.versionNumber) : attachment.versions[attachment.versions.length - 1];
  if (!version) return { error: "That version doesn't exist.", status: 404 };
  return {
    projectId: task.projectId, storagePath: version.storagePath, fileName: attachment.fileName, contentType: attachment.contentType,
    fileId: null, taskId: req.taskId, attachmentId: req.attachmentId, assetGroupId: null, versionNumber: version.versionNumber, sizeBytes: null,
  };
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

  // DIRECT download (default): a short-lived signed GCS URL for this ONE original object (authorization was just verified above). Falls back to the ticketed,
  // proxied stream below when signing is unavailable. Kill switch: DIRECT_DOWNLOADS=0. See lib/server/directDownload.ts.
  const directUrl = await signOriginalDownloadUrl(target.storagePath, target.fileName, target.contentType);

  // DOWNLOAD HISTORY: only now — after authentication, project access, the files.download permission and the existence check have all passed — is an event recorded.
  // Status "started": issuing a URL/ticket is NOT a completed download. A direct download stays "started" (the server can't see the bytes); a proxied one is resolved to
  // completed / cancelled / failed / expired by the streaming GET below.
  const targetKey = body.kind === "file" ? `file:${body.fileId}` : `att:${body.taskId}/${body.attachmentId}/${target.versionNumber}`;
  const downloadId = downloadEventId(uid, targetKey, body.requestId, Date.now());
  await recordDownloadStarted({
    id: downloadId, actorType: "member", uid, workspaceId: body.workspaceId, projectId: target.projectId, kind: body.kind,
    fileId: target.fileId, taskId: target.taskId, attachmentId: target.attachmentId, assetGroupId: target.assetGroupId,
    versionNumber: target.versionNumber, fileName: target.fileName, sizeBytes: target.sizeBytes, method: directUrl ? "direct" : "proxy",
  });
  if (directUrl) return NextResponse.json({ url: directUrl, direct: true, fileName: target.fileName, expiresInSeconds: DIRECT_URL_TTL_MS / 1000, downloadId });

  const ticket = randomBytes(24).toString("hex");
  await adminDb().collection("download_tickets").doc(ticket).set({
    uid,
    workspaceId: body.workspaceId,
    projectId: target.projectId,
    storagePath: target.storagePath,
    fileName: target.fileName,
    contentType: target.contentType,
    downloadId,
    expiresAt: Date.now() + TICKET_TTL_MS,
    expireAt: expireAt(Date.now() + TICKET_TTL_MS),
  });
  return NextResponse.json({ ticket, fileName: target.fileName, downloadId });
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
    return snap.data() as { uid: string; workspaceId: string; projectId: string; storagePath: string; fileName: string; contentType: string; expiresAt: number; shareId?: string; downloadId?: string };
  });
  // History bucket of this ticket's event (external reviewers' events live in the reserved bucket, never under a member's feed).
  const bucketKey = ticket ? (ticket.shareId ? EXTERNAL_BUCKET : ticket.uid) : "";
  const settle = (status: "completed" | "cancelled" | "failed" | "expired", reason: string | null) =>
    ticket?.downloadId ? resolveDownload(ticket.workspaceId, bucketKey, ticket.downloadId, status, reason) : Promise.resolve(false);
  if (!ticket || ticket.expiresAt < Date.now()) {
    await settle("expired", "ticket_expired");
    return NextResponse.json({ error: "This download link has expired. Try again." }, { status: 410 });
  }

  if (ticket.shareId) {
    // An EXTERNAL REVIEWER's ticket (see /api/review/download): authorized by the share, not by
    // workspace/project membership. Re-checked at redemption, so a link revoked/expired (or whose
    // download permission was switched off) in the last minute is refused.
    if (!(await shareAllowsDownload(ticket.shareId))) {
      await settle("failed", "access_revoked");
      return NextResponse.json({ error: "This download isn't available." }, { status: 403 });
    }
  } else {
    const auth = await authorize(ticket.uid, ticket.workspaceId, ticket.projectId);
    if (!auth.ok) {
      await settle("failed", "access_revoked");
      return auth.response;
    }
  }

  const file = adminStorage().file(ticket.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    await settle("failed", "missing");
    return NextResponse.json({ error: "This file is no longer available." }, { status: 404 });
  }
  const [metadata] = await file.getMetadata();

  const headers = new Headers({
    "Content-Type": ticket.contentType || "application/octet-stream",
    "Content-Disposition": contentDisposition(ticket.fileName),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (metadata.size) headers.set("Content-Length", String(metadata.size));
  // Stream by hand so the OUTCOME is observable: "completed" only when every byte of the object was delivered (count == object size); a client that goes away mid-stream
  // is "cancelled"; a broken read is "failed".
  const expectedBytes = metadata.size ? Number(metadata.size) : null;
  const source = file.createReadStream();
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      source.on("data", (chunk: Buffer) => {
        sent += chunk.length;
        controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length));
        if ((controller.desiredSize ?? 1) <= 0) source.pause();
      });
      source.on("end", () => {
        controller.close();
        void (expectedBytes === null || sent === expectedBytes ? settle("completed", null) : settle("failed", "short_read"));
      });
      source.on("error", (err) => {
        controller.error(err);
        void settle("failed", "stream_error");
      });
    },
    pull() { source.resume(); },
    cancel() { source.destroy(); void settle("cancelled", "client_closed"); },
  });
  return new Response(stream, { headers });
}
