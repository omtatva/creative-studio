import { TaskStatusOption } from "@/types/settings.types";

export function TaskStatusBadge({ status }: { status: TaskStatusOption | undefined }) {
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
