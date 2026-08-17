"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, ShieldCheck, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { RoleFormModal } from "@/components/settings/RoleFormModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useCustomRoles } from "@/hooks/useCustomRoles";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/useToast";
import { createRole, updateRole, deleteRole, archiveRole, duplicateRole } from "@/services/roleService";
import { PERMISSION_CATALOG } from "@/lib/constants/permissions";
import { CustomRole } from "@/types/workspace.types";
import { CustomRoleFormValues } from "@/lib/validations/settings.schema";

/**
 * "Roles & Permissions" — unlimited custom roles including the 8
 * named defaults, each with create/edit/duplicate/archive/delete.
 * Module-by-module permission matrices (View/Create/Edit/Delete/
 * Archive/Export/Manage per module) live on the separate Access
 * Control page, which reads/writes the SAME CustomRole.permissions
 * array — no duplicate role storage between the two pages.
 */
export default function RolesSettingsPage() {
  const { roles, archivedRoles, isLoading } = useCustomRoles();
  const { canManageWorkspace } = useCurrentMemberRole();
  const { workspaceId } = useWorkspaceContext();
  const { firebaseUser, profile } = useAuthContext();
  const toast = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomRole | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  function actor() {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
      email: profile?.email ?? firebaseUser?.email ?? "",
    };
  }

  async function handleSubmit(values: CustomRoleFormValues) {
    if (!workspaceId) return;
    setIsSubmitting(true);
    try {
      if (editingRole) {
        await updateRole(workspaceId, editingRole.id, values, actor(), editingRole.permissions);
        toast.success("Role updated");
      } else {
        await createRole(workspaceId, values.name, values.description, values.permissions);
        toast.success("Role created");
      }
      setIsFormOpen(false);
      setEditingRole(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save role");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDuplicate(role: CustomRole) {
    try {
      await duplicateRole(role);
      toast.success(`Duplicated "${role.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate role");
    }
  }

  async function handleToggleArchive(role: CustomRole) {
    try {
      await archiveRole(role.id, !role.isArchived);
      toast.success(role.isArchived ? `Restored "${role.name}"` : `Archived "${role.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update role");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRole(deleteTarget.id);
      toast.success("Role deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete role");
    } finally {
      setDeleteTarget(null);
    }
  }

  const list = showArchived ? archivedRoles : roles;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-foreground-muted">Unlimited custom roles, seeded with 8 standard starting points.</p>
        </div>
        {canManageWorkspace && (
          <Button size="sm" onClick={() => { setEditingRole(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4" />
            New role
          </Button>
        )}
      </div>

      {!canManageWorkspace && (
        <p className="text-xs text-foreground-muted">Only workspace owners and admins can create or change roles. You can still view them here.</p>
      )}

      <SettingsSection
        title={showArchived ? "Archived roles" : "Roles"}
        action={
          <Button size="sm" variant="outline" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? "Show active" : `Show archived (${archivedRoles.length})`}
          </Button>
        }
      >
        {isLoading ? (
          <Loader label="Loading roles..." />
        ) : list.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title={showArchived ? "No archived roles" : "No roles yet"} />
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((role) => (
              <div key={role.id} className="flex items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{role.name}</p>
                    {role.isSystemRole && <Badge variant="info">Default</Badge>}
                  </div>
                  <p className="text-xs text-foreground-muted">
                    {role.description || `${role.permissions.length} of ${PERMISSION_CATALOG.length} permissions`}
                  </p>
                </div>
                {canManageWorkspace && (
                  <>
                    {!showArchived && (
                      <>
                        <button onClick={() => { setEditingRole(role); setIsFormOpen(true); }} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Edit role">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDuplicate(role)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Duplicate role">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <button onClick={() => handleToggleArchive(role)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label={role.isArchived ? "Restore role" : "Archive role"}>
                      {role.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setDeleteTarget(role)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-error/10 hover:text-error" aria-label="Delete role">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <RoleFormModal
        isOpen={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingRole(null); }}
        role={editingRole}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
      />

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete role?"
        description={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
