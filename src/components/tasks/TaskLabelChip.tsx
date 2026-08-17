import { TaskLabelOption } from "@/types/settings.types";

export function TaskLabelChip({ label }: { label: TaskLabelOption | undefined }) {
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-theme px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `rgb(${label.color} / 0.1)`, color: `rgb(${label.color})` }}
    >
      {label.label}
    </span>
  );
}
