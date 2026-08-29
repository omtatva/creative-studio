"use client";

import { useEffect, useState } from "react";
import { Users as UsersIcon, ShieldCheck, UserPlus } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SuperAdminInviteModal, type SuperAdminInviteValues } from "@/components/superAdmin/SuperAdminInviteModal";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { getAllUsers } from "@/services/authService";
import { getWorkspaceMembers } from "@/services/userService";
import { createInvite, getPendingInviteForEmail, sendInviteEmail } from "@/services/inviteService";
import { checkWorkspaceLimit } from "@/services/planService";
import { timeAgo } from "@/lib/utils/date";
import type { AppUser } from "@/types/user.types";

/**
 * Super Admin > Users — every account on the platform, plus an invite
 * action for support ("this customer asked us to add a teammate").
 * The invite itself is the exact same createInvite/sendInviteEmail
 * flow as Settings > Users, just with a workspace picker added since
 * Super Admin isn't scoped to one workspace — see
 * SuperAdminInviteModal's doc comment.
 */
export default function SuperAdminUsersPage() {
  const { firebaseUser, profile } = useAuthContext();
  const { workspaces } = useWorkspaceContext();
  const toast = useToast();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  function loadUsers() {
    getAllUsers()
      .then((list) => setUsers(list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))))
      .catch((err) => {
        console.error("[super-admin/users] failed to load users:", err);
        setUsers([]);
      });
  }

  useEffect(loadUsers, []);

  async function handleInvite({ workspaceId, email, role }: SuperAdminInviteValues) {
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) {
      toast.error("That workspace could not be found.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setIsInviting(true);
    try {
      const members = await getWorkspaceMembers(workspaceId);
      if (members.some((m) => m.email.trim().toLowerCase() === normalizedEmail)) {
        toast.error("This user is already a member of that workspace.");
        return;
      }

      const limitCheck = await checkWorkspaceLimit(workspace, "members");
      if (!limitCheck.allowed) {
        toast.error(limitCheck.reason ?? "That workspace has reached its member limit.");
        return;
      }

      const existing = await getPendingInviteForEmail(workspaceId, normalizedEmail);
      if (existing) {
        toast.error("This user already has a pending invitation to that workspace.");
        setIsInviteOpen(false);
        return;
      }

      const actor = {
        uid: firebaseUser?.uid ?? "",
        displayName: profile?.displayName || "Omtatva Super Admin",
        photoURL: profile?.photoURL ?? null,
        email: profile?.email ?? firebaseUser?.email ?? "",
      };
      const invite = await createInvite(workspaceId, workspace.name, normalizedEmail, role, actor);
      setIsInviteOpen(false);

      const { ok, error } = await sendInviteEmail(invite);
      if (ok) {
        toast.success(`Invitation sent to ${normalizedEmail}`);
      } else {
        toast.error(`Invitation was created, but the email could not be sent (${error}).`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send this invitation.");
    } finally {
      setIsInviting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="mt-1 text-sm text-foreground-muted">Every account on the platform, across every workspace.</p>
        </div>
        <Button size="sm" onClick={() => setIsInviteOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Invite
        </Button>
      </div>

      <SettingsSection title={`${users?.length ?? "..."} user${users?.length === 1 ? "" : "s"}`}>
        {!users ? (
          <Loader label="Loading users..." />
        ) : users.length === 0 ? (
          <EmptyState icon={<UsersIcon className="h-8 w-8" />} title="No users yet" description="Nobody has signed up on the platform yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((user) => (
              <div key={user.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{user.displayName || "(no name)"}</p>
                    {user.platformRole === "super_admin" && (
                      <Badge variant="info" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Super Admin
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-foreground-muted">{user.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-foreground-muted">
                  <span>Joined {timeAgo(user.createdAt)}</span>
                  <Badge variant={user.onboardingComplete ? "success" : "default"}>
                    {user.onboardingComplete ? "Onboarded" : "Pending"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      <SuperAdminInviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        workspaces={workspaces}
        onInvite={handleInvite}
        isSubmitting={isInviting}
      />
    </div>
  );
}
