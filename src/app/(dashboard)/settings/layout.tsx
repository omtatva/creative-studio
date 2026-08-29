"use client";

import { Building2 } from "lucide-react";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuthContext } from "@/contexts/AuthContext";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";

/**
 * Everything under /settings manages ONE workspace's own settings —
 * the Workspace Owner/Admin level (see itSupport.ts's two-level
 * model). The Super Admin (itSupport.ts) has no tenant of its own —
 * it's expected for it to have no active workspace (see
 * WorkspaceContext's `isSuperAdminUser` branch, which no longer treats
 * that as an error) — but every one of these pages still reads/writes
 * ONE workspace's data, so without a guard here they'd each show
 * their own "Loading workspace..." spinner forever with no way out.
 * One shared check here, rather than repeating it on every settings
 * page, tells Super Admin to pick a workspace from the switcher
 * (Sidebar/Navbar — already lists every workspace on the platform for
 * this account) before it can manage that workspace's settings. Its
 * OWN platform-wide pages (Customers, Billing, Sales, ...) live
 * entirely under /super-admin instead, unaffected by this guard.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useAuthContext();
  const { workspace, isLoading } = useWorkspaceContext();
  const needsWorkspacePick = isSuperAdminUser(profile) && !isLoading && !workspace;

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <SettingsNav />
      <div className="flex-1">
        {needsWorkspacePick ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8" />}
            title="No workspace selected"
            description="Pick a workspace from the switcher in the sidebar to view or update its settings."
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
