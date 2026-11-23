"use client";

import { useState } from "react";
import { ChevronDown, UploadCloud } from "lucide-react";
import { UploadRow } from "@/components/creative/UploadProgressList";
import { useUploads } from "@/contexts/UploadContext";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

/**
 * Navbar entry point for the app-level upload manager: "Uploads (2)" while anything is in flight, with a non-blocking dropdown of every
 * upload (all of the user's workspaces; other workspaces are labelled). Hidden entirely when there are no uploads to show.
 */
export function UploadIndicator() {
  const { uploads, activeCount, isOffline, clearFinished } = useUploads();
  const { workspaceId } = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(open, () => setOpen(false));

  if (uploads.length === 0) return null;

  const lead = uploads.find((u) => u.status === "uploading" || u.status === "finalizing");
  const hasFinished = uploads.some((u) => u.status === "completed" || u.status === "failed" || u.status === "cancelled");
  const failed = uploads.filter((u) => u.status === "failed").length;
  const label = activeCount > 0 ? `Uploads (${activeCount})` : failed > 0 ? `Uploads · ${failed} failed` : "Uploads · done";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-theme px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-muted"
        aria-label={label}
        aria-expanded={open}
      >
        <UploadCloud className={activeCount > 0 ? "h-4.5 w-4.5 text-primary" : "h-4.5 w-4.5 text-foreground-muted"} />
        <span className="hidden sm:inline">{label}</span>
        {lead && <span className="hidden text-xs text-foreground-muted md:inline">{lead.status === "finalizing" ? "Finalizing..." : `${lead.progress}%`}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-theme border border-border bg-cards p-3 shadow-soft-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Uploads</p>
            {hasFinished && (
              <button onClick={clearFinished} className="text-xs font-medium text-primary hover:underline">
                Clear finished
              </button>
            )}
          </div>
          {isOffline && activeCount > 0 && <p className="mb-2 rounded-theme bg-warning/10 px-2.5 py-1.5 text-xs text-foreground">Connection lost — uploads will resume automatically when you&apos;re back online.</p>}
          <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {uploads.map((item) => (
              <UploadRow key={item.uploadId} item={item} showWorkspace={item.workspaceId !== workspaceId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
