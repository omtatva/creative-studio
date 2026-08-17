"use client";

import { useState } from "react";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { BrandColor } from "@/types/theme.types";

interface ColorRoleRowProps {
  label: string;
  description: string;
  color: BrandColor;
  onChange: (color: BrandColor) => void;
}

/** One customizable role — swatch button opens the full picker; the row's own preview text updates live as the popover is used, satisfying "live preview before saving" at the per-role level. */
export function ColorRoleRow({ label, description, color, onChange }: ColorRoleRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex items-center gap-3 rounded-theme border border-border px-3 py-2.5">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="h-9 w-9 shrink-0 rounded-theme border border-border shadow-soft"
        style={{ backgroundColor: color.hex, opacity: color.opacity / 100 }}
        aria-label={`Edit ${label} color`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-foreground-muted">{description}</p>
      </div>
      <span className="shrink-0 font-mono text-xs text-foreground-muted">
        {color.hex.toUpperCase()}
        {color.opacity < 100 && ` · ${color.opacity}%`}
      </span>

      {isOpen && <ColorPickerPopover color={color} onChange={onChange} onClose={() => setIsOpen(false)} />}
    </div>
  );
}
