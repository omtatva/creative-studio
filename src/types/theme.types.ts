/**
 * Everything the Theme Engine controls. Values here are written to
 * CSS variables at runtime (see ThemeContext) so nothing about
 * appearance is hardcoded in components.
 *
 * Color model: every customizable surface is a named "role". Each
 * role stores a hex color (the picker's source of truth) plus an
 * opacity (0-100) used for live-preview rendering and exposed as a
 * companion CSS variable. `colors` holds whatever is CURRENTLY
 * APPLIED; `savedPalettes` are the user's own named color sets they
 * can switch back to; built-in starting points (Corporate, Modern,
 * Dark, Light, Purple, Green, Orange, Blue) live in
 * lib/constants/theme.ts as PRESET_PALETTES rather than being
 * stored per-workspace, since they're the same for everyone until a
 * workspace customizes and saves its own.
 */

export type ColorRoleKey =
  | "primary"
  | "secondary"
  | "accent"
  | "sidebar"
  | "navbar"
  | "background"
  | "cards"
  | "borders"
  | "buttons"
  | "text"
  | "success"
  | "warning"
  | "error"
  | "info";

export const COLOR_ROLES: { key: ColorRoleKey; label: string; description: string }[] = [
  { key: "primary", label: "Primary", description: "Main brand color — links, active states" },
  { key: "secondary", label: "Secondary", description: "Supporting brand color" },
  { key: "accent", label: "Accent", description: "Highlights and callouts" },
  { key: "sidebar", label: "Sidebar", description: "Left navigation background" },
  { key: "navbar", label: "Navbar", description: "Top bar background" },
  { key: "background", label: "Background", description: "Main page background" },
  { key: "cards", label: "Cards", description: "Card and panel background" },
  { key: "borders", label: "Borders", description: "Dividers and outlines" },
  { key: "buttons", label: "Buttons", description: "Primary button background" },
  { key: "text", label: "Text", description: "Default text color" },
  { key: "success", label: "Success", description: "Positive status color" },
  { key: "warning", label: "Warning", description: "Caution status color" },
  { key: "error", label: "Error", description: "Destructive/error status color" },
  { key: "info", label: "Info", description: "Informational status color" },
];

export interface BrandColor {
  hex: string; // "#RRGGBB"
  opacity: number; // 0-100
}

export type ColorRoles = Record<ColorRoleKey, BrandColor>;

export interface BrandPalette {
  id: string;
  name: string;
  colors: ColorRoles;
}

export interface ThemeSettings {
  mode: "light" | "dark" | "system";
  borderRadius: "none" | "sm" | "md" | "lg" | "xl";
  fontFamily: "inter" | "geist" | "system";
  cardStyle: "flat" | "soft" | "glass";
  sidebarStyle: "solid" | "glass";
  colors: ColorRoles;
  activePaletteId: string | null; // id of the applied preset/saved palette, or null once hand-edited ("Custom")
  savedPalettes: BrandPalette[];
}

function opaque(hex: string): BrandColor {
  return { hex, opacity: 100 };
}

/**
 * The Omtatva Digitals default — a premium dark-navy identity
 * matching the public landing page. Brand/status colors
 * (primary/secondary/accent/success/warning/error/info) are
 * unchanged from the original light default; only the surface family
 * (sidebar/navbar/background/cards/borders/text) shifts to navy, see
 * globals.css's `.dark` block for the matching pre-hydration values.
 */
export const DEFAULT_COLOR_ROLES: ColorRoles = {
  primary: opaque("#6366f1"),
  secondary: opaque("#14b8a6"),
  accent: opaque("#f43f5e"),
  sidebar: opaque("#0b0f1c"),
  navbar: opaque("#0b0f1c"),
  background: opaque("#080b14"),
  cards: opaque("#12162a"),
  borders: opaque("#232a47"),
  buttons: opaque("#6366f1"),
  text: opaque("#eef1fb"),
  success: opaque("#10b981"),
  warning: opaque("#f59e0b"),
  error: opaque("#ef4444"),
  info: opaque("#3b82f6"),
};

export const DEFAULT_THEME: ThemeSettings = {
  mode: "dark",
  borderRadius: "lg",
  fontFamily: "inter",
  cardStyle: "soft",
  sidebarStyle: "solid",
  colors: DEFAULT_COLOR_ROLES,
  activePaletteId: "omtatva",
  savedPalettes: [],
};
