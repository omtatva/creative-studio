"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { retryVideoProcessing } from "@/services/processingService";
import { useToast } from "@/hooks/useToast";
import type { ProjectFile } from "@/types/file.types";

/**
 * The background-processing state of a video, in the user's words: "Processing" while the thumbnail/proxy are being made (the original is already
 * playable and downloadable), "Processing failed" with a Retry, nothing at all when ready. Never shown for non-videos or files that predate processing.
 */
export function ProcessingBadge({ file, compact = false }: { file: ProjectFile; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const p = file.processing;
  if (file.assetType !== "video" || !p) return null;

  if (p.status === "queued" || p.status === "processing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white" title="Preparing a smoother preview in the background. The original file is already available.">
        <Loader2 className="h-3 w-3 animate-spin" /> {compact ? "Processing" : "Processing preview"}
      </span>
    );
  }
  if (p.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-error/90 px-2 py-0.5 text-[11px] font-medium text-white" title={p.error ?? "Processing failed. The original file is unaffected."}>
        <AlertTriangle className="h-3 w-3" /> Processing failed
        <span
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={async (e) => {
            if (busy) return;
            e.stopPropagation();
            setBusy(true);
            try {
              await retryVideoProcessing(file.workspaceId, file.id);
              toast.success("Processing restarted");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't retry processing.");
            } finally {
              setBusy(false);
            }
          }}
          className="ml-1 inline-flex items-center gap-0.5 underline"
        >
          <RotateCcw className="h-3 w-3" /> Retry
        </span>
      </span>
    );
  }
  return null;
}
