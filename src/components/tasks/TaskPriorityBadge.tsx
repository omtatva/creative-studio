import { TaskPriorityOption } from "@/types/settings.types";

export function TaskPriorityBadge({ priority }: { priority: TaskPriorityOption | undefined }) {
  if (!priority) return null;
  return (
    <span
      className="inline-flex items-center rounded-theme border px-2 py-0.5 text-xs font-medium"
      style={{
        borderColor: `rgb(${priority.color} / 0.35)`,
        color: `rgb(${priority.color})`,
        backgroundColor: `rgb(${priority.color} / 0.06)`,
      }}
    >
      {priority.label}
    </span>
  );
}
