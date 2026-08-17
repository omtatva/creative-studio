"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME, DEFAULT_COLOR_ROLES, ThemeSettings, ColorRoleKey } from "@/types/theme.types";
import { RADIUS_MAP, FONT_MAP } from "@/lib/constants/theme";
import { hexToChannelString } from "@/lib/utils/color";
import { useWorkspaceContext } from "./WorkspaceContext";
import { getWorkspaceSettings, updateWorkspaceSettings } from "@/services/settingsService";

/**
 * Applies ThemeSettings to CSS variables on <html> at runtime, so
 * every color/radius/font in the app reads from `var(--color-*)`
 * / `var(--radius)` / `var(--font-family)` (see globals.css and
 * tailwind.config.ts) instead of hardcoded values. Settings pages
 * call `setTheme()` with a partial patch to update live + persist —
 * that includes color changes: the Branding page builds its own
 * local draft while editing (so the picker's "live preview" doesn't
 * touch the rest of the app or Firestore on every click) and only
 * calls `setTheme({ colors: draft, ... })` once, on Save.
 */
interface ThemeContextValue {
  theme: ThemeSettings;
  setTheme: (patch: Partial<ThemeSettings>) => Promise<void>;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const COLOR_CSS_VAR: Record<ColorRoleKey, string> = {
  primary: "--color-primary",
  secondary: "--color-secondary",
  accent: "--color-accent",
  sidebar: "--color-sidebar",
  navbar: "--color-navbar",
  background: "--color-background",
  cards: "--color-cards",
  borders: "--color-border", // reuses the existing border variable — see theme.types.ts COLOR_ROLES comment
  buttons: "--color-buttons",
  text: "--color-foreground", // reuses the existing foreground/text variable
  success: "--color-success",
  warning: "--color-warning",
  error: "--color-error",
  info: "--color-info",
};

/**
 * Merges a possibly-partial/legacy settings.theme doc with
 * DEFAULT_THEME so older workspace documents (saved before this
 * color-role system existed) never crash the app — missing roles
 * just fall back to defaults until the workspace saves a new theme.
 */
function normalizeTheme(raw: Partial<ThemeSettings> | undefined): ThemeSettings {
  if (!raw) return DEFAULT_THEME;
  return {
    ...DEFAULT_THEME,
    ...raw,
    colors: { ...DEFAULT_COLOR_ROLES, ...(raw.colors ?? {}) },
    savedPalettes: raw.savedPalettes ?? [],
  };
}

/**
 * `DEFAULT_COLOR_ROLES` (see theme.types.ts) is a single light-mode
 * palette — sidebar/navbar/background/cards/borders/text all default
 * to light-mode-appropriate values with no dark-mode counterpart.
 * globals.css already defines correct light+dark pairs for every one
 * of those CSS variables via `:root` / `.dark` class rules — but an
 * inline `style.setProperty()` on <html> beats a class-selector rule
 * on specificity regardless of which mode is active, so unconditionally
 * writing the (light) default here as an inline style permanently
 * defeated the `.dark` rule and made e.g. --color-foreground stay
 * near-black text even in dark mode (unreadable on a dark surface).
 * Only ACTUALLY-customized roles (where the workspace picked a color
 * other than the shipped default) need the inline override; anything
 * still on its default is better left to globals.css's own
 * light/dark rule so it responds correctly to the mode toggle.
 */
function applyThemeToDocument(theme: ThemeSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  (Object.keys(theme.colors) as ColorRoleKey[]).forEach((role) => {
    const color = theme.colors[role];
    const defaultColor = DEFAULT_COLOR_ROLES[role];
    const cssVar = COLOR_CSS_VAR[role];
    const isDefault = color.hex.toLowerCase() === defaultColor.hex.toLowerCase() && color.opacity === defaultColor.opacity;

    if (isDefault) {
      root.style.removeProperty(cssVar);
      root.style.removeProperty(`${cssVar}-opacity`);
    } else {
      root.style.setProperty(cssVar, hexToChannelString(color.hex));
      root.style.setProperty(`${cssVar}-opacity`, String(color.opacity / 100));
    }
  });

  root.style.setProperty("--radius", RADIUS_MAP[theme.borderRadius]);
  root.style.setProperty("--font-family", FONT_MAP[theme.fontFamily]);

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldBeDark = theme.mode === "dark" || (theme.mode === "system" && prefersDark);
  root.classList.toggle("dark", shouldBeDark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useWorkspaceContext();
  const [theme, setThemeState] = useState<ThemeSettings>(DEFAULT_THEME);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    if (!workspaceId) {
      setThemeState(DEFAULT_THEME);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getWorkspaceSettings(workspaceId)
      .then((settings) => {
        setThemeState(normalizeTheme(settings?.theme));
      })
      .finally(() => setIsLoading(false));
  }, [workspaceId]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isLoading,
      setTheme: async (patch) => {
        const next = normalizeTheme({ ...theme, ...patch });
        setThemeState(next);
        if (workspaceId) {
          await updateWorkspaceSettings(workspaceId, { theme: next });
        }
      },
    }),
    [theme, isLoading, workspaceId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
