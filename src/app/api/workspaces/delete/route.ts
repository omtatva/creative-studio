import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, verifySuperAdminAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { enforceRateLimit, RateLimitExceededError } from "@/lib/server/rateLimit";

export const runtime = "nodejs";

/**
 * Deletes a workspace's ACCESS — every `members/{workspaceId}_*` doc,
 * `settings/{workspaceId}`, and `workspaces/{workspaceId}` — the same
 * access cutoff (not a full data wipe) workspaceService's
 * deleteWorkspaceAccess always did. Moved server-side because
 * firestore.rules now makes `members` deletes server-only (removing a
 * member is Super Admin-only administration): a client-side loop over
 * member docs can no longer work for the workspace's own owner, and
 * letting it would have been a way around that restriction.
 *
 * Authorization: the workspace's own OWNER (the "Delete workspace"
 * control on Settings > Workspace — unchanged behavior) or the Super
 * Admin. Verified here with the Admin SDK from the caller's token and
 * the workspace's real `ownerId`, never from the request body. An
 * Admin/Employee gets 403.
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
    await enforceRateLimit(`workspace-delete:${uid}`, 10, 3600);
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  let body: { workspaceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { workspaceId } = body;
  if (!workspaceId || typeof workspaceId !== "string") {
    return NextResponse.json({ error: "A valid workspaceId is required." }, { status: 400 });
  }

  const workspaceRef = adminDb().collection("workspaces").doc(workspaceId);
  const workspaceSnap = await workspaceRef.get();
  if (!workspaceSnap.exists) {
    return NextResponse.json({ error: "This workspace doesn't exist." }, { status: 404 });
  }

  const isOwner = workspaceSnap.data()?.ownerId === uid;
  if (!isOwner) {
    try {
      await verifySuperAdminAuth(request);
    } catch {
      return NextResponse.json({ error: "Only the workspace owner or the platform Super Admin can delete a workspace." }, { status: 403 });
    }
  }

  const memberSnapshot = await adminDb().collection("members").where("workspaceId", "==", workspaceId).get();
  for (const memberDocSnap of memberSnapshot.docs) {
    await memberDocSnap.ref.delete();
    // Don't leave the (now ex-)member pointing at a workspace that no longer exists — that stale pointer is what produced the
    // dead-end "Couldn't load your workspace" screen on their next sign-in. Only cleared when it still points HERE.
    const memberUid = memberDocSnap.data().userId as string | undefined;
    if (memberUid) {
      const userRef = adminDb().collection("users").doc(memberUid);
      const u = await userRef.get();
      if (u.exists && u.data()?.activeWorkspaceId === workspaceId) await userRef.update({ activeWorkspaceId: null });
    }
  }
  await adminDb().collection("settings").doc(workspaceId).delete();
  await workspaceRef.delete();

  return NextResponse.json({ success: true });
}
