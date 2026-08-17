import { Card } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/activity/ActivityFeed";

export default function ActivityPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Activity</h1>
        <p className="mt-1 text-sm text-foreground-muted">Everything happening across your workspace.</p>
      </div>
      <Card>
        <ActivityFeed take={50} />
      </Card>
    </div>
  );
}
