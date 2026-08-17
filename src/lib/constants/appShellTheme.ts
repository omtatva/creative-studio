import { ColorRoleKey, ColorRoles, DEFAULT_COLOR_ROLES } from "@/types/theme.types";

/**
 * A deeper, more premium navy/violet refinement of the shared
 * DEFAULT_COLOR_ROLES, applied ONLY inside the authenticated app
 * shell (see applyAppShellTheme + MainLayout.tsx) — never touches
 * globals.css or DEFAULT_COLOR_ROLES itself, so the public landing
 * page and /login /signup (which read the same shared --color-*
 * variables) are completely unaffected. `primary`/`success`/
 * `warning`/`error`/`info`/`buttons` are intentionally omitted —
 * they already fit the requested indigo/green/amber/red palette.
 *
 * `text` IS included and force-applied here rather than left to the
 * global `.dark` class: a workspace whose stored `theme.mode` is
 * "light" (or "system" with a light OS preference) never gets the
 * `.dark` class on <html> at all, which left text reading from the
 * light-mode near-black default while this override was already
 * forcing the background/cards navy — unreadable near-black-on-navy.
 * The app shell must always be legible regardless of the workspace's
 * light/dark mode setting, so text is forced the same way background
 * already is.
 */
export const APP_SHELL_COLOR_OVERRIDES: Partial<Record<ColorRoleKey, string>> = {
  secondary: "#8b5cf6", // violet — secondary accent
  accent: "#22d3ee", // electric cyan — sparing highlights
  sidebar: "#0d1426",
  navbar: "#0d1426",
  background: "#070b18",
  cards: "#111a30",
  borders: "#1c2540",
  text: "#eef1fb",
};

/** Non-customizable structural tokens (no per-workspace picker) that can always take the app-shell's deeper values. */
export const APP_SHELL_STRUCTURAL_OVERRIDES: Record<string, string> = {
  "--color-surface": "17 22 41",
  "--color-surface-muted": "21 28 51",
  "--color-foreground-muted": "137 146 179",
};

const COLOR_CSS_VAR: Record<ColorRoleKey, string> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  accent: "--color-accent",
  sidebar: "--color-sidebar",
  navbar: "--color-navbar",
  background: "--color-background",
  cards: "--color-cards",
  borders: "--color-border",
  buttons: "--color-buttons",
  text: "--color-foreground",
  success: "--color-success",
  warning: "--color-warning",
  error: "--color-error",
  info: "--color-info",
};

function hexToChannelString(hex: string): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/**
 * Applies the app-shell palette to `el` (the MainLayout root div) —
 * but ONLY for roles the active workspace hasn't customized away
 * from DEFAULT_COLOR_ROLES, so a workspace that picked its own
 * sidebar/accent color via Settings > Branding still sees its own
 * choice, not this refinement. Mirrors ThemeContext's own
 * "isDefault" check exactly, just scoped to one element instead of
 * `<html>`, so it never leaks outside this shell.
 */
export function applyAppShellTheme(el: HTMLElement, colors: ColorRoles): void {
  (Object.keys(APP_SHELL_COLOR_OVERRIDES) as ColorRoleKey[]).forEach((role) => {
    const overrideHex = APP_SHELL_COLOR_OVERRIDES[role];
    if (!overrideHex) return;
    const current = colors[role];
    const defaultColor = DEFAULT_COLOR_ROLES[role];
    const isCustomized = current.hex.toLowerCase() !== defaultColor.hex.toLowerCase() || current.opacity !== defaultColor.opacity;
    if (isCustomized) {
      el.style.removeProperty(COLOR_CSS_VAR[role]);
    } else {
      el.style.setProperty(COLOR_CSS_VAR[role], hexToChannelString(overrideHex));
    }
  });

  Object.entries(APP_SHELL_STRUCTURAL_OVERRIDES).forEach(([cssVar, value]) => {
    el.style.setProperty(cssVar, value);
  });
}

export function clearAppShellTheme(el: HTMLElement): void {
  (Object.keys(APP_SHELL_COLOR_OVERRIDES) as ColorRoleKey[]).forEach((role) => {
    el.style.removeProperty(COLOR_CSS_VAR[role]);
  });
  Object.keys(APP_SHELL_STRUCTURAL_OVERRIDES).forEach((cssVar) => el.style.removeProperty(cssVar));
}
