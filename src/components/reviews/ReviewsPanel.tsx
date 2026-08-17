"use client";

import { useState } from "react";
import { MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReviewCard } from "./ReviewCard";
import { ReviewFormModal } from "./ReviewFormModal";
import { useReviews } from "@/hooks/useReviews";
import { useReviewActions } from "@/hooks/useReviewActions";

interface ReviewsPanelProps {
  projectId?: string; // omit for the workspace-wide /reviews page
  showProjectLink?: boolean;
}

/** Reusable Reviews list. Requesting a new review requires a project (used from the project's own Reviews tab). */
export function ReviewsPanel({ projectId, showProjectLink }: ReviewsPanelProps) {
  const { reviews, isLoading } = useReviews(projectId);
  const actions = useReviewActions();
  const [isFormOpen, setIsFormOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Review requests</h2>
        {projectId && (
          <Button size="sm" onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Request review
          </Button>
        )}
      </div>

      {!isLoading && reviews.length === 0 ? (
        <EmptyState icon={<MessageSquareText className="h-8 w-8" />} title="No reviews yet" description="Requested reviews and their approval status will show up here." />
      ) : (
        <div className="flex flex-col gap-3">
          {isLoading
            ? Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 w-full animate-pulse rounded-theme bg-surface-muted" />)
            : reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  showProjectLink={showProjectLink}
                  onApprove={(note) => actions.approve(review.id, note)}
                  onRequestChanges={(note) => actions.requestChanges(review.id, note)}
                  isSubmitting={actions.isSubmitting}
                />
              ))}
        </div>
      )}

      {projectId && (
        <ReviewFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          projectId={projectId}
          onCreate={async (title, fileIds) => {
            await actions.create(projectId, title, fileIds);
            setIsFormOpen(false);
          }}
          isSubmitting={actions.isSubmitting}
        />
      )}
    </div>
  );
}
