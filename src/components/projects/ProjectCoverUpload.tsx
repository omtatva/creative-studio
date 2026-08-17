"use client";

import { ImagePlus, X } from "lucide-react";

interface ProjectCoverUploadProps {
  previewUrl: string | null;
  onSelect: (file: File | null) => void;
}

export function ProjectCoverUpload({ previewUrl, onSelect }: ProjectCoverUploadProps) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">Cover image</p>
      {previewUrl ? (
        <div className="relative h-32 w-full overflow-hidden rounded-theme border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Cover preview" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Remove cover image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-theme border border-dashed border-border bg-surface-muted text-foreground-muted hover:bg-surface-muted/70">
          <ImagePlus className="h-5 w-5" />
          <span className="text-xs">Click to upload a cover image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}
