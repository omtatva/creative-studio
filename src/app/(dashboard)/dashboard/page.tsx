"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { AnalyticsCards } from "@/components/dashboard/AnalyticsCards";
import { RecentProjects } from "@/components/dashboard/RecentProjects";
import { PendingReviews } from "@/components/dashboard/PendingReviews";
import { MyTasks } from "@/components/dashboard/MyTasks";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { AIActivity } from "@/components/dashboard/AIActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StorageUsage } from "@/components/dashboard/StorageUsage";
import { Loader } from "@/components/ui/Loader";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { isSuperAdminUser } from "@/lib/constants/itSupport";
import { ROUTES } from "@/lib/constants/routes";
import { DEFAULT_SIDEBAR_CONFIG } from "@/lib/constants/settingsDefaults";

/**
 * Widget visibility reads from settings.sidebarConfig.widgets (see
 * the Access Control settings page's "Hide Widgets" control) —
 * real enforcement, not just a stored flag nobody checks.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { settings } = useWorkspaceSettings();
  const { workspace, isLoading: isLoadingWorkspace } = useWorkspaceContext();
  const { profile } = useAuthContext();
  const isSuperAdmin = isSuperAdminUser(profile);
  const widgets = settings?.sidebarConfig?.widgets ?? DEFAULT_SIDEBAR_CONFIG.widgets;
  const isHidden = (key: string) => widgets.find((w) => w.key === key)?.isHidden ?? false;

  // Super Admin has no tenant of its own to show a personal dashboard
  // for — "everything" for this account IS the /super-admin section,
  // so land it there directly instead of an empty/broken per-workspace
  // dashboard (this also covers the case where its own activeWorkspaceId
  // points at a workspace it just deleted).
  useEffect(() => {
    if (!isLoadingWorkspace && isSuperAdmin && !workspace) {
      router.replace(ROUTES.superAdmin);
    }
  }, [isLoadingWorkspace, isSuperAdmin, workspace, router]);

  if (isSuperAdmin && !workspace) return <Loader fullScreen label="Loading..." />;

  return (
    <div className="flex flex-col gap-6">
      {!isHidden("welcomeBanner") && <WelcomeBanner />}
      {!isHidden("analyticsCards") && <AnalyticsCards />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {!isHidden("recentProjects") && <RecentProjects />}
          {!isHidden("pendingReviews") && <PendingReviews />}
          {!isHidden("recentActivity") && <RecentActivity />}
        </div>
        <div className="flex flex-col gap-6">
          {!isHidden("myTasks") && <MyTasks />}
          {!isHidden("aiActivity") && <AIActivity />}
          {!isHidden("quickActions") && <QuickActions />}
          {!isHidden("storageUsage") && <StorageUsage />}
        </div>
      </div>
    </div>
  );
}
