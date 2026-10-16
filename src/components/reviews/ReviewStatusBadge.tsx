import { ReviewStatus } from "@/types/review.types";
import { cn } from "@/lib/utils/cn";

// Full class strings, not template-built — Tailwind's JIT compiler only
// picks up classes it can see literally in source.
const CONFIG: Record<ReviewStatus, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-surface-muted text-foreground-muted" },
  waiting: { label: "Waiting for review", classes: "bg-warning/10 text-warning" },
  in_review: { label: "In review", classes: "bg-primary/10 text-primary" },
  pending: { label: "Pending", classes: "bg-warning/10 text-warning" },
  approved: { label: "Approved", classes: "bg-success/10 text-success" },
  changes_requested: { label: "Changes requested", classes: "bg-error/10 text-error" },
};

const DOT_CLASSES: Record<ReviewStatus, string> = {
  draft: "bg-foreground-muted",
  waiting: "bg-warning",
  in_review: "bg-primary",
  pending: "bg-warning",
  approved: "bg-success",
  changes_requested: "bg-error",
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const { label, classes } = CONFIG[status] ?? CONFIG.waiting;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", classes)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASSES[status] ?? DOT_CLASSES.waiting)} />
      {label}
    </span>
  );
}
