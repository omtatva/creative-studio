import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ROUTES } from "@/lib/constants/routes";

/** Now reuses ActivityFeed (same component backing /activity) instead of a static placeholder. */
export function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <Link href={ROUTES.activity} className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </CardHeader>
      <ActivityFeed take={5} />
    </Card>
  );
}
