import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestAuth, AuthVerificationError, adminAuth, adminDb } from "@/lib/server/firebaseAdmin";
import { reserveSlot, resyncSlotCount, WorkspaceQuotaError } from "@/lib/server/workspaceQuota";
import { isPlatformSuperAdmin } from "@/lib/server/seats";

export const runtime = "nodejs";

class InviteClaimedError extends Error {}

/** True when `uid` is already a member of the workspace BECAUSE of this very invitation (i.e. a duplicate/retried accept by the same person). */
async function acceptedBy(workspaceId: string, uid: string, inviteId: string): Promise<boolean> {
  const snap = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  return snap.exists && snap.data()?.sourceInviteId === inviteId && snap.data()?.userId === uid;
}

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

  if (invite.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return NextResponse.json({ error: "This invitation was addressed to a different email.", code: "WORKSPACE_ACCESS_DENIED" }, { status: 403 });
  }
  if (invite.status !== "pending") {
    // A duplicate click / retried request for an invitation THIS person just accepted is success, not an error (no second member, no second seat).
    if (invite.status === "accepted" && (await acceptedBy(invite.workspaceId, uid, inviteId))) {
      return NextResponse.json({ success: true, workspaceId: invite.workspaceId, alreadyAccepted: true });
    }
    return invite.status === "cancelled"
      ? NextResponse.json({ error: "This invitation was cancelled.", code: "INVITE_CANCELLED" }, { status: 409 })
      : NextResponse.json({ error: "This invitation has already been used.", code: "INVITE_ALREADY_USED" }, { status: 409 });
  }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  }

  const { workspaceId, role } = invite;

  // An invitation is addressed to an EMAIL ADDRESS, so it can only be claimed by someone who has proven they own it. Re-read the auth
  // record (the ID token's own email_verified claim can be up to an hour stale) — an unverified account that merely typed this address
  // at sign-up must not be able to join the workspace.
  try {
    const authUser = await adminAuth().getUser(uid);
    // The decision rests ONLY on this server-side read of the Firebase Auth record — never on a flag, claim or field the browser sent. The record's CURRENT
    // address must also still be the invited one (the ID token's copy can be stale after an address change).
    if (!authUser.emailVerified) {
      return NextResponse.json({ error: "Verify your email address first (check your inbox for the verification link), then accept this invitation.", code: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    if ((authUser.email ?? "").trim().toLowerCase() !== invite.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "This invitation was addressed to a different email.", code: "WORKSPACE_ACCESS_DENIED" }, { status: 403 });
    }
  } catch (err) {
    console.error("[invites/accept] couldn't read the auth record:", err);
    return NextResponse.json({ error: "Couldn't verify your email address. Try again in a moment." }, { status: 503 });
  }

  // The workspace's own "Allowed email domains" security setting (empty = anyone). Enforced here, on the server, at the moment of joining.
  const settingsSnap = await adminDb().collection("settings").doc(workspaceId).get();
  const allowedDomains: string[] = (settingsSnap.data()?.security?.allowedEmailDomains ?? []).filter((d: unknown): d is string => typeof d === "string" && d.trim().length > 0).map((d: string) => d.trim().toLowerCase().replace(/^@/, ""));
  if (allowedDomains.length > 0 && !allowedDomains.includes(email.trim().toLowerCase().split("@").pop() ?? "")) {
    return NextResponse.json({ error: `This workspace only accepts members with an email at: ${allowedDomains.join(", ")}.`, code: "EMAIL_DOMAIN_NOT_ALLOWED" }, { status: 403 });
  }

  // Someone who already belongs to this workspace must not take a second seat or have their role overwritten by an invitation (a retry of THIS invitation
  // is handled above/below as success).
  const existingMember = await adminDb().collection("members").doc(`${workspaceId}_${uid}`).get();
  if (existingMember.exists) {
    if (existingMember.data()?.sourceInviteId === inviteId) return NextResponse.json({ success: true, workspaceId, alreadyAccepted: true });
    return NextResponse.json({ error: "You already belong to this workspace.", code: "ALREADY_MEMBER" }, { status: 409 });
  }

  try {
    // Seats are ACTIVE members only. The counter is re-synced to the real active count first, so a value left over from before disabled members stopped
    // holding seats can't wrongly refuse (or allow) this acceptance; the reservation itself is still the atomic check.
    if (!(await isPlatformSuperAdmin(uid))) {
      await resyncSlotCount(workspaceId, "member").catch(() => undefined);
      await reserveSlot(workspaceId, "member");
    }
  } catch (err) {
    if (err instanceof WorkspaceQuotaError) {
      // The seat limit is re-checked atomically HERE, at acceptance, regardless of how many invitations were sent earlier.
      const code = err.code === "MEMBER_LIMIT_REACHED" ? "WORKSPACE_MEMBER_LIMIT_REACHED" : err.code;
      return NextResponse.json({ error: err.message, code }, { status: 403 });
    }
    console.error("[invites/accept] quota reservation failed:", err);
    return NextResponse.json({ error: "Couldn't verify this workspace's member quota. Try again in a moment.", code: "SUBSCRIPTION_INACTIVE" }, { status: 503 });
  }

  const memberRef = adminDb().collection("members").doc(`${workspaceId}_${uid}`);
  try {
    // Claiming the invitation and creating the member are ONE atomic step: of two concurrent requests (double click, retry), exactly one wins.
    await adminDb().runTransaction(async (tx) => {
      const [current, memberNow] = await Promise.all([tx.get(inviteRef), tx.get(memberRef)]);
      if (current.data()?.status !== "pending" || memberNow.exists) throw new InviteClaimedError();
      tx.set(memberRef, {
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
      tx.update(inviteRef, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.set(adminDb().collection("users").doc(uid), { onboardingComplete: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
  } catch (err) {
    if (err instanceof InviteClaimedError) {
      // Lost the race: the seat reserved above is returned by a recount, and a duplicate from the SAME person is reported as success.
      await resyncSlotCount(workspaceId, "member").catch(() => undefined);
      if (await acceptedBy(workspaceId, uid, inviteId)) return NextResponse.json({ success: true, workspaceId, alreadyAccepted: true });
      return NextResponse.json({ error: "This invitation has already been used.", code: "INVITE_ALREADY_USED" }, { status: 409 });
    }
    console.error("[invites/accept] member creation failed after reserving a slot — resyncing count:", err);
    await resyncSlotCount(workspaceId, "member").catch((resyncErr) => console.error("[invites/accept] resync-after-failure also failed:", resyncErr));
    return NextResponse.json({ error: "Couldn't accept this invitation. Try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true, workspaceId });
}
