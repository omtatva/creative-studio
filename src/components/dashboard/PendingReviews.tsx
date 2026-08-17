"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileTypeIcon } from "@/components/files/FileTypeIcon";
import { useFiles } from "@/hooks/useFiles";
import { fileReviewRoute, ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/utils/date";

/** Workspace-wide files still awaiting review — live Firestore data via useFiles, same hook the Files page uses. */
export function PendingReviews() {
  const { files, isLoading } = useFiles();
  const pending = files.filter((f) => f.reviewStatus === "pending_review" && f.isLatestVersion).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Reviews</CardTitle>
        {pending.length > 0 && (
          <Link href={ROUTES.reviews} className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        )}
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-theme bg-surface-muted" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="h-8 w-8" />} title="Nothing waiting" description="Files submitted for review will appear here." />
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {pending.map((file) => (
            <Link
              key={file.id}
              href={fileReviewRoute(file.projectId, file.stageId ?? "none", file.id)}
              className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <FileTypeIcon contentType={file.contentType} className="h-4 w-4 shrink-0 text-foreground-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{file.fileName}</span>
              <span className="shrink-0 text-xs text-foreground-muted">{formatDate(file.createdAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
