"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
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

const PROJECT_ROLES: ProjectRole[] = ["owner", "admin", "manager", "member"];

/** Invite from existing workspace members, remove, and reassign per-project roles. */
export function ProjectMembersTab() {
  const { project } = useProjectDetailsContext();
  const { workspaceId } = useWorkspaceContext();
  const actions = useProjectActions();
  const toast = useToast();

  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([]);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedUid, setSelectedUid] = useState<string>("");

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

  if (!project) return null;

  async function handleInvite() {
    const member = workspaceMembers.find((m) => m.userId === selectedUid);
    if (!member) return;
    const projectMember: ProjectMember = {
      uid: member.userId,
      displayName: member.displayName,
      photoURL: member.photoURL,
      email: member.email,
      role: "member",
    };
    const result = await actions.addMember(project!.id, projectMember);
    if (result.error === null) {
      toast.success(`${member.displayName} added to project`);
      setSelectedUid("");
      setIsInviteOpen(false);
    } else {
      toast.error(result.error ?? "Couldn't add member. Please try again.");
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
        <CardTitle>Team Members</CardTitle>
        <Button size="sm" onClick={() => setIsInviteOpen(true)} disabled={eligibleMembers.length === 0}>
          <UserPlus className="h-4 w-4" />
          Invite
        </Button>
      </CardHeader>

      {project.members.length === 0 ? (
        <EmptyState title="No members yet" description="Invite workspace members to collaborate on this project." />
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

      <Modal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Invite a member">
        {eligibleMembers.length === 0 ? (
          <p className="text-sm text-foreground-muted">Everyone in the workspace is already on this project.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <select
              value={selectedUid}
              onChange={(e) => setSelectedUid(e.target.value)}
              className="h-10 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a workspace member...</option>
              {eligibleMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.displayName} ({m.email})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={!selectedUid} isLoading={actions.isSubmitting}>
                Add to project
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
