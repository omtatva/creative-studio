import { type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * Shared shell for tabs outside this module's scope (Tasks, Board,
 * Files, Reviews, Activity) — the nested route/nav exists per spec,
 * but the underlying collections (tasks, files, reviews) belong to
 * separate future modules.
 */
export function ProjectPlaceholderTab({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-theme bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-xs text-xs text-foreground-muted">{description}</p>
      </div>
    </Card>
  );
}
