export function BoardCardSkeleton() {
  return (
    <div className="rounded-theme border border-border bg-surface p-3">
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-surface-muted" />
      <div className="mt-3 flex items-center justify-between">
        <div className="h-4 w-12 animate-pulse rounded bg-surface-muted" />
        <div className="h-6 w-6 animate-pulse rounded-full bg-surface-muted" />
      </div>
    </div>
  );
}

export function BoardColumnSkeleton() {
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2 rounded-theme border border-border bg-surface-muted/40 p-2.5">
      <div className="h-5 w-24 animate-pulse rounded bg-surface-muted" />
      {Array.from({ length: 3 }).map((_, i) => (
        <BoardCardSkeleton key={i} />
      ))}
    </div>
  );
}
