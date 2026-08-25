"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Trash2, Search } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useProjectDetailsContext } from "@/contexts/ProjectDetailsContext";
import { useProjectActions } from "@/hooks/useProjectActions";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { getWorkspaceMembers } from "@/services/userService";
import { Member } from "@/types/workspace.types";
import { ProjectMember, ProjectRole } from "@/types/project.types";

const PROJECT_ROLES: ProjectRole[] = ["owner", "manager", "editor", "viewer"];
const DEFAULT_INVITE_ROLE: ProjectRole = "editor";

/**
 * Project Members tab — invite from EXISTING WORKSPACE members only
 * (never an arbitrary user from another workspace: `eligibleMembers`
 * is derived from `getWorkspaceMembers(workspaceId)`, the same
 * workspace this project belongs to), remove, and reassign per-
 * project roles. Every mutation goes through useProjectActions, which
 * writes both the display array (project.members) AND the real
 * project_members access-control record — see projectService.ts.
 */
export function ProjectMembersTab() {
  const { project } = useProjectDetailsContext();
  const { workspaceId } = useWorkspaceContext();
  const actions = useProjectActions();
  const toast = useToast();

  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [inviteRole, setInviteRole] = useState<ProjectRole>(DEFAULT_INVITE_ROLE);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    getWorkspaceMembers(workspaceId)
      .then(setWorkspaceMembers)
      .catch(() => toast.error("Couldn't load workspace members. Please refresh and try again."));
  }, [workspaceId]);

  const eligibleMembers = useMemo(() => {
    if (!project) return [];
    const existingUids = new Set(project.members.map((m) => m.uid));
    return workspaceMembers.filter((m) => !existingUids.has(m.userId));
  }, [workspaceMembers, project]);

  const searchedEligibleMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return eligibleMembers;
    return eligibleMembers.filter((m) => m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [eligibleMembers, searchQuery]);

  if (!project) return null;

  function toggleSelected(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function closeInviteModal() {
    setIsInviteOpen(false);
    setSearchQuery("");
    setSelectedUids(new Set());
    setInviteRole(DEFAULT_INVITE_ROLE);
  }

  async function handleInvite() {
    const membersToAdd = workspaceMembers.filter((m) => selectedUids.has(m.userId));
    if (membersToAdd.length === 0) return;
    setIsInviting(true);
    try {
      let addedCount = 0;
      for (const member of membersToAdd) {
        const projectMember: ProjectMember = {
          uid: member.userId,
          displayName: member.displayName,
          photoURL: member.photoURL,
          email: member.email,
          role: inviteRole,
        };
        const result = await actions.addMember(project!.id, projectMember);
        if (result.error === null) {
          addedCount += 1;
        } else {
          toast.error(`Couldn't add ${member.displayName}: ${result.error}`);
        }
      }
      if (addedCount > 0) {
        toast.success(addedCount === 1 ? "1 member added to project" : `${addedCount} members added to project`);
        closeInviteModal();
      }
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRemove(member: ProjectMember) {
    const result = await actions.removeMember(project!.id, member);
    if (result.error === null) toast.success(`${member.displayName} removed from project`);
    else toast.error(result.error ?? "Couldn't remove member. Please try again.");
  }

  async function handleRoleChange(member: ProjectMember, role: ProjectRole) {
    const result = await actions.updateMemberRole(project!.id, member.uid, role);
    if (result.error === null) toast.success(`${member.displayName}'s role updated`);
    else toast.error(result.error ?? "Couldn't update role. Please try again.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Members</CardTitle>
        <Button size="sm" onClick={() => setIsInviteOpen(true)} disabled={eligibleMembers.length === 0}>
          <UserPlus className="h-4 w-4" />
          Add Member
        </Button>
      </CardHeader>

      {project.members.length === 0 ? (
        <EmptyState title="No members yet" description="Add workspace members to collaborate on this project." />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {project.members.map((member) => (
            <div key={member.uid} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={member.displayName} src={member.photoURL} />
                <div>
                  <p className="text-sm font-medium text-foreground">{member.displayName}</p>
                  <p className="text-xs text-foreground-muted">{member.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member, e.target.value as ProjectRole)}
                  disabled={member.uid === project.ownerId}
                  className="h-8 rounded-theme border border-border bg-surface px-2 text-xs capitalize text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  {PROJECT_ROLES.map((role) => (
                    <option key={role} value={role} className="capitalize">
                      {role}
                    </option>
                  ))}
                </select>
                {member.uid !== project.ownerId && (
                  <button
                    onClick={() => handleRemove(member)}
                    className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500"
                    aria-label={`Remove ${member.displayName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isInviteOpen} onClose={closeInviteModal} title={`Add members to ${project.name}`}>
        {eligibleMembers.length === 0 ? (
          <p className="text-sm text-foreground-muted">Everyone in the workspace is already on this project.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search workspace members..."
                className="h-10 w-full rounded-theme border border-border bg-surface pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-theme border border-border p-1.5">
              {searchedEligibleMembers.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-foreground-muted">No matching workspace members.</p>
              ) : (
                searchedEligibleMembers.map((m) => (
                  <label
                    key={m.userId}
                    className="flex cursor-pointer items-center gap-2.5 rounded-theme px-2 py-1.5 hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUids.has(m.userId)}
                      onChange={() => toggleSelected(m.userId)}
                      className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                    />
                    <Avatar name={m.displayName} src={m.photoURL} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{m.displayName}</p>
                      <p className="truncate text-xs text-foreground-muted">{m.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Role
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as ProjectRole)}
                className="h-9 rounded-theme border border-border bg-surface px-2.5 text-sm font-normal capitalize text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {PROJECT_ROLES.filter((r) => r !== "owner").map((role) => (
                  <option key={role} value={role} className="capitalize">
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeInviteModal}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={selectedUids.size === 0} isLoading={isInviting}>
                Add Member{selectedUids.size > 1 ? "s" : ""}
                {selectedUids.size > 0 ? ` (${selectedUids.size})` : ""}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
