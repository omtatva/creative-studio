"use client";

import { useRef } from "react";
import { AlertCircle, Ban, CheckCircle2, FileUp, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { useUploads } from "@/contexts/UploadContext";
import type { UploadItem } from "@/lib/uploads/uploadStore";
import { formatBytes } from "@/lib/utils/fileFormat";

export const formatSpeed = (bps: number) => (bps >= 1024 * 1024 ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`);
export function formatEta(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

/** "42% · 4.2 MB/s · 1h 14m left · 4 parts" / "Finalizing..." — the one status line used by the project list and the global panel. */
export function uploadStatusLine(item: UploadItem, isOffline: boolean): string {
  const parts = item.method === "multipart" && item.totalParts ? ` · ${item.completedParts}/${item.totalParts} parts${item.activeParts > 0 ? ` (${item.activeParts} active)` : ""}` : "";
  switch (item.status) {
    case "queued":
      return "Waiting to start...";
    case "preparing":
      return "Preparing...";
    case "uploading": {
      if (isOffline) return `${item.progress}% · Connection lost — will resume automatically`;
      return `${item.progress}%${item.speedBps ? ` · ${formatSpeed(item.speedBps)}` : ""}${item.etaSeconds ? ` · ${formatEta(item.etaSeconds)} left` : ""}${parts}`;
    }
    case "retrying":
      return `${item.progress}% · Retrying after an interruption${item.retries ? ` (${item.retries} so far)` : ""}${parts}`;
    case "paused":
      return item.needsFile ? `${item.progress}% uploaded · Select the same file to continue` : `${item.progress}% · Paused — ${formatBytes(item.fileSize)} total${parts}`;
    case "finalizing":
      return "Finalizing...";
    case "completed":
      return `${formatBytes(item.fileSize)} · Uploaded`;
    case "cancelled":
      return "Cancelled";
    case "failed":
      return item.error ?? "Upload failed";
  }
}

const BUSY: UploadItem["status"][] = ["queued", "preparing", "uploading", "retrying", "finalizing"];

/**
 * One upload row, driven by the app-level upload store (src/lib/uploads/uploadStore.ts) — so the same row is there when you leave a
 * project and come back. Real byte progress, never faked.
 */
export function UploadRow({ item, showWorkspace = false }: { item: UploadItem; showWorkspace?: boolean }) {
  const { cancel, retry, dismiss, pause, resume, resumeWithFile, isOffline } = useUploads();
  const pickRef = useRef<HTMLInputElement>(null);
  const inFlight = BUSY.includes(item.status);
  const canPause = item.method === "multipart" && (item.status === "uploading" || item.status === "retrying" || item.status === "preparing");
  const showBar = BUSY.includes(item.status) || item.status === "paused";

  return (
    <div className="flex items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme bg-surface-muted text-foreground-muted">
        <FileTypeIcon contentType={item.contentType} className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.fileName}
          {item.newVersionNumber ? <span className="ml-1.5 text-xs font-normal text-foreground-muted">new version v{item.newVersionNumber}</span> : null}
        </p>
        {showWorkspace && <p className="truncate text-[11px] text-foreground-muted">{item.workspaceName}</p>}
        {showBar && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
            </div>
            <span className="shrink-0 text-xs text-foreground-muted">{uploadStatusLine(item, isOffline)}</span>
          </div>
        )}
        {item.status === "failed" && <p className="text-xs text-red-500">{uploadStatusLine(item, isOffline)}</p>}
        {(item.status === "completed" || item.status === "cancelled") && <p className="text-xs text-foreground-muted">{uploadStatusLine(item, isOffline)}</p>}
      </div>

      {item.status === "completed" && <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-success" />}
      {item.status === "failed" && <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />}
      {item.status === "cancelled" && <Ban className="h-4.5 w-4.5 shrink-0 text-foreground-muted" />}
      {item.status === "finalizing" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground-muted" />}

      {item.needsFile && (
        <>
          <input
            ref={pickRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void resumeWithFile(item.uploadId, f);
            }}
          />
          <button onClick={() => pickRef.current?.click()} className="shrink-0 rounded-theme p-1 text-primary hover:bg-surface-muted" aria-label="Select the file to resume" title="Select the same file to continue">
            <FileUp className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {canPause && (
        <button onClick={() => pause(item.uploadId)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Pause upload" title="Pause (finished parts are kept)">
          <Pause className="h-3.5 w-3.5" />
        </button>
      )}
      {item.status === "paused" && !item.needsFile && (
        <button onClick={() => resume(item.uploadId)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Resume upload" title="Resume — only missing parts are sent">
          <Play className="h-3.5 w-3.5" />
        </button>
      )}
      {(item.status === "failed" || item.status === "cancelled") && item.file && (
        <button onClick={() => retry(item.uploadId)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Retry upload" title={item.method === "multipart" ? "Retry — continues with the parts already uploaded" : "Retry from the start"}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      {(item.status === "queued" || item.status === "preparing" || item.status === "uploading" || item.status === "retrying" || item.status === "paused") && (
        <button onClick={() => cancel(item.uploadId)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Cancel upload" title="Cancel upload">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {!inFlight && item.status !== "paused" && (
        <button onClick={() => dismiss(item.uploadId)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** The uploads of one project, as rows. Pass the already-filtered list (useProjectUploads). */
export function UploadProgressList({ items }: { items: UploadItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <UploadRow key={item.uploadId} item={item} />
      ))}
    </div>
  );
}
