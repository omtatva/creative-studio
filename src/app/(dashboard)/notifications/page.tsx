"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export default function NotificationsPage() {
  const { can } = useFeatureAccess();
  if (!can("notifications.view")) {
    return <EmptyState title="Notifications aren't enabled for your role" description="Contact your administrator." />;
  }
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-foreground-muted">Updates about your tasks and reviews.</p>
      </div>
      <Card>
        <NotificationsPanel take={50} />
      </Card>
    </div>
  );
}
