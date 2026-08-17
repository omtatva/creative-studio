"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { formatBytes } from "@/lib/utils/fileFormat";

export interface UploadQueueItem {
  id: string;
  file: File;
  status: "uploading" | "success" | "error";
  progress: number;
  error?: string;
}

/** Real per-file upload progress/success/error — never faked (see fileService.uploadProjectFile / uploadFileWithProgress). */
export function UploadProgressList({ items, onDismiss }: { items: UploadQueueItem[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme bg-surface-muted text-foreground-muted">
            <FileTypeIcon contentType={item.file.type} className="h-4.5 w-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
            {item.status === "uploading" && (
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${item.progress}%` }} />
                </div>
                <span className="shrink-0 text-xs text-foreground-muted">{item.progress}%</span>
              </div>
            )}
            {item.status === "error" && <p className="text-xs text-red-500">{item.error ?? "Upload failed"}</p>}
            {item.status === "success" && <p className="text-xs text-foreground-muted">{formatBytes(item.file.size)} · Uploaded</p>}
          </div>

          {item.status === "success" && <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-success" />}
          {item.status === "error" && <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-500" />}

          {item.status !== "uploading" && (
            <button onClick={() => onDismiss(item.id)} className="shrink-0 rounded-theme p-1 text-foreground-muted hover:bg-surface-muted" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
