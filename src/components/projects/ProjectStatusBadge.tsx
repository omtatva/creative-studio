import { Badge } from "@/components/ui/Badge";
import { ProjectStatusOption } from "@/types/settings.types";

/**
 * Renders directly from a ProjectStatusOption resolved via
 * useProjectOptions — never a hardcoded status label/color.
 */
export function ProjectStatusBadge({ status }: { status: ProjectStatusOption | undefined }) {
  if (!status) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `rgb(${status.color} / 0.12)`, color: `rgb(${status.color})` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(${status.color})` }} />
      {status.label}
    </span>
  );
}
