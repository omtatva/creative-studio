"use client";

import { Check } from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { Card } from "@/components/ui/Card";
import { Loader } from "@/components/ui/Loader";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/useToast";
import { cn } from "@/lib/utils/cn";
import { ThemeSettings } from "@/types/theme.types";

const MODES: { value: ThemeSettings["mode"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const RADII: { value: ThemeSettings["borderRadius"]; label: string }[] = [
  { value: "none", label: "None" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
];

const FONTS: { value: ThemeSettings["fontFamily"]; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "system", label: "System UI" },
];

const CARD_STYLES: { value: ThemeSettings["cardStyle"]; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "soft", label: "Soft shadow" },
  { value: "glass", label: "Glass" },
];

const SIDEBAR_STYLES: { value: ThemeSettings["sidebarStyle"]; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "glass", label: "Glass" },
];

/**
 * Every control here calls ThemeContext.setTheme, which already
 * applies the change to CSS variables immediately (see
 * ThemeContext.tsx's applyThemeToDocument) AND persists to
 * settings.theme in Firestore in the same call — so "Live Preview"
 * and "Persist in Firestore" are both already true of the existing
 * architecture; this page is purely the UI for controls that were
 * previously only reachable by editing Firestore by hand.
 */
export default function ThemeSettingsPage() {
  const { theme, setTheme, isLoading } = useTheme();
  const toast = useToast();

  async function update(patch: Partial<ThemeSettings>) {
    try {
      await setTheme(patch);
      toast.success("Theme updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update theme");
    }
  }

  if (isLoading) return <Loader label="Loading theme..." />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Theme</h1>
        <p className="mt-1 text-sm text-foreground-muted">Changes apply instantly across the whole app.</p>
      </div>

      <SettingsSection title="Mode">
        <div className="flex gap-2">
          {MODES.map((m) => (
            <OptionButton key={m.value} active={theme.mode === m.value} onClick={() => update({ mode: m.value })}>
              {m.label}
            </OptionButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Typography">
        <div className="flex gap-2">
          {FONTS.map((f) => (
            <OptionButton key={f.value} active={theme.fontFamily === f.value} onClick={() => update({ fontFamily: f.value })}>
              {f.label}
            </OptionButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Border radius">
        <div className="flex flex-wrap gap-2">
          {RADII.map((r) => (
            <OptionButton key={r.value} active={theme.borderRadius === r.value} onClick={() => update({ borderRadius: r.value })}>
              {r.label}
            </OptionButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Card style">
        <div className="flex gap-2">
          {CARD_STYLES.map((c) => (
            <OptionButton key={c.value} active={theme.cardStyle === c.value} onClick={() => update({ cardStyle: c.value })}>
              {c.label}
            </OptionButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Sidebar style">
        <div className="flex gap-2">
          {SIDEBAR_STYLES.map((s) => (
            <OptionButton key={s.value} active={theme.sidebarStyle === s.value} onClick={() => update({ sidebarStyle: s.value })}>
              {s.label}
            </OptionButton>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Live preview">
        <Card glass={theme.cardStyle === "glass"} className="max-w-sm">
          <p className="text-sm font-semibold text-foreground">Sample card</p>
          <p className="mt-1 text-xs text-foreground-muted">This card reflects your current theme settings in real time.</p>
          <button className="mt-3 rounded-theme bg-primary px-3 py-1.5 text-xs font-medium text-white">Primary button</button>
        </Card>
      </SettingsSection>
    </div>
  );
}

function OptionButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-theme border px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground-muted hover:bg-surface-muted"
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
