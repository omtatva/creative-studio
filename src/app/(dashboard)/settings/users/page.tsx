"use client";

import { useState } from "react";
import { Link2, RotateCw, UserPlus, X } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { InviteUserModal } from "@/components/settings/InviteUserModal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceMembers";
import { useInvites } from "@/hooks/useInvites";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { changeMemberRole, removeMember, setMemberDisabled } from "@/services/userService";
import { createInvite, cancelInvite, getPendingInviteForEmail, resendInvite, sendInviteEmail } from "@/services/inviteService";
import { checkWorkspaceLimit } from "@/services/planService";
import { Member, MemberRole, WorkspaceInvite } from "@/types/workspace.types";
import { InviteUserFormValues } from "@/lib/validations/settings.schema";
import { inviteRoute } from "@/lib/constants/routes";
import { timeAgo } from "@/lib/utils/date";

const ROLE_VARIANT: Record<MemberRole, "info" | "success" | "default" | "warning"> = {
  owner: "info",
  admin: "success",
  member: "default",
  viewer: "warning",
};

export default function UsersSettingsPage() {
  const { members, isLoading } = useWorkspaceMembers();
  const { invites, isLoading: isLoadingInvites, error: invitesError } = useInvites();
  const { firebaseUser, profile } = useAuthContext();
  const { workspace, workspaceId } = useWorkspaceContext();
  const { canManageMembers } = useCurrentMemberRole();
  const toast = useToast();

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  function actor() {
    return {
      uid: firebaseUser?.uid ?? "",
      displayName: profile?.displayName ?? firebaseUser?.displayName ?? "Unknown",
      photoURL: profile?.photoURL ?? firebaseUser?.photoURL ?? null,
      email: profile?.email ?? firebaseUser?.email ?? "",
    };
  }

  async function handleInvite(values: InviteUserFormValues) {
    if (!workspaceId || !workspace) {
      toast.error("No active workspace selected.");
      return;
    }
    if (!canManageMembers) {
      toast.error("Only workspace owners and admins can invite members.");
      return;
    }
    const normalizedEmail = values.email.trim().toLowerCase();
    setIsInviting(true);
    try {
      const alreadyMember = members.some((m) => m.email.trim().toLowerCase() === normalizedEmail);
      if (alreadyMember) {
        toast.error("This user is already a member of this workspace.");
        return;
      }

      const limitCheck = await checkWorkspaceLimit(workspace, "members");
      if (!limitCheck.allowed) {
        toast.error(limitCheck.reason ?? "This workspace has reached its member limit.");
        return;
      }

      const existing = await getPendingInviteForEmail(workspaceId, normalizedEmail);
      if (existing) {
        toast.error("This user already has a pending invitation. Use Resend below instead.");
        setIsInviteOpen(false);
        return;
      }

      const invite = await createInvite(workspaceId, workspace.name, normalizedEmail, values.role, actor());
      setIsInviteOpen(false);

      const { ok, error } = await sendInviteEmail(invite);

      if (ok) {
        toast.success("Invitation sent successfully.");
      } else {
        toast.error(`Invitation was created, but the email could not be sent (${error}). You can retry sending it below.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create invitation");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleResendInvite(invite: WorkspaceInvite) {
    setBusyInviteId(invite.id);
    try {
      const expiresAt = await resendInvite(invite.id);
      const { ok, error } = await sendInviteEmail({ ...invite, expiresAt });
      if (ok) {
        toast.success(`Invitation resent to ${invite.email}`);
      } else {
        toast.error(`Invitation was extended, but the email could not be sent (${error}). You can retry.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't resend invite");
    } finally {
      setBusyInviteId(null);
    }
  }

  async function handleCopyInviteLink(inviteId: string) {
    const url = `${window.location.origin}${inviteRoute(inviteId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied to clipboard.");
    } catch {
      toast.error("Couldn't copy the link. Copy it manually: " + url);
    }
  }

  async function handleRoleChange(member: Member, role: MemberRole) {
    if (!workspaceId) return;
    setBusyUid(member.userId);
    try {
      await changeMemberRole(workspaceId, member.userId, role, actor());
      toast.success(`${member.displayName}'s role updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update role");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleToggleDisabled(member: Member) {
    if (!workspaceId) return;
    setBusyUid(member.userId);
    try {
      await setMemberDisabled(workspaceId, member.userId, member.status !== "suspended", actor());
      toast.success(member.status === "suspended" ? `${member.displayName} re-enabled` : `${member.displayName} disabled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update member");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRemove() {
    if (!workspaceId || !removeTarget) return;
    try {
      await removeMember(workspaceId, removeTarget.userId, actor());
      toast.success(`${removeTarget.displayName} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove member");
    } finally {
      setRemoveTarget(null);
    }
  }

  async function handleCancelInvite(inviteId: string, email: string) {
    try {
      await cancelInvite(inviteId);
      toast.success(`Invite to ${email} cancelled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel invite");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-foreground-muted">Invite teammates, manage roles, and disable access.</p>
        </div>
        {canManageMembers && (
          <Button size="sm" onClick={() => setIsInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite user
          </Button>
        )}
      </div>

      {invitesError && (
        <div className="rounded-theme border border-error/30 bg-error/5 px-3 py-2.5 text-sm text-error">
          Couldn&apos;t load pending invitations: {invitesError}
        </div>
      )}

      {invites.length > 0 && (
        <SettingsSection title="Pending invites">
          <div className="flex flex-col gap-2">
            {isLoadingInvites
              ? null
              : invites.map((invite) => (
                  <div key={invite.id} className="flex items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                      <p className="truncate text-xs text-foreground-muted">
                        Invited by {invite.invitedByName} · role: {invite.role} · {timeAgo(invite.createdAt)}
                      </p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                    {canManageMembers && (
                      <>
                        <button
                          onClick={() => handleCopyInviteLink(invite.id)}
                          className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted"
                          aria-label="Copy invite link"
                          title="Copy invite link"
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleResendInvite(invite)}
                          disabled={busyInviteId === invite.id}
                          className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted disabled:opacity-50"
                          aria-label="Resend invite"
                          title="Resend (extends expiry)"
                        >
                          <RotateCw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleCancelInvite(invite.id, invite.email)}
                          className="rounded-theme p-1.5 text-foreground-muted hover:bg-error/10 hover:text-error"
                          aria-label="Cancel invite"
                          title="Cancel invite"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
          </div>
        </SettingsSection>
      )}

      <SettingsSection title="Members">
        {isLoading ? (
          <Loader label="Loading members..." />
        ) : members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 py-3">
                <Avatar name={member.displayName} src={member.photoURL} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{member.displayName}</p>
                  <p className="truncate text-xs text-foreground-muted">{member.email}</p>
                </div>

                {member.status === "suspended" && <Badge variant="danger">Disabled</Badge>}

                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member, e.target.value as MemberRole)}
                  disabled={member.role === "owner" || busyUid === member.userId}
                  className="h-8 rounded-theme border border-border bg-surface px-2 text-xs capitalize text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
                >
                  <option value="owner" disabled>Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>

                {member.role !== "owner" && (
                  <>
                    <ToggleSwitch
                      checked={member.status !== "suspended"}
                      onChange={() => handleToggleDisabled(member)}
                      disabled={busyUid === member.userId}
                    />
                    <Button size="sm" variant="outline" onClick={() => setRemoveTarget(member)}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <InviteUserModal isOpen={isInviteOpen} onClose={() => setIsInviteOpen(false)} onInvite={handleInvite} isSubmitting={isInviting} />

      <ConfirmModal
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title="Remove member?"
        description={`"${removeTarget?.displayName}" will lose access to this workspace.`}
        confirmLabel="Remove"
        isDanger
      />
    </div>
  );
}
