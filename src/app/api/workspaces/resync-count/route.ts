import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { resyncSlotCount, type QuotaMetric } from "@/lib/server/workspaceQuota";

export const runtime = "nodejs";

/**
 * Recomputes workspaces/{id}.projectCount or .memberCount from a real
 * aggregate count — called (best-effort, fire-and-forget from the
 * client) after archiving/restoring-a-failure-cleanup/deleting a
 * project, or removing a member. Deliberately NOT a "decrement by 1"
 * endpoint — see workspaceQuota.ts's resyncSlotCount doc comment for
 * why: an absolute resync has no abuse surface (calling it any number
 * of times just converges the counter to the truth), while a blind
 * decrement callable independent of a real state change would let a
 * client fabricate free capacity.
 *
 * Low-privilege on purpose: any real member of the workspace may
 * trigger a resync for it (this can only ever make the counter MORE
 * accurate, never grant anything), unlike reserveSlot's role checks,
 * which gate an actual creation.
 */
export async function POST(request: NextRequest) {
  let uid: string;
  try {
    ({ uid } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed." }, { status });
  }

  let body: { workspaceId?: string; metric?: QuotaMetric };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { workspaceId, metric } = body;
  if (!workspaceId || (metric !== "project" && metric !== "member")) {
    return NextResponse.json({ error: "A valid workspaceId and metric ('project' or 'member') are required." }, { status: 400 });
  }

  const memberSnap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "You aren't a member of this workspace.", code: "WORKSPACE_ACCESS_DENIED" }, { status: 403 });
  }

  try {
    await resyncSlotCount(workspaceId, metric);
  } catch (err) {
    console.error("[workspaces/resync-count] failed:", err);
    return NextResponse.json({ error: "Couldn't resync this workspace's count." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
