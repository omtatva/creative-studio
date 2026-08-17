"use client";

import { useState } from "react";
import { Archive, Download, MoreHorizontal, Upload } from "lucide-react";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { AssetStatusBadge } from "@/components/creative/AssetStatusBadge";
import { formatBytes } from "@/lib/utils/fileFormat";
import { formatDate } from "@/lib/utils/date";
import { ProjectFile } from "@/types/file.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

interface FileInfoBarProps {
  asset: ProjectFile;
  versionCount: number;
  stageName: string | null;
  onUploadVersion: () => void;
  onDownload: () => void;
  onArchive: () => void;
}

/** Compact bottom status strip — thumbnail + file metadata + quick actions, distinct from the video's own transport controls above it. */
export function FileInfoBar({ asset, versionCount, stageName, onUploadVersion, onDownload, onArchive }: FileInfoBarProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreRef = useDismissableMenu<HTMLDivElement>(isMoreOpen, () => setIsMoreOpen(false));

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-border bg-surface px-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-theme bg-surface-muted text-foreground-muted">
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileTypeIcon contentType={asset.contentType} className="h-4.5 w-4.5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{asset.fileName}</p>
        <p className="truncate text-xs text-foreground-muted">
          {asset.contentType.split("/")[1]?.toUpperCase() ?? asset.assetType} · {formatBytes(asset.sizeBytes)} · Uploaded {formatDate(asset.createdAt)} by {asset.uploadedBy.displayName}
        </p>
      </div>

      <div className="hidden items-center gap-4 text-xs text-foreground-muted sm:flex">
        {stageName && (
          <div>
            <p className="text-foreground-muted/70">Stage</p>
            <p className="font-medium text-foreground">{stageName}</p>
          </div>
        )}
        <div>
          <p className="text-foreground-muted/70">Version</p>
          <p className="font-medium text-foreground">{asset.versionNumber} of {versionCount}</p>
        </div>
        <div>
          <p className="text-foreground-muted/70">Status</p>
          <AssetStatusBadge status={asset.reviewStatus} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button onClick={onUploadVersion} className="hidden rounded-theme p-2 text-foreground-muted hover:bg-surface-muted sm:block" aria-label="Upload new version" title="New version">
          <Upload className="h-4 w-4" />
        </button>
        <a href={asset.url} download={asset.fileName} onClick={onDownload} className="rounded-theme p-2 text-foreground-muted hover:bg-surface-muted" aria-label="Download" title="Download">
          <Download className="h-4 w-4" />
        </a>
        <div ref={moreRef} className="relative">
          <button onClick={() => setIsMoreOpen((v) => !v)} className="rounded-theme p-2 text-foreground-muted hover:bg-surface-muted" aria-label="More file actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {isMoreOpen && (
            <div className="absolute bottom-full right-0 z-10 mb-1 w-40 rounded-theme border border-border bg-surface py-1 shadow-soft-lg">
              <button
                onClick={() => {
                  setIsMoreOpen(false);
                  onArchive();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground-muted hover:bg-error/10 hover:text-error"
              >
                <Archive className="h-4 w-4" /> Archive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
