import "server-only";
import { adminDb } from "@/lib/server/firebaseAdmin";
import type { MemberRole } from "@/types/workspace.types";

export interface ProjectAccess {
  workspaceRole: MemberRole | null;
  projectRole: string | null;
  isSuperAdmin: boolean;
  /** Mirrors firestore.rules' canAccessProject: Super Admin, workspace owner/admin, or ANY project_members record (including viewer). */
  canRead: boolean;
  /** Mirrors canWriteProject: as canRead, except a project Viewer. */
  canWrite: boolean;
  /** Mirrors canManageProject: Super Admin, workspace owner/admin, or project owner/manager. */
  canManage: boolean;
}

/**
 * The server-side twin of firestore.rules' canAccessProject /
 * canWriteProject / canManageProject, for routes that run with the Admin
 * SDK (which bypasses rules) and so must re-derive the same answer from
 * the same three records. Workspace membership alone never grants project
 * access. Callers still verify that the project actually belongs to the
 * workspace they were handed.
 */
export async function resolveProjectAccess(uid: string, workspaceId: string, projectId: string): Promise<ProjectAccess> {
  const [memberSnap, projectMemberSnap, userSnap] = await Promise.all([
    adminDb().collection("members").doc(`${workspaceId}_${uid}`).get(),
    adminDb().collection("project_members").doc(`${projectId}_${uid}`).get(),
    adminDb().collection("users").doc(uid).get(),
  ]);
  const workspaceRole = memberSnap.exists ? ((memberSnap.data()?.role as MemberRole | undefined) ?? null) : null;
  const projectRole = projectMemberSnap.exists ? ((projectMemberSnap.data()?.role as string | undefined) ?? null) : null;
  const isSuperAdmin = userSnap.exists && userSnap.data()?.platformRole === "super_admin";
  const isWorkspaceAdmin = workspaceRole === "owner" || workspaceRole === "admin";
  const isMember = projectMemberSnap.exists;
  return {
    workspaceRole,
    projectRole,
    isSuperAdmin,
    canRead: isSuperAdmin || isWorkspaceAdmin || isMember,
    canWrite: isSuperAdmin || isWorkspaceAdmin || (isMember && projectRole !== "viewer"),
    canManage: isSuperAdmin || isWorkspaceAdmin || (isMember && (projectRole === "owner" || projectRole === "manager")),
  };
}
