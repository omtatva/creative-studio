"use client";

import { useState } from "react";
import { Save, Trash2, Check } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { BrandPalette } from "@/types/theme.types";

interface SavedPalettesPanelProps {
  palettes: BrandPalette[];
  activePaletteId: string | null;
  onApply: (palette: BrandPalette) => void;
  onDelete: (palette: BrandPalette) => void;
  onSaveCurrent: (name: string) => Promise<void>;
  isSaving: boolean;
}

/** "Support multiple saved brand palettes" — the workspace's own named color sets, distinct from the built-in presets in PalettePresetGrid. */
export function SavedPalettesPanel({ palettes, activePaletteId, onApply, onDelete, onSaveCurrent, isSaving }: SavedPalettesPanelProps) {
  const [name, setName] = useState("");

  async function handleSave() {
    if (!name.trim()) return;
    await onSaveCurrent(name.trim());
    setName("");
  }

  return (
    <div className="flex flex-col gap-3">
      {palettes.length === 0 ? (
        <p className="text-sm text-foreground-muted">No saved palettes yet — save your current colors below to build a library.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {palettes.map((palette) => (
            <div
              key={palette.id}
              className={cn("flex items-center gap-3 rounded-theme border px-3 py-2", activePaletteId === palette.id ? "border-primary bg-primary/5" : "border-border")}
            >
              <div className="flex h-6 w-16 overflow-hidden rounded">
                <div className="flex-1" style={{ backgroundColor: palette.colors.primary.hex }} />
                <div className="flex-1" style={{ backgroundColor: palette.colors.secondary.hex }} />
                <div className="flex-1" style={{ backgroundColor: palette.colors.accent.hex }} />
              </div>
              <span className="flex-1 text-sm font-medium text-foreground">{palette.name}</span>
              {activePaletteId === palette.id && <Check className="h-4 w-4 text-primary" />}
              <Button size="sm" variant="outline" onClick={() => onApply(palette)}>Apply</Button>
              <button onClick={() => onDelete(palette)} className="rounded-theme p-1.5 text-foreground-muted hover:bg-red-500/10 hover:text-red-500" aria-label="Delete palette">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this color set..." className="flex-1" />
        <Button size="sm" variant="outline" onClick={handleSave} isLoading={isSaving} disabled={!name.trim()}>
          <Save className="h-4 w-4" />
          Save as palette
        </Button>
      </div>
    </div>
  );
}
