import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ProjectColorPickerProps {
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}

/** Renders the palette from WorkspaceSettings.projectOptions.colors — never a fixed swatch list. */
export function ProjectColorPicker({ colors, value, onChange }: ProjectColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition-transform hover:scale-105",
            value === color ? "ring-foreground" : "ring-transparent"
          )}
          style={{ backgroundColor: `rgb(${color})` }}
          aria-label={`Color ${color}`}
        >
          {value === color && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
