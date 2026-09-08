import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminDb } from "@/lib/server/firebaseAdmin";
import { reserveSlot, resyncSlotCount, WorkspaceQuotaError } from "@/lib/server/workspaceQuota";

export const runtime = "nodejs";

interface AcceptInviteRequestBody {
  inviteId: string;
  displayName: string;
  photoURL: string | null;
}

/**
 * The ONLY way a member doc is created via invite acceptance now —
 * see firestore.rules' `members` collection, whose `create` rule no
 * longer has the invite-accept branch (the owner-bootstrap branch for
 * a brand-new workspace's very first member is untouched — that path
 * never needs quota enforcement, since it's always exactly one).
 *
 * Mirrors the exact validity checks the old client-side
 * isValidInviteAccept() Firestore-rule helper enforced (workspace
 * match, role match, pending status, email match — using the CALLER'S
 * OWN server-verified token email, never a client-supplied one) and
 * additionally checks expiresAt, which the old rule never did (a
 * pre-existing gap noticed while replacing this path, fixed as a
 * natural side effect — not a separate scope of work).
 */
export async function POST(request: NextRequest) {
  let uid: string;
  let email: string | null;
  try {
    ({ uid, email } = await verifyRequestAuth(request));
  } catch (err) {
    const status = err instanceof AuthVerificationError ? err.status : 401;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Authentication failed.", code: "WORKSPACE_ACCESS_DENIED" }, { status });
  }
  if (!email) {
    return NextResponse.json({ error: "Your account has no email on file." }, { status: 400 });
  }

  let body: AcceptInviteRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { inviteId } = body;
  if (!inviteId) {
    return NextResponse.json({ error: "inviteId is required." }, { status: 400 });
  }

  const inviteRef = adminDb().collection("workspace_invites").doc(inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    return NextResponse.json({ error: "This invitation no longer exists." }, { status: 404 });
  }
  const invite = inviteSnap.data() as { workspaceId: string; email: string; role: string; status: string; expiresAt: string };

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "This invitation has already been used or cancelled." }, { status: 409 });
  }
  if (invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "This invitation was addressed to a different email.", code: "WORKSPACE_ACCESS_DENIED" }, { status: 403 });
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  }

  const { workspaceId, role } = invite;

  try {
    await reserveSlot(workspaceId, "member");
  } catch (err) {
    if (err instanceof WorkspaceQuotaError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
    }
    console.error("[invites/accept] quota reservation failed:", err);
    return NextResponse.json({ error: "Couldn't verify this workspace's member quota. Try again in a moment.", code: "SUBSCRIPTION_INACTIVE" }, { status: 503 });
  }

  const memberRef = adminDb().collection("members").doc(`${workspaceId}_${uid}`);
  try {
    const batch = adminDb().batch();
    batch.set(memberRef, {
      id: `${workspaceId}_${uid}`,
      workspaceId,
      userId: uid,
      role,
      email,
      displayName: body.displayName || "Unknown",
      photoURL: body.photoURL ?? null,
      status: "active",
      sourceInviteId: inviteId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.update(inviteRef, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    batch.set(adminDb().collection("users").doc(uid), { onboardingComplete: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.error("[invites/accept] member creation failed after reserving a slot — resyncing count:", err);
    await resyncSlotCount(workspaceId, "member").catch((resyncErr) => console.error("[invites/accept] resync-after-failure also failed:", resyncErr));
    return NextResponse.json({ error: "Couldn't accept this invitation. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspaceId });
}
