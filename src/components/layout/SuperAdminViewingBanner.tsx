"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { ROUTES } from "@/lib/constants/routes";

/**
 * Shown ONLY while a platform Super Admin is looking at a workspace they
 * are not a member of (no members doc — platform authority is separate
 * from membership, and none is ever created). A reminder of whose data
 * this is, with a way back to the customer record.
 */
export function SuperAdminViewingBanner() {
  const { isViewingAsSuperAdmin } = useCurrentMemberRole();
  const { workspace } = useWorkspaceContext();
  if (!isViewingAsSuperAdmin || !workspace) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-primary/5 px-4 py-1.5 text-xs text-foreground-muted md:px-6">
      <span className="inline-flex items-center gap-1.5 font-medium text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        Super Admin · Viewing {workspace.name}
      </span>
      <Link href={`${ROUTES.superAdminCustomers}/${workspace.id}`} className="font-medium text-primary hover:underline">
        Back to customer
      </Link>
    </div>
  );
}
