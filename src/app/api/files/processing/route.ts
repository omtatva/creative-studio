import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";
import { resolveProjectAccess } from "@/lib/server/projectAccess";
import { retryVideoProcessing } from "@/lib/server/videoProcessing";

export const runtime = "nodejs";

/**
 * POST { workspaceId, fileId, action: "retry" } — re-queue background processing of a FAILED video. Needs write access to the file's project (the same people who
 * could have uploaded it). Processing never changes the original file; this only (re)creates its playback derivatives.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status: err instanceof AuthVerificationError ? err.status : 401 });
  }
  try {
    await enforceRateLimit(`file-processing:${uid}`, 20, 60);
  } catch (err) {
    if (err instanceof RateLimitExceededError) return NextResponse.json({ error: err.message }, { status: 429 });
    throw err;
  }
  let body: { workspaceId?: unknown; fileId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.workspaceId !== "string" || typeof body.fileId !== "string" || body.action !== "retry") return NextResponse.json({ error: "workspaceId, fileId and action \"retry\" are required." }, { status: 400 });

  const file = (await adminDb().collection("files").doc(body.fileId).get()).data();
  if (!file || file.workspaceId !== body.workspaceId) return NextResponse.json({ error: "This file isn't available." }, { status: 404 });
  const access = await resolveProjectAccess(uid, body.workspaceId, file.projectId);
  if (!access.canWrite) return NextResponse.json({ error: "You don't have permission to do this.", code: "INSUFFICIENT_ROLE" }, { status: 403 });

  const refusal = await retryVideoProcessing(body.fileId);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  return NextResponse.json({ success: true });
}
