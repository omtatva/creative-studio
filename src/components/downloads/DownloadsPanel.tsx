"use client";

import { Download } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileRow } from "@/components/files/FileRow";
import { useFiles } from "@/hooks/useFiles";

/** Approved deliverables only — "Connect Reviews with Downloads": a file only appears here once a review has approved it (ProjectFile.reviewStatus === "approved"). Reuses FileRow, no separate file-rendering logic. */
export function DownloadsPanel() {
  const { files, isLoading } = useFiles();
  const approved = files.filter((f) => f.reviewStatus === "approved");

  if (!isLoading && approved.length === 0) {
    return <EmptyState icon={<Download className="h-8 w-8" />} title="No approved deliverables yet" description="Files become available here once a review approves them." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {isLoading
        ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 w-full animate-pulse rounded-theme bg-surface-muted" />)
        : approved.map((file) => <FileRow key={file.id} file={file} showProjectLink />)}
    </div>
  );
}
