import { getDocs, query, where } from "firebase/firestore";
import { membersCol } from "@/lib/firebase/firestore";
import { getCurrentUser } from "@/lib/firebase/auth";
import { Member, MemberRole } from "@/types/workspace.types";

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

/**
 * Workspace member ADMINISTRATION — change role, disable/restore,
 * remove — is Super Admin only and runs on the server
 * (/api/workspaces/members, authorized with the platform Super Admin
 * mechanism; firestore.rules makes `members` update/delete
 * server-only). These used to write `members/{workspaceId}_{uid}`
 * directly from the browser, authorized only by rules that allowed the
 * workspace owner/admin. The server also writes the workspace activity
 * entry and recomputes the member count after a removal.
 */
async function memberAdminApi(body: { workspaceId: string; uid: string; action: "change_role" | "set_disabled" | "remove"; role?: MemberRole; disabled?: boolean }): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/workspaces/members", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error ?? "Couldn't update this member.");
  }
}

export async function changeMemberRole(workspaceId: string, uid: string, role: MemberRole): Promise<void> {
  await memberAdminApi({ workspaceId, uid, action: "change_role", role });
}

export async function setMemberDisabled(workspaceId: string, uid: string, disabled: boolean): Promise<void> {
  await memberAdminApi({ workspaceId, uid, action: "set_disabled", disabled });
}

export async function removeMember(workspaceId: string, uid: string): Promise<void> {
  await memberAdminApi({ workspaceId, uid, action: "remove" });
}
