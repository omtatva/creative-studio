"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { Review } from "@/types/review.types";
import { formatDate } from "@/lib/utils/date";
import { projectRoute } from "@/lib/constants/routes";
import { aggregateRound, progressLabel } from "@/lib/reviewRounds";
import { useCurrentMemberRole } from "@/hooks/useCurrentMemberRole";

interface ReviewCardProps {
  review: Review;
  showProjectLink?: boolean;
  onApprove: (note: string | null) => void;
  onRequestChanges: (note: string) => void;
  isSubmitting: boolean;
}

/** One review request — file bundle + status + approve/request-changes actions for pending reviews. */
export function ReviewCard({ review, showProjectLink, onApprove, onRequestChanges, isSubmitting }: ReviewCardProps) {
  const [note, setNote] = useState("");
  const [isNoting, setIsNoting] = useState(false);
  const { canApproveReviews } = useCurrentMemberRole();

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{review.title}</p>
          <p className="mt-0.5 text-xs text-foreground-muted">
            Requested by {review.requestedBy.displayName} · {formatDate(review.createdAt)}
            {showProjectLink && (
              <>
                {" · "}
                <Link href={projectRoute(review.projectId)} className="text-primary hover:underline">
                  View project
                </Link>
              </>
            )}
          </p>
        </div>
        <ReviewStatusBadge status={review.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          {review.fileIds.length} file{review.fileIds.length === 1 ? "" : "s"}
        </span>
        {review.schemaVersion === 2 && (
          <>
            <span>Round {review.roundNumber} · v{review.version}</span>
            <span>{progressLabel(aggregateRound(Object.values(review.reviewers ?? {})))}</span>
            {review.supersededByRoundId && <span>Superseded by a newer round</span>}
          </>
        )}
      </div>

      {review.schemaVersion !== 2 && review.reviewedBy && (
        <div className="mt-3 flex items-center gap-2 rounded-theme bg-surface-muted px-2.5 py-2 text-xs text-foreground-muted">
          <Avatar name={review.reviewedBy.displayName} src={review.reviewedBy.photoURL} size="sm" />
          <span>
            {review.status === "approved" ? "Approved" : "Changes requested"} by {review.reviewedBy.displayName}
            {review.reviewNote && `: "${review.reviewNote}"`}
          </span>
        </div>
      )}

      {review.schemaVersion !== 2 && review.status === "pending" && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {canApproveReviews ? (
            <>
              {isNoting && (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional for approve, required for changes)"
                  className="h-9 w-full rounded-theme border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              )}
              <div className="flex justify-end gap-2">
                {!isNoting && (
                  <Button size="sm" variant="outline" onClick={() => setIsNoting(true)}>
                    Add note
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onRequestChanges(note || "Please revise and resubmit.")} isLoading={isSubmitting}>
                  Request changes
                </Button>
                <Button size="sm" onClick={() => onApprove(note || null)} isLoading={isSubmitting}>
                  Approve
                </Button>
              </div>
            </>
          ) : (
            <p className="text-xs text-foreground-muted">Only workspace owners and admins can approve or request changes on a review.</p>
          )}
        </div>
      )}
    </Card>
  );
}
