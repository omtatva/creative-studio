"use client";

import { Play, Trash2 } from "lucide-react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { AssetStatusBadge } from "./AssetStatusBadge";
import { formatBytes } from "@/lib/utils/fileFormat";
import { AssetGroup } from "@/lib/utils/assetVersions";

/** One creative asset in the canvas grid — thumbnail (or type icon), name, version, status. Click navigates to the full-screen Creative Review Workspace. */
export function AssetCard({ group, onClick, onDelete }: { group: AssetGroup; onClick: () => void; onDelete?: () => void }) {
  const asset = group.latest;

  return (
    <div className="group/card relative">
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${asset.fileName}`}
        title="Delete"
        className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/60 p-1.5 text-white opacity-100 transition-opacity hover:bg-error sm:opacity-0 sm:group-hover/card:opacity-100 sm:focus:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    )}
    <button
      onClick={onClick}
      className="group flex w-full flex-col overflow-hidden rounded-theme border border-border bg-surface text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-soft-lg"
    >
      <div className="relative flex aspect-video items-center justify-center bg-surface-muted">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt={asset.fileName} className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon contentType={asset.contentType} className="h-8 w-8 text-foreground-muted" />
        )}
        {asset.assetType === "video" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
            <Play className="h-8 w-8 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" fill="currentColor" />
          </div>
        )}
        {group.versions.length > 1 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            {group.versions.length} versions
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p className="truncate text-sm font-medium text-foreground">{asset.fileName}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-foreground-muted">v{asset.versionNumber} · {formatBytes(asset.sizeBytes)}</span>
          <AssetStatusBadge status={asset.reviewStatus} />
        </div>
      </div>
    </button>
    </div>
  );
}
