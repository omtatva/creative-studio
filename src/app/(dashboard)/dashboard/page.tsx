"use client";

import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { AnalyticsCards } from "@/components/dashboard/AnalyticsCards";
import { RecentProjects } from "@/components/dashboard/RecentProjects";
import { PendingReviews } from "@/components/dashboard/PendingReviews";
import { MyTasks } from "@/components/dashboard/MyTasks";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { AIActivity } from "@/components/dashboard/AIActivity";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { StorageUsage } from "@/components/dashboard/StorageUsage";
import { useWorkspaceSettings } from "@/hooks/useWorkspaceSettings";
import { DEFAULT_SIDEBAR_CONFIG } from "@/lib/constants/settingsDefaults";

/**
 * Widget visibility reads from settings.sidebarConfig.widgets (see
 * the Access Control settings page's "Hide Widgets" control) —
 * real enforcement, not just a stored flag nobody checks.
 */
export default function DashboardPage() {
  const { settings } = useWorkspaceSettings();
  const widgets = settings?.sidebarConfig?.widgets ?? DEFAULT_SIDEBAR_CONFIG.widgets;
  const isHidden = (key: string) => widgets.find((w) => w.key === key)?.isHidden ?? false;

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
