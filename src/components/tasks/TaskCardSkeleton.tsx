export function TaskCardSkeleton() {
  return (
    <div className="rounded-theme border border-border bg-surface p-4">
      <div className="h-4 w-1/2 animate-pulse rounded bg-surface-muted" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-5 w-16 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-5 w-14 animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}
