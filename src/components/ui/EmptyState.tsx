import { type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Reusable "nothing here yet" block for placeholder dashboard cards
 * and settings pages that don't have data/logic wired up yet.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      {icon && <div className="mb-1 text-foreground-muted">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-foreground-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
