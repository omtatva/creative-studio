"use client";

import { Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ImageUploadSlotProps {
  label: string;
  description?: string;
  previewUrl: string | null;
  onUpload: (file: File) => void;
  isUploading?: boolean;
  aspect?: "square" | "wide";
}

/** One upload-with-preview slot — the same shape covers Branding's logo/favicon/login-background/dashboard-background, so it's written once. */
export function ImageUploadSlot({ label, description, previewUrl, onUpload, isUploading, aspect = "square" }: ImageUploadSlotProps) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">{label}</p>
      {description && <p className="mb-2 text-xs text-foreground-muted">{description}</p>}
      <label
        className={cn(
          "relative flex cursor-pointer items-center justify-center overflow-hidden rounded-theme border border-dashed border-border bg-surface-muted hover:bg-surface-muted/70",
          aspect === "square" ? "h-24 w-24" : "h-28 w-full"
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <Upload className="h-5 w-5 text-foreground-muted" />
        )}
        {isUploading && <div className="absolute inset-0 flex items-center justify-center bg-surface/70 text-xs text-foreground-muted">Uploading...</div>}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
          }}
        />
      </label>
    </div>
  );
}
