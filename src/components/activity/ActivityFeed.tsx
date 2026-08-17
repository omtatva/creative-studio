"use client";

import { Activity } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useWorkspaceActivity } from "@/hooks/useWorkspaceActivity";
import { timeAgo } from "@/lib/utils/date";

interface ActivityFeedProps {
  take?: number;
  filterTargetId?: string; // narrows to entries about one target (e.g. a project) — used by the project's own Activity tab
}

/**
 * Reusable activity list — reads the Foundation's workspace-wide
 * `activity_logs` (see useWorkspaceActivity), now populated by
 * project/task/file/review/board-column creation and key status
 * changes across every module ("Connect everything with Activity
 * Logs"). Used by /activity, the dashboard's Recent Activity card,
 * and a project's own Activity tab.
 */
export function ActivityFeed({ take = 20, filterTargetId }: ActivityFeedProps) {
  const { entries, isLoading } = useWorkspaceActivity(take);
  const visible = filterTargetId ? entries.filter((e) => e.targetId === filterTargetId) : entries;

  if (!isLoading && visible.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-8 w-8" />}
        title="No activity yet"
        description="Actions taken across your workspace will be logged here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 w-full animate-pulse rounded-theme bg-surface-muted" />)
        : visible.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-muted">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                <span className="font-medium">{entry.actorName}</span>{" "}
                <span className="text-foreground-muted">{entry.action}</span>
              </p>
              <span className="shrink-0 text-xs text-foreground-muted">{timeAgo(entry.createdAt)}</span>
            </div>
          ))}
    </div>
  );
}
