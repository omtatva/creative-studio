"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { FileTypeIcon } from "./FileTypeIcon";
import { AssetStatusBadge } from "@/components/creative/AssetStatusBadge";
import { ProjectFile } from "@/types/file.types";
import { formatBytes } from "@/lib/utils/fileFormat";
import { formatDate } from "@/lib/utils/date";
import { fileReviewRoute, projectRoute } from "@/lib/constants/routes";

interface FileRowProps {
  file: ProjectFile;
  /** Older versions of the same asset (newest first, excluding `file` itself) — see lib/utils/assetVersions.groupAssetVersions. Omitted files never had versioning and render as a plain single row. */
  previousVersions?: ProjectFile[];
  showProjectLink?: boolean;
  onDelete?: (file: ProjectFile) => void;
}

/** One row in any file list — Files, Downloads, and a project's own Files tab all render this. Same data the Creative Workspace's AssetCard renders, just as a row. */
export function FileRow({ file, previousVersions = [], showProjectLink, onDelete }: FileRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasVersions = previousVersions.length > 0;

  return (
    <div className="rounded-theme border border-border bg-surface">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Link
          href={fileReviewRoute(file.projectId, file.stageId ?? "none", file.id)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-theme bg-surface-muted text-foreground-muted transition-colors hover:bg-primary/10 hover:text-primary"
          aria-label={`Open ${file.fileName} in review`}
        >
          <FileTypeIcon contentType={file.contentType} className="h-4.5 w-4.5" />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={fileReviewRoute(file.projectId, file.stageId ?? "none", file.id)} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline">
            {file.fileName} {file.versionNumber > 1 && <span className="text-xs font-normal text-foreground-muted">v{file.versionNumber}</span>}
          </Link>
          <p className="truncate text-xs text-foreground-muted">
            {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)} · {file.uploadedBy.displayName}
            {showProjectLink && (
              <>
                {" · "}
                <Link href={projectRoute(file.projectId)} className="text-primary hover:underline">
                  View project
                </Link>
              </>
            )}
          </p>
        </div>

        {file.reviewStatus !== "none" && <AssetStatusBadge status={file.reviewStatus} className="shrink-0" />}

        {hasVersions && (
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-theme px-2 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
          >
            {previousVersions.length + 1} versions
            <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
          </button>
        )}

        <Avatar name={file.uploadedBy.displayName} src={file.uploadedBy.photoURL} size="sm" />

        <a href={file.url} download={file.fileName} className="rounded-theme p-1.5 text-foreground-muted hover:bg-surface-muted" aria-label="Download">
          <Download className="h-4 w-4" />
        </a>

        {onDelete && (
          <button onClick={() => onDelete(file)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-error/10 hover:text-error" aria-label="Delete file">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {isExpanded && hasVersions && (
        <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2.5 pl-[3.25rem]">
          {previousVersions.map((v) => (
            <div key={v.id} className="flex items-center justify-between text-xs text-foreground-muted">
              <span>
                v{v.versionNumber} · {formatBytes(v.sizeBytes)} · {v.uploadedBy.displayName} · {formatDate(v.createdAt)}
              </span>
              <div className="flex items-center gap-2">
                <AssetStatusBadge status={v.reviewStatus} />
                <a href={v.url} download={v.fileName} className="text-primary hover:underline">
                  Download
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
