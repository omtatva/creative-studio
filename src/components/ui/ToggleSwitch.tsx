"use client";

import { cn } from "@/lib/utils/cn";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Shared on/off switch. Extracted from an inline pattern first
 * written for BoardSettingsModal's auto-sort toggle — now the one
 * toggle every settings page (Security, Notifications, Storage,
 * Users) uses, instead of each re-implementing the same markup.
 */
export function ToggleSwitch({ checked, onChange, label, description, disabled }: ToggleSwitchProps) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-surface-muted")}
    >
      <span className={cn("block h-4 w-4 translate-y-0.5 rounded-full bg-white transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );

  if (!label) return toggle;

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-foreground-muted">{description}</p>}
      </div>
      {toggle}
    </div>
  );
}
