import { cn } from "@/lib/utils/cn";
import { PROJECT_ICON_MAP } from "@/lib/constants/projectIconMap";

interface ProjectIconPickerProps {
  icons: string[];
  value: string;
  color: string;
  onChange: (icon: string) => void;
}

/** Renders the icon set from WorkspaceSettings.projectOptions.icons via the shared key→component map. */
export function ProjectIconPicker({ icons, value, color, onChange }: ProjectIconPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {icons.map((iconKey) => {
        const Icon = PROJECT_ICON_MAP[iconKey];
        if (!Icon) return null;
        const isActive = value === iconKey;
        return (
          <button
            key={iconKey}
            type="button"
            onClick={() => onChange(iconKey)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-theme border transition-colors",
              isActive ? "border-primary bg-primary/10" : "border-border hover:bg-surface-muted"
            )}
            aria-label={iconKey}
          >
            <Icon className="h-4.5 w-4.5" style={{ color: isActive ? `rgb(${color})` : undefined }} />
          </button>
        );
      })}
    </div>
  );
}
