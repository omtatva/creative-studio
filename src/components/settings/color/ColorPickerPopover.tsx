"use client";

import { useEffect, useState } from "react";
import { HueSlider } from "./HueSlider";
import { SaturationLightnessPad } from "./SaturationLightnessPad";
import { OpacitySlider } from "./OpacitySlider";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { COLOR_PALETTE } from "@/lib/constants/colorPalette";
import {
  hexToHsl,
  hslToHex,
  hexToRgb,
  rgbToHex,
  parseAnyColor,
  normalizeHex,
  isValidHex,
} from "@/lib/utils/color";
import { BrandColor } from "@/types/theme.types";
import { useDismissableMenu } from "@/hooks/useDismissableMenu";

type InputMode = "hex" | "rgb" | "hsl";

interface ColorPickerPopoverProps {
  color: BrandColor;
  onChange: (color: BrandColor) => void;
  onClose: () => void;
}

/**
 * The full unlimited-color picker: saturation/lightness pad + hue
 * slider + opacity slider, with HEX/RGB/HSL tabs for typing exact
 * values, plus quick preset swatches. Every field is two-way bound —
 * dragging the pad updates the hex input and vice versa. Emits
 * onChange on every edit so the caller can live-preview immediately;
 * nothing here touches Firestore itself.
 */
export function ColorPickerPopover({ color, onChange, onClose }: ColorPickerPopoverProps) {
  const [mode, setMode] = useState<InputMode>("hex");
  const [hexInput, setHexInput] = useState(color.hex);
  const [customInput, setCustomInput] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const hsl = hexToHsl(color.hex);
  const rgb = hexToRgb(color.hex);

  useEffect(() => {
    setHexInput(color.hex);
  }, [color.hex]);

  const ref = useDismissableMenu<HTMLDivElement>(true, onClose);

  function updateHex(hex: string) {
    onChange({ ...color, hex });
  }

  function handleHexInputChange(value: string) {
    setHexInput(value);
    if (isValidHex(value)) updateHex(normalizeHex(value));
  }

  function handleCustomSubmit() {
    const parsed = parseAnyColor(customInput);
    if (!parsed) {
      setCustomError("Enter a valid hex, rgb(), or hsl() value");
      return;
    }
    setCustomError(null);
    updateHex(parsed);
    setCustomInput("");
  }

  return (
    <div ref={ref} className="absolute z-30 mt-2 w-72 rounded-theme border border-border bg-cards p-3 shadow-soft-lg">
      <SaturationLightnessPad
        hue={hsl.h}
        saturation={hsl.s}
        lightness={hsl.l}
        onChange={(s, l) => updateHex(hslToHex({ h: hsl.h, s, l }))}
      />

      <div className="mt-3 flex items-center gap-3">
        <div
          className="h-9 w-9 shrink-0 rounded-theme border border-border"
          style={{ backgroundColor: color.hex, opacity: color.opacity / 100 }}
        />
        <div className="flex-1">
          <HueSlider hue={hsl.h} onChange={(h) => updateHex(hslToHex({ h, s: hsl.s, l: hsl.l }))} />
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-foreground-muted">Opacity: {color.opacity}%</p>
        <OpacitySlider hex={color.hex} opacity={color.opacity} onChange={(opacity) => onChange({ ...color, opacity })} />
      </div>

      <div className="mt-3 flex gap-1 rounded-theme border border-border p-0.5">
        {(["hex", "rgb", "hsl"] as InputMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn("flex-1 rounded px-2 py-1 text-xs font-medium uppercase", mode === m ? "bg-primary/10 text-primary" : "text-foreground-muted hover:bg-surface-muted")}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {mode === "hex" && <Input value={hexInput} onChange={(e) => handleHexInputChange(e.target.value)} placeholder="#6366f1" />}
        {mode === "rgb" && (
          <div className="grid grid-cols-3 gap-1.5">
            <Input type="number" min={0} max={255} value={rgb.r} onChange={(e) => updateHex(rgbToHex({ ...rgb, r: Number(e.target.value) }))} />
            <Input type="number" min={0} max={255} value={rgb.g} onChange={(e) => updateHex(rgbToHex({ ...rgb, g: Number(e.target.value) }))} />
            <Input type="number" min={0} max={255} value={rgb.b} onChange={(e) => updateHex(rgbToHex({ ...rgb, b: Number(e.target.value) }))} />
          </div>
        )}
        {mode === "hsl" && (
          <div className="grid grid-cols-3 gap-1.5">
            <Input type="number" min={0} max={360} value={hsl.h} onChange={(e) => updateHex(hslToHex({ ...hsl, h: Number(e.target.value) }))} />
            <Input type="number" min={0} max={100} value={hsl.s} onChange={(e) => updateHex(hslToHex({ ...hsl, s: Number(e.target.value) }))} />
            <Input type="number" min={0} max={100} value={hsl.l} onChange={(e) => updateHex(hslToHex({ ...hsl, l: Number(e.target.value) }))} />
          </div>
        )}
      </div>

      <div className="mt-2">
        <div className="flex gap-1.5">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            placeholder="Type any hex, rgb(), or hsl()..."
            error={customError ?? undefined}
            className="flex-1"
          />
          <button onClick={handleCustomSubmit} className="rounded-theme border border-border px-3 text-xs font-medium text-foreground-muted hover:bg-surface-muted">
            Use
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {COLOR_PALETTE.map((channels) => {
          const hex = rgbToHex({ r: Number(channels.split(" ")[0]), g: Number(channels.split(" ")[1]), b: Number(channels.split(" ")[2]) });
          return (
            <button
              key={channels}
              onClick={() => updateHex(hex)}
              className="h-6 w-6 rounded-full ring-1 ring-border ring-offset-1 ring-offset-cards hover:scale-110"
              style={{ backgroundColor: hex }}
              aria-label={hex}
            />
          );
        })}
      </div>
    </div>
  );
}
