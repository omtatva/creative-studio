import { Card } from "@/components/ui/Card";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

export default function NotificationsPage() {
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
