import { Card } from "@/components/ui/Card";

/** Loading placeholder matching ProjectCard's layout to avoid content jump. */
export function ProjectCardSkeleton() {
  return (
    <Card noPadding className="overflow-hidden">
      <div className="h-28 w-full animate-pulse bg-surface-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-muted" />
        <div className="flex gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-5 w-14 animate-pulse rounded bg-surface-muted" />
        </div>
        <div className="h-1.5 w-full animate-pulse rounded-full bg-surface-muted" />
        <div className="flex justify-between">
          <div className="h-7 w-16 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
    </Card>
  );
}

export function ProjectListRowSkeleton() {
  return <div className="h-[68px] w-full animate-pulse rounded-theme border border-border bg-surface-muted/60" />;
}
