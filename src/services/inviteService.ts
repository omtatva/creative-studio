import { doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth } from "@/lib/firebase/config";
import { workspaceInvitesCol, workspaceInviteDoc } from "@/lib/firebase/firestore";
import { logActivity } from "@/services/activityService";
import { WorkspaceInvite } from "@/types/workspace.types";
import { MemberRole } from "@/types/workspace.types";
import { TaskActor } from "@/types/task.types";

const INVITE_EXPIRY_DAYS = 7;

/**
 * Pending-invite CRUD — see the WorkspaceInvite doc comment in
 * workspace.types.ts for why this is a separate collection rather
 * than a Member doc. This is real, saved, listable Firestore data;
 * actually emailing the invitee is a backend concern this codebase
 * doesn't include — see acceptInvite() for the copy-link-based
 * acceptance flow that closes the loop instead.
 */
export async function createInvite(
  workspaceId: string,
  workspaceName: string,
  email: string,
  role: Exclude<MemberRole, "owner">,
  invitedBy: TaskActor
): Promise<Omit<WorkspaceInvite, "createdAt" | "updatedAt">> {
  const normalizedEmail = email.trim().toLowerCase();
  const docRef = doc(workspaceInvitesCol());
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const invite: Omit<WorkspaceInvite, "createdAt" | "updatedAt"> = {
    id: docRef.id,
    workspaceId,
    workspaceName,
    email: normalizedEmail,
    role,
    invitedBy: invitedBy.uid,
    invitedByName: invitedBy.displayName,
    status: "pending",
    expiresAt,
  };
  await setDoc(docRef, { ...invite, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

  // Best-effort: the invite is already committed above — a failure
  // logging it to the activity feed must never surface as "couldn't
  // create invitation" and hide that the invite genuinely succeeded.
  await logActivity(workspaceId, {
    actorId: invitedBy.uid,
    actorName: invitedBy.displayName,
    action: `invited ${normalizedEmail} to the workspace`,
    targetType: "invite",
    targetId: docRef.id,
  }).catch((err) => console.error("[inviteService] logActivity failed (invite still created):", err));

  return invite;
}

export async function getPendingInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  const q = query(
    workspaceInvitesCol(),
    where("workspaceId", "==", workspaceId),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

/** Used before creating a new invite so a workspace+email pair never ends up with more than one pending invite at a time. */
export async function getPendingInviteForEmail(workspaceId: string, email: string): Promise<WorkspaceInvite | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const q = query(
    workspaceInvitesCol(),
    where("workspaceId", "==", workspaceId),
    where("email", "==", normalizedEmail),
    where("status", "==", "pending")
  );
  const snapshot = await getDocs(q);
  return snapshot.empty ? null : snapshot.docs[0]!.data();
}

/** Every pending invite addressed to the signed-in user's own email, across any workspace — powers the accept-invite landing page. */
export async function getMyPendingInvites(email: string): Promise<WorkspaceInvite[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const q = query(workspaceInvitesCol(), where("email", "==", normalizedEmail), where("status", "==", "pending"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getInviteById(inviteId: string): Promise<WorkspaceInvite | null> {
  const snapshot = await getDoc(workspaceInviteDoc(inviteId));
  return snapshot.exists() ? snapshot.data() : null;
}

/**
 * Calls the server-side Gmail proxy (src/app/api/invites/send/route.ts)
 * to actually deliver the invitation email FROM the caller's own
 * connected Gmail account — see gmailConnectionService.ts. Attaches
 * the caller's real Firebase ID token, which the route independently
 * verifies before doing anything (never trusts a uid from the client)
 * — see verifyRequestAuth in lib/server/firebaseAdmin.ts. Returns an
 * error string on failure instead of throwing, so the caller can show
 * "invite created, but email failed to send" rather than a generic
 * crash — the invite itself stays valid (and shareable via copy-link)
 * either way.
 */
export async function sendInviteEmail(invite: Pick<WorkspaceInvite, "id" | "email" | "workspaceName" | "role" | "invitedByName" | "expiresAt">): Promise<{ ok: boolean; error: string | null }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { ok: false, error: "You must be signed in to send an invitation email." };
    }
    const idToken = await user.getIdToken();
    const response = await fetch("/api/invites/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        inviteId: invite.id,
        email: invite.email,
        workspaceName: invite.workspaceName,
        role: invite.role,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: data?.error ?? "Couldn't send the invitation email." };
    }
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't reach the email service." };
  }
}

/** Flips status to "cancelled" rather than deleting the doc, preserving the invite's audit trail (who invited whom, when). */
export async function cancelInvite(inviteId: string): Promise<void> {
  await updateDoc(workspaceInviteDoc(inviteId), { status: "cancelled", updatedAt: serverTimestamp() });
}

/** Extends expiry and refreshes updatedAt on an existing pending invite instead of creating a duplicate document. Returns the new expiresAt so the caller can pass it straight to sendInviteEmail. */
export async function resendInvite(inviteId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await updateDoc(workspaceInviteDoc(inviteId), { expiresAt, updatedAt: serverTimestamp() });
  return expiresAt;
}

export class MemberQuotaError extends Error {
  code: "MEMBER_LIMIT_REACHED";
  constructor(message: string) {
    super(message);
    this.code = "MEMBER_LIMIT_REACHED";
  }
}

/**
 * Accepts a pending invite addressed to the caller's own email. Now
 * goes through /api/invites/accept (server, Admin SDK) instead of a
 * client writeBatch — that's the ONLY place maxMembers can be checked
 * atomically (Firestore rules have no aggregate-count primitive, and
 * a client-side check-then-write has a race two concurrent
 * acceptances could both slip through). firestore.rules' `members`
 * create rule no longer has an invite-accept branch at all, so a
 * client calling the Firestore SDK directly for this can't succeed
 * regardless.
 *
 * Still marks the user's own profile onboarded server-side (see the
 * route) — same fix as before for Super Admin > Users showing every
 * invited teammate as permanently "Pending."
 */
export async function acceptInvite(invite: WorkspaceInvite, actor: TaskActor): Promise<void> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be signed in.");

  const response = await fetch("/api/invites/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ inviteId: invite.id, displayName: actor.displayName, photoURL: actor.photoURL }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data?.code === "MEMBER_LIMIT_REACHED") throw new MemberQuotaError(data.error);
    throw new Error(typeof data?.error === "string" ? data.error : "Couldn't accept this invitation.");
  }

  await logActivity(invite.workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: "joined the workspace",
    targetType: "member",
    targetId: actor.uid,
  }).catch((err) => console.error("[inviteService] logActivity failed (invite still accepted):", err));
}
