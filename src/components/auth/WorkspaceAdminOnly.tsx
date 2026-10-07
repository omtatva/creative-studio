"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Loader } from "@/components/ui/Loader";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Page guard for the workspace's own Owner/Admin (and the platform Super
 * Admin) — used by Settings > Users, where an Owner invites people into
 * their workspace so they can then be added to specific projects. This is
 * a UI convenience; the real boundary is firestore.rules' workspace_invites
 * block and /api/invites/send, which cap an Owner/Admin to member/viewer
 * invites. The controls that stay Super Admin only (changing roles,
 * disabling or removing members) are hidden inside the page itself.
 */
export function WorkspaceAdminOnly({ title, children }: { title: string; children: React.ReactNode }) {
  const { canManageWorkspace, isSuperAdmin, isLoading } = useCurrentMemberRole();

  if (isLoading) return <Loader label="Loading..." />;

  if (!canManageWorkspace && !isSuperAdmin) {
    return (
      <div className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-foreground">
          <ShieldAlert className="h-5 w-5 text-warning" />
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        <p className="text-sm text-foreground-muted">Only the workspace owner or an admin can invite people to this workspace.</p>
        <Link href={ROUTES.team} className="text-sm font-medium text-primary hover:underline">
          View your team
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
