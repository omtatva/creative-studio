"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AssetStatusBadge } from "@/components/creative/AssetStatusBadge";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/fileFormat";
import { formatDate } from "@/lib/utils/date";
import { ProjectFile } from "@/types/file.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

/** Toolbar version selector — "Version 1 ▼" with each version's number/status/uploader/date/size, per the spec. Reuses the existing ProjectFile/files versioning model, no second version system. */
export function VersionDropdown({ versions, active, onSelect }: { versions: ProjectFile[]; active: ProjectFile; onSelect: (v: ProjectFile) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useDismissableMenu<HTMLDivElement>(isOpen, () => setIsOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-theme px-2.5 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
      >
        Version {active.versionNumber}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-theme border border-border bg-surface py-1 shadow-soft-lg">
          {[...versions].sort((a, b) => b.versionNumber - a.versionNumber).map((v) => (
            <button
              key={v.id}
              onClick={() => {
                onSelect(v);
                setIsOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-muted",
                v.id === active.id && "bg-primary/5"
              )}
            >
              <Avatar name={v.uploadedBy.displayName} src={v.uploadedBy.photoURL} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  Version {v.versionNumber} {v.isLatestVersion && <span className="text-xs font-normal text-foreground-muted">(latest)</span>}
                </p>
                <p className="truncate text-xs text-foreground-muted">
                  {v.uploadedBy.displayName} · {formatDate(v.createdAt)} · {formatBytes(v.sizeBytes)}
                </p>
              </div>
              <AssetStatusBadge status={v.reviewStatus} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
