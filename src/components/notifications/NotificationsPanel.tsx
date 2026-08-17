"use client";

import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { useNotifications } from "@/hooks/useNotifications";
import { timeAgo } from "@/lib/utils/date";

interface NotificationsPanelProps {
  take?: number;
  compact?: boolean; // true inside the Navbar dropdown
}

/**
 * Reusable notification list — reads the Foundation's per-user
 * `notifications` subcollection (see useNotifications), now
 * populated by task assignment and review decisions. Used by both
 * /notifications and the Navbar bell dropdown.
 */
export function NotificationsPanel({ take = 20, compact }: NotificationsPanelProps) {
  const { notifications, isLoading, markAsRead } = useNotifications(take);

  if (!isLoading && notifications.length === 0) {
    return (
      <EmptyState
        icon={<Bell className="h-8 w-8" />}
        title="You're all caught up"
        description={compact ? undefined : "Notifications about your tasks and reviews will show up here."}
        className={compact ? "py-6" : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 w-full animate-pulse bg-surface-muted" />)
        : notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => markAsRead(n.id)}
              className={cn("flex items-start gap-2.5 px-1 py-2.5 text-left hover:bg-surface-muted", !n.read && "bg-primary/5")}
            >
              {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              <div className={cn("min-w-0 flex-1", n.read && "pl-3.5")}>
                <p className="truncate text-sm font-medium text-foreground">{n.title}</p>
                <p className="truncate text-xs text-foreground-muted">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-foreground-muted">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))}
    </div>
  );
}
