"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { useNotifications } from "@/hooks/useNotifications";
import { timeAgo } from "@/lib/utils/date";

interface NotificationsPanelProps {
  take?: number;
  compact?: boolean; // true inside the Navbar dropdown
  /** Called after a notification is opened, so a host (the bell dropdown) can close itself. */
  onNavigate?: () => void;
}

/** Only same-origin paths — a notification can never send the user to another site. */
function safeInternalPath(link: string | undefined): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") && !link.includes("\\") ? link : null;
}

/**
 * Reusable notification list — reads the per-user `notifications`
 * subcollection (see useNotifications), populated server-side for task
 * assignment, review decisions and project membership. Clicking one marks it
 * read and opens its link. Used by both /notifications and the Navbar bell.
 */
export function NotificationsPanel({ take = 20, compact, onNavigate }: NotificationsPanelProps) {
  const router = useRouter();
  const { notifications, isLoading, markAsRead } = useNotifications(take);

  async function open(n: { id: string; read: boolean; link?: string }) {
    const path = safeInternalPath(n.link);
    // Navigate first (the destination enforces access), mark read in the background.
    if (path) {
      router.push(path);
      onNavigate?.();
    }
    if (!n.read) markAsRead(n.id).catch((err) => console.error("[NotificationsPanel] markAsRead failed:", err));
  }

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
              onClick={() => open(n)}
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
