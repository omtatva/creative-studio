"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME, DEFAULT_COLOR_ROLES, ThemeSettings, ColorRoleKey } from "@/types/theme.types";
import { RADIUS_MAP, FONT_MAP } from "@/lib/constants/theme";
import { hexToChannelString, hexToHsl, hslToHex } from "@/lib/utils/color";
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
 * Every branding palette (see PRESET_PALETTES in lib/constants/theme.ts —
 * Corporate, Modern, Light, Purple, ...) only ever ships ONE set of
 * surface hex values, not a light+dark pair — e.g. "Green" only defines a
 * pale, light-mode-appropriate sidebar/background. Applying that literal
 * hex unconditionally (which beats globals.css's `.dark`-class rule on
 * specificity regardless of which mode is active) meant Dark mode could
 * never actually turn a customized workspace dark.
 *
 * The fix: in dark mode, these six surface roles are re-derived from the
 * workspace's own `primary` color's HUE, combined with the exact
 * saturation/lightness steps the shipped Omtatva dark navy already uses
 * per role (DARK_SURFACE_SHADE below — reverse-engineered from
 * globals.css's `.dark` block: background/sidebar/navbar/cards/borders
 * step from ~5% to ~21% lightness at ~34-44% saturation, text sits at
 * ~96% lightness). So "Green" gets a dark FOREST-green sidebar/background
 * instead of either its own pale light-mode green OR a generic navy —
 * dark mode shows a dark shade of THAT theme, not a fixed unrelated one.
 * Light mode is unaffected: it already renders each role's picked hex
 * exactly as chosen (see the `isDefault` branch below), which is correct.
 *
 * Brand/status roles (primary/secondary/accent/buttons/success/warning/
 * error/info) are NOT in this set — those already read as intended in
 * both modes (a palette's accent colors are its identity, not something
 * mode should reshade), so they keep applying exactly as picked.
 */
const SURFACE_ROLES = ["sidebar", "navbar", "background", "cards", "borders", "text"] as const satisfies readonly ColorRoleKey[];

const DARK_SURFACE_SHADE: Record<(typeof SURFACE_ROLES)[number], { s: number; l: number }> = {
  sidebar: { s: 44, l: 8 },
  navbar: { s: 44, l: 8 },
  background: { s: 43, l: 5 },
  cards: { s: 40, l: 12 },
  borders: { s: 34, l: 21 },
  text: { s: 62, l: 96 },
};

/**
 * `--color-surface` / `--color-surface-muted` / `--color-foreground-muted`
 * (upload-zone backgrounds, subtler panel fills, muted text — see
 * globals.css's own comment: "mode-only structural tokens, not part of
 * the branding color picker") aren't ColorRoleKeys, so the loop below
 * never touches them. Left alone, they'd keep rendering the fixed navy
 * `.dark` values while everything else around them shifted to the
 * workspace's hue — the exact same "one leftover navy patch" bug, just
 * for three tokens instead of six. Derived the same way, right after the
 * loop, gated by the SAME `hasCustomSurfaces` flag (see below) since they
 * have no per-role default to compare against of their own.
 */
const DARK_STRUCTURAL_SHADE = {
  "--color-surface": { s: 39, l: 11 },
  "--color-surface-muted": { s: 37, l: 14 },
  "--color-foreground-muted": { s: 22, l: 62 },
};

function applyThemeToDocument(theme: ThemeSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldBeDark = theme.mode === "dark" || (theme.mode === "system" && prefersDark);
  const identityHue = hexToHsl(theme.colors.primary.hex).h;

  // Whether the WORKSPACE has actually customized its look at all — vs.
  // still sitting on the exact shipped Omtatva default (true for every
  // signed-out visitor: the public landing page and /login mount this
  // same ThemeProvider at the root layout, always with DEFAULT_THEME).
  // Gating the hue-derivation on this keeps the untouched default
  // pixel-identical to globals.css's hand-tuned `.dark` navy — derivation
  // only kicks in once a workspace has genuinely picked something else,
  // which is the only case with a "that theme" to be dark/light shade of.
  const hasCustomSurfaces = SURFACE_ROLES.some((role) => {
    const color = theme.colors[role];
    const defaultColor = DEFAULT_COLOR_ROLES[role];
    return color.hex.toLowerCase() !== defaultColor.hex.toLowerCase() || color.opacity !== defaultColor.opacity;
  });

  (Object.keys(theme.colors) as ColorRoleKey[]).forEach((role) => {
    const color = theme.colors[role];
    const defaultColor = DEFAULT_COLOR_ROLES[role];
    const cssVar = COLOR_CSS_VAR[role];
    const isDefault = color.hex.toLowerCase() === defaultColor.hex.toLowerCase() && color.opacity === defaultColor.opacity;

    if (shouldBeDark && hasCustomSurfaces && role in DARK_SURFACE_SHADE) {
      const shade = DARK_SURFACE_SHADE[role as keyof typeof DARK_SURFACE_SHADE];
      root.style.setProperty(cssVar, hexToChannelString(hslToHex({ h: identityHue, s: shade.s, l: shade.l })));
      root.style.setProperty(`${cssVar}-opacity`, "1");
    } else if (isDefault) {
      root.style.removeProperty(cssVar);
      root.style.removeProperty(`${cssVar}-opacity`);
    } else {
      root.style.setProperty(cssVar, hexToChannelString(color.hex));
      root.style.setProperty(`${cssVar}-opacity`, String(color.opacity / 100));
    }
  });

  (Object.keys(DARK_STRUCTURAL_SHADE) as (keyof typeof DARK_STRUCTURAL_SHADE)[]).forEach((cssVar) => {
    if (shouldBeDark && hasCustomSurfaces) {
      const shade = DARK_STRUCTURAL_SHADE[cssVar];
      root.style.setProperty(cssVar, hexToChannelString(hslToHex({ h: identityHue, s: shade.s, l: shade.l })));
    } else {
      root.style.removeProperty(cssVar);
    }
  });

  root.style.setProperty("--radius", RADIUS_MAP[theme.borderRadius]);
  root.style.setProperty("--font-family", FONT_MAP[theme.fontFamily]);

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
