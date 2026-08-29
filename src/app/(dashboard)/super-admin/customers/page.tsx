"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, MailWarning } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useToast } from "@/hooks/useToast";
import { isSuperAdminUser, SUPER_ADMIN_EMAIL } from "@/lib/constants/itSupport";
import { resendVerificationEmail } from "@/lib/firebase/auth";
import { getWorkspaceMembers } from "@/services/userService";
import { PLAN_DISPLAY_NAMES } from "@/lib/constants/planLimits";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";
import { Workspace, Member } from "@/types/workspace.types";

interface WorkspaceRow {
  workspace: Workspace;
  owner: Member | null;
  memberCount: number;
}

/**
 * Super Admin > Customers/Workspaces — every workspace on the
 * platform, Super-Admin-only (see lib/constants/itSupport.ts). Reuses
 * WorkspaceContext's own `workspaces` list rather than re-querying:
 * that list is ALREADY "every workspace" for this exact account (see
 * loadMemberships in WorkspaceContext.tsx, which branches on
 * isSuperAdminUser), so this page is really just "give that data a
 * real table instead of only the compact switcher dropdown" plus who
 * owns each one.
 *
 * If this ever shows only the workspace(s) you happen to already
 * belong to instead of literally every workspace on the platform,
 * `profile.platformRole` isn't "super_admin" yet for the signed-in
 * account — sign out and back in (AuthContext syncs it automatically
 * on load, see authService.syncPlatformRole), or check the Firebase
 * Console for itsupport@omtatvadigitals.com's "Email verified" status
 * (required before the self-heal will ever set it — see
 * verifySuperAdminAuth in firebaseAdmin.ts).
 */
export default function SuperAdminCustomersPage() {
  const { firebaseUser, profile } = useAuthContext();
  const { workspaces, isLoading: isLoadingWorkspaces } = useWorkspaceContext();
  const [rows, setRows] = useState<WorkspaceRow[] | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const toast = useToast();
  const isSuperAdmin = isSuperAdminUser(profile);
  const isUnverifiedSuperAdminEmail = firebaseUser?.email === SUPER_ADMIN_EMAIL && !firebaseUser.emailVerified;

  async function handleResendVerification() {
    setIsSendingVerification(true);
    try {
      await resendVerificationEmail();
      setVerificationSent(true);
      toast.success(`Verification email sent to ${SUPER_ADMIN_EMAIL}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the verification email");
    } finally {
      setIsSendingVerification(false);
    }
  }

  useEffect(() => {
    if (!isSuperAdmin || isLoadingWorkspaces) return;
    let cancelled = false;
    Promise.all(
      workspaces.map(async (workspace) => {
        const members = await getWorkspaceMembers(workspace.id).catch(() => [] as Member[]);
        return { workspace, owner: members.find((m) => m.userId === workspace.ownerId) ?? null, memberCount: members.length };
      })
    ).then((results) => {
      if (!cancelled) setRows(results.sort((a, b) => (b.workspace.createdAt > a.workspace.createdAt ? 1 : -1)));
    });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, isLoadingWorkspaces, workspaces]);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Customers / Workspaces</h1>
          <p className="text-sm text-foreground-muted">Only the platform Super Admin can view this page.</p>
        </div>

        {isUnverifiedSuperAdminEmail && (
          <div className="flex items-start gap-3 rounded-theme border border-warning/30 bg-warning/5 p-4">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">This IS the Super Admin account — its email just isn&apos;t verified yet</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {SUPER_ADMIN_EMAIL} was created directly rather than through signup, so Firebase never sent it a
                verification email. Platform-wide access requires a verified email. Send one, then open the link
                from that inbox.
              </p>
              <Button size="sm" className="mt-3" onClick={handleResendVerification} isLoading={isSendingVerification} disabled={verificationSent}>
                {verificationSent ? "Verification email sent" : "Send verification email"}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Customers / Workspaces</h1>
        <p className="mt-1 text-sm text-foreground-muted">Every workspace created on the platform, and who owns it.</p>
      </div>

      <SettingsSection title={`${rows?.length ?? "..."} workspace${rows?.length === 1 ? "" : "s"}`}>
        {isLoadingWorkspaces || !rows ? (
          <Loader label="Loading workspaces..." />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title="No workspaces yet" description="Nothing has been created on the platform yet." />
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map(({ workspace, owner, memberCount }) => (
              <Link
                key={workspace.id}
                href={`${ROUTES.superAdminCustomers}/${workspace.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-theme border border-border bg-surface p-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{workspace.name}</p>
                    <Badge variant="info">{PLAN_DISPLAY_NAMES[workspace.plan]}</Badge>
                  </div>
                  <p className="truncate text-xs text-foreground-muted">
                    {workspace.companyName} · Created {formatDate(workspace.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-foreground-muted">
                    <p className="text-foreground">{owner ? owner.displayName : "Unknown owner"}</p>
                    <p>{owner?.email ?? workspace.ownerId}</p>
                    <p>
                      {memberCount} member{memberCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
