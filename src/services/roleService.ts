import { deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { customRolesCol, customRoleDoc } from "@/lib/firebase/firestore";
import { logAudit } from "@/services/auditService";
import { CustomRole } from "@/types/workspace.types";
import { TaskActor } from "@/types/task.types";
import { ROLE_SEED_PERMISSIONS } from "@/lib/constants/permissions";

/**
 * CRUD for workspace-defined roles, including the 8 named starting
 * roles from the spec (Super Admin, Workspace Admin, Project
 * Manager, Team Lead, Reviewer, Designer, Editor, Viewer) — those
 * are seeded as real CustomRole docs (isSystemRole: true) the first
 * time the Roles page loads for a workspace, rather than being a
 * hardcoded read-only constant: once seeded, editing/duplicating/
 * archiving them works exactly like any custom role, satisfying
 * "Support unlimited custom roles" and "no hardcoded permissions."
 */
export async function createRole(
  workspaceId: string,
  name: string,
  description: string,
  permissions: string[],
  isSystemRole = false
): Promise<string> {
  const docRef = doc(customRolesCol());
  const role: Omit<CustomRole, "createdAt" | "updatedAt"> = {
    id: docRef.id,
    workspaceId,
    name,
    description,
    permissions,
    isSystemRole,
    isArchived: false,
  };
  await setDoc(docRef, { ...role, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return docRef.id;
}

export async function getCustomRoles(workspaceId: string): Promise<CustomRole[]> {
  const q = query(customRolesCol(), where("workspaceId", "==", workspaceId), orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data());
}

export async function updateRole(
  workspaceId: string,
  roleId: string,
  patch: Partial<Pick<CustomRole, "name" | "description" | "permissions">>,
  actor: TaskActor,
  previousPermissions: string[]
): Promise<void> {
  await updateDoc(customRoleDoc(roleId), { ...patch, updatedAt: serverTimestamp() } as never);
  if (patch.permissions) {
    await logAudit({
      workspaceId,
      actor,
      action: "permission_changed",
      targetType: "role",
      targetId: roleId,
      previousValue: previousPermissions,
      newValue: patch.permissions,
    });
  } else {
    await logAudit({
      workspaceId,
      actor,
      action: "role_changed",
      targetType: "role",
      targetId: roleId,
      newValue: patch,
    });
  }
}

export async function archiveRole(roleId: string, isArchived: boolean): Promise<void> {
  await updateDoc(customRoleDoc(roleId), { isArchived, updatedAt: serverTimestamp() });
}

export async function deleteRole(roleId: string): Promise<void> {
  await deleteDoc(customRoleDoc(roleId));
}

export async function duplicateRole(role: CustomRole): Promise<string> {
  return createRole(role.workspaceId, `${role.name} (Copy)`, role.description, role.permissions, false);
}

/** Idempotent: only seeds the 8 named roles if the workspace has no roles at all yet. */
export async function seedDefaultRolesIfEmpty(workspaceId: string): Promise<void> {
  const existing = await getCustomRoles(workspaceId);
  if (existing.length > 0) return;

  await Promise.all(
    Object.entries(ROLE_SEED_PERMISSIONS).map(([name, permissions]) =>
      createRole(workspaceId, name, `Seeded default role: ${name}`, permissions, true)
    )
  );
}
