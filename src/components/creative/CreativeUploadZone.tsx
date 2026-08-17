"use client";

import { useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { ACCEPTED_FILE_INPUT } from "@/lib/constants/creativeFiles";

interface CreativeUploadZoneProps {
  onFiles: (files: File[]) => void;
  /** When true, drops/browsing are inert — used while "All stages" is active and no destination stage has been chosen yet, so an upload can never silently land on an arbitrary stage. */
  disabled?: boolean;
  disabledMessage?: string;
}

/** Drag-and-drop surface for the Creative Workspace canvas — real file drops, no simulated/fake upload behavior. */
export function CreativeUploadZone({ onFiles, disabled, disabledMessage }: CreativeUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    if (e.dataTransfer.files?.length) onFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-theme border-2 border-dashed p-8 text-center transition-colors",
        disabled
          ? "cursor-not-allowed border-border bg-surface-muted/30 opacity-60"
          : isDragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-surface-muted/50"
      )}
    >
      <UploadCloud className={cn("h-8 w-8", !disabled && isDragOver ? "text-primary" : "text-foreground-muted")} />
      {disabled ? (
        <p className="text-sm font-medium text-foreground-muted">{disabledMessage ?? "Uploads are disabled"}</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">Drag & drop creative files here</p>
          <p className="text-xs text-foreground-muted">MP4, MOV, WEBM, JPG, PNG, SVG, PDF, MP3, WAV — multiple files supported</p>
          <label className="mt-1 cursor-pointer text-sm font-medium text-primary hover:underline">
            or browse files
            <input
              type="file"
              multiple
              accept={ACCEPTED_FILE_INPUT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) onFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
