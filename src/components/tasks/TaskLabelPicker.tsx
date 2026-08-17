import { cn } from "@/lib/utils/cn";
import { TaskLabelOption } from "@/types/settings.types";

interface TaskLabelPickerProps {
  labels: TaskLabelOption[];
  value: string[];
  onChange: (labelIds: string[]) => void;
}

/** Multi-select chip picker rendering the curated label taxonomy from Settings — distinct from free-form Tags. */
export function TaskLabelPicker({ labels, value, onChange }: TaskLabelPickerProps) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label) => {
        const active = value.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => toggle(label.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-theme border px-2.5 py-1 text-xs font-medium transition-colors"
            )}
            style={{
              borderColor: active ? `rgb(${label.color})` : "rgb(var(--color-border))",
              backgroundColor: active ? `rgb(${label.color} / 0.12)` : "transparent",
              color: active ? `rgb(${label.color})` : "rgb(var(--color-foreground-muted))",
            }}
          >
            {label.label}
          </button>
        );
      })}
    </div>
  );
}
