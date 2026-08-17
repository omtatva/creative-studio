import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { PRESET_PALETTES } from "@/lib/constants/theme";
import { BrandPalette } from "@/types/theme.types";

interface PalettePresetGridProps {
  activePaletteId: string | null;
  onApply: (palette: BrandPalette) => void;
}

/** Corporate/Modern/Dark/Light/Purple/Green/Orange/Blue quick-start palettes, plus a "Custom" tile that just clears the active-preset highlight. Applying one loads its colors into the draft — nothing is saved until "Save Theme". */
export function PalettePresetGrid({ activePaletteId, onApply }: PalettePresetGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
      {PRESET_PALETTES.map((palette) => (
        <button
          key={palette.id}
          onClick={() => onApply(palette)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-theme border p-2.5 transition-colors",
            activePaletteId === palette.id ? "border-primary bg-primary/5" : "border-border hover:bg-surface-muted"
          )}
        >
          <div className="relative flex h-8 w-full overflow-hidden rounded">
            <div className="flex-1" style={{ backgroundColor: palette.colors.primary.hex }} />
            <div className="flex-1" style={{ backgroundColor: palette.colors.secondary.hex }} />
            <div className="flex-1" style={{ backgroundColor: palette.colors.accent.hex }} />
            <div className="flex-1" style={{ backgroundColor: palette.colors.background.hex }} />
            {activePaletteId === palette.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="h-4 w-4 text-white" />
              </div>
            )}
          </div>
          <span className="text-xs font-medium text-foreground">{palette.name}</span>
        </button>
      ))}
      <div className={cn("flex flex-col items-center justify-center gap-1.5 rounded-theme border border-dashed p-2.5", !activePaletteId ? "border-primary bg-primary/5" : "border-border")}>
        <div className="flex h-8 w-full items-center justify-center rounded bg-surface-muted text-[10px] text-foreground-muted">Hand-picked</div>
        <span className="text-xs font-medium text-foreground">Custom</span>
      </div>
    </div>
  );
}
