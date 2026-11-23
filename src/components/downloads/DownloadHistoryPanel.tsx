"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDownloadHistory } from "@/hooks/useDownloadHistory";
import { formatBytes } from "@/lib/utils/fileFormat";
import { projectRoute } from "@/lib/constants/routes";
import type { DownloadEvent, DownloadStatus } from "@/types/download.types";

/**
 * Honest labels. "Started" is what a DIRECT download can honestly be: the server authorized it and issued the link, but the bytes go browser <-> storage and the server can't see
 * them arrive. Only a proxied download the server finished streaming is "Completed".
 */
export const STATUS_LABEL: Record<DownloadStatus, string> = {
  started: "Started",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  expired: "Link expired",
};
const STATUS_STYLE: Record<DownloadStatus, string> = {
  started: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  cancelled: "bg-surface-muted text-foreground-muted",
  failed: "bg-error/10 text-error",
  expired: "bg-surface-muted text-foreground-muted",
};

function Row({ e }: { e: DownloadEvent }) {
  return (
    <div className="flex items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5" data-testid="download-history-row">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {e.fileName} {e.versionNumber && e.versionNumber > 1 ? <span className="text-xs font-normal text-foreground-muted">v{e.versionNumber}</span> : null}
        </p>
        <p className="truncate text-xs text-foreground-muted">
          {e.sizeBytes != null ? `${formatBytes(e.sizeBytes)} · ` : ""}
          {new Date(e.createdAt).toLocaleString()} ·{" "}
          <Link href={projectRoute(e.projectId)} className="text-primary hover:underline">
            View project
          </Link>
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[e.status]}`}
        title={e.status === "started" && e.method === "direct" ? "The download link was issued and opened. Direct downloads go straight from storage to your browser, so completion can't be confirmed." : undefined}
      >
        {STATUS_LABEL[e.status]}
      </span>
    </div>
  );
}

/** The signed-in member's own download history, newest first, live. */
export function DownloadHistoryPanel() {
  const { events, isLoading, error } = useDownloadHistory();

  if (isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 w-full animate-pulse rounded-theme bg-surface-muted" />)}</div>;
  if (error) return <p className="text-sm text-error">{error}</p>;
  if (events.length === 0) return <EmptyState icon={<History className="h-8 w-8" />} title="No downloads yet" description="Files you download will be listed here." />;
  return <div className="flex flex-col gap-2">{events.map((e) => <Row key={e.id} e={e} />)}</div>;
}
