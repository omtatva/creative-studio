"use client";

import { Trash2 } from "lucide-react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { AssetStatusBadge } from "./AssetStatusBadge";
import { formatBytes } from "@/lib/utils/fileFormat";
import { formatDate } from "@/lib/utils/date";
import { AssetGroup } from "@/lib/utils/assetVersions";

/** List-view row for the Creative Workspace home — same data as AssetCard, denser layout. */
export function AssetListRow({ group, onClick, onDelete }: { group: AssetGroup; onClick: () => void; onDelete?: () => void }) {
  const asset = group.latest;

  return (
    <div className="flex items-center gap-2">
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-theme border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-muted"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-theme bg-surface-muted text-foreground-muted">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt={asset.fileName} className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon contentType={asset.contentType} className="h-4.5 w-4.5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{asset.fileName}</p>
        <p className="truncate text-xs text-foreground-muted">
          v{asset.versionNumber} · {formatBytes(asset.sizeBytes)} · updated {formatDate(asset.createdAt)}
          {group.versions.length > 1 && ` · ${group.versions.length} versions`}
        </p>
      </div>

      <AssetStatusBadge status={asset.reviewStatus} />
    </button>
    {onDelete && (
      <button type="button" onClick={onDelete} aria-label={`Delete ${asset.fileName}`} title="Delete" className="shrink-0 rounded-theme p-2 text-foreground-muted hover:bg-error/10 hover:text-error">
        <Trash2 className="h-4 w-4" />
      </button>
    )}
    </div>
  );
}
