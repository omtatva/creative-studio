import { deleteDoc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { memberDoc, membersCol } from "@/lib/firebase/firestore";
import { logActivity } from "@/services/activityService";
import { getCurrentUser } from "@/lib/firebase/auth";
import { Member, MemberRole } from "@/types/workspace.types";
import { TaskActor } from "@/types/task.types";

/**
 * Workspace membership queries AND mutations (role change, disable/
 * enable, remove) — the Users settings page's data layer. Split
 * from workspaceService so "give me everyone in this workspace" and
 * "create this workspace" stay independently testable/readable.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<Member[]> {
  const q = query(membersCol(), where("workspaceId", "==", workspaceId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function getUserWorkspaceMemberships(userId: string): Promise<Member[]> {
  const q = query(membersCol(), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

async function assertMember(workspaceId: string, uid: string): Promise<Member> {
  const snapshot = await getDoc(memberDoc(workspaceId, uid));
  if (!snapshot.exists()) throw new Error("Member not found in this workspace.");
  return snapshot.data();
}

export async function changeMemberRole(workspaceId: string, uid: string, role: MemberRole, actor: TaskActor): Promise<void> {
  const member = await assertMember(workspaceId, uid);
  await updateDoc(memberDoc(workspaceId, uid), { role, updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `changed ${member.displayName}'s role to ${role}`,
    targetType: "member",
    targetId: uid,
  });
}

export async function setMemberDisabled(workspaceId: string, uid: string, disabled: boolean, actor: TaskActor): Promise<void> {
  const member = await assertMember(workspaceId, uid);
  await updateDoc(memberDoc(workspaceId, uid), { status: disabled ? "suspended" : "active", updatedAt: serverTimestamp() });
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `${disabled ? "disabled" : "re-enabled"} ${member.displayName}`,
    targetType: "member",
    targetId: uid,
  });
}

export async function removeMember(workspaceId: string, uid: string, actor: TaskActor): Promise<void> {
  const member = await assertMember(workspaceId, uid);
  await deleteDoc(memberDoc(workspaceId, uid));
  await logActivity(workspaceId, {
    actorId: actor.uid,
    actorName: actor.displayName,
    action: `removed ${member.displayName} from the workspace`,
    targetType: "member",
    targetId: uid,
  });
  // Removal frees a member slot — resync (never a blind decrement,
  // see workspaceQuota.ts's doc comment) so the next invite acceptance
  // sees accurate capacity. Fire-and-forget: the removal itself
  // already succeeded above regardless of whether this does.
  void resyncMemberCount(workspaceId);
}

async function resyncMemberCount(workspaceId: string): Promise<void> {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const idToken = await currentUser.getIdToken();
    await fetch("/api/workspaces/resync-count", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ workspaceId, metric: "member" }),
    });
  } catch (err) {
    console.error("[userService] member-count resync failed (non-fatal):", err);
  }
}
