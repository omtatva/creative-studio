import { ReviewsPanel } from "@/components/reviews/ReviewsPanel";

export default function ReviewsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reviews</h1>
        <p className="mt-1 text-sm text-foreground-muted">Review requests across every project, and their approval status.</p>
      </div>
      <ReviewsPanel showProjectLink />
    </div>
  );
}
