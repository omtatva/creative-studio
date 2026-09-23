import { ThemeSettings, ColorRoles, BrandPalette, DEFAULT_COLOR_ROLES } from "@/types/theme.types";

/**
 * Maps ThemeSettings enum values to actual CSS values. Kept apart
 * from types/theme.types.ts so designers can tweak the underlying
 * pixel/font values without touching the type contract.
 */
export const RADIUS_MAP: Record<ThemeSettings["borderRadius"], string> = {
  none: "0px",
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
};

export const FONT_MAP: Record<ThemeSettings["fontFamily"], string> = {
  inter: '"Inter", ui-sans-serif, system-ui, sans-serif',
  geist: '"Geist", ui-sans-serif, system-ui, sans-serif',
  system: "ui-sans-serif, system-ui, -apple-system, sans-serif",
};

function palette(id: string, name: string, colors: Partial<ColorRoles>): BrandPalette {
  return { id, name, colors: { ...DEFAULT_COLOR_ROLES, ...colors } as ColorRoles };
}

function c(hex: string, opacity = 100) {
  return { hex, opacity };
}

/**
 * Built-in starting points for the branding color picker's preset
 * grid. Not stored per-workspace — applying one just loads these
 * values into the picker's draft state (see BrandingColorSystem);
 * saving persists the result to Firestore like any hand-picked set
 * of colors. "Custom" isn't a real palette — selecting it in the UI
 * just clears the active-preset highlight so further edits read as
 * a custom, unsaved combination.
 */
export const PRESET_PALETTES: BrandPalette[] = [
  palette("omtatva", "Omtatva", {
    primary: c("#6366f1"),
    secondary: c("#14b8a6"),
    accent: c("#f43f5e"),
    sidebar: c("#0b0f1c"),
    navbar: c("#0b0f1c"),
    background: c("#080b14"),
    cards: c("#12162a"),
    borders: c("#232a47"),
    buttons: c("#6366f1"),
    text: c("#eef1fb"),
  }),
  palette("corporate", "Corporate", {
    primary: c("#1e3a8a"),
    secondary: c("#475569"),
    accent: c("#0891b2"),
    sidebar: c("#0f172a"),
    navbar: c("#ffffff"),
    background: c("#f8fafc"),
    cards: c("#ffffff"),
    borders: c("#e2e8f0"),
    buttons: c("#1e3a8a"),
    text: c("#0f172a"),
  }),
  palette("modern", "Modern", {
    primary: c("#6366f1"),
    secondary: c("#14b8a6"),
    accent: c("#f43f5e"),
    sidebar: c("#ffffff"),
    navbar: c("#ffffff"),
    background: c("#ffffff"),
    cards: c("#ffffff"),
    borders: c("#e4e5e9"),
    buttons: c("#6366f1"),
    text: c("#17171c"),
  }),
  palette("dark", "Dark", {
    primary: c("#818cf8"),
    secondary: c("#2dd4bf"),
    accent: c("#fb7185"),
    sidebar: c("#111114"),
    navbar: c("#16161a"),
    background: c("#0b0b0d"),
    cards: c("#18181c"),
    borders: c("#2c2c34"),
    buttons: c("#818cf8"),
    text: c("#f4f4f6"),
  }),
  palette("light", "Light", {
    primary: c("#4f46e5"),
    secondary: c("#0ea5e9"),
    accent: c("#ec4899"),
    sidebar: c("#fafafa"),
    navbar: c("#ffffff"),
    background: c("#fefefe"),
    cards: c("#ffffff"),
    borders: c("#eeeeee"),
    buttons: c("#4f46e5"),
    text: c("#1f2937"),
  }),
  palette("purple", "Purple", {
    primary: c("#8b5cf6"),
    secondary: c("#a78bfa"),
    accent: c("#d946ef"),
    sidebar: c("#faf5ff"),
    navbar: c("#ffffff"),
    background: c("#ffffff"),
    cards: c("#ffffff"),
    borders: c("#ede9fe"),
    buttons: c("#8b5cf6"),
    text: c("#2e1065"),
  }),
  palette("green", "Green", {
    primary: c("#16a34a"),
    secondary: c("#65a30d"),
    accent: c("#059669"),
    sidebar: c("#f0fdf4"),
    navbar: c("#ffffff"),
    background: c("#ffffff"),
    cards: c("#ffffff"),
    borders: c("#dcfce7"),
    buttons: c("#16a34a"),
    text: c("#14532d"),
  }),
  palette("orange", "Orange", {
    primary: c("#ea580c"),
    secondary: c("#d97706"),
    accent: c("#dc2626"),
    sidebar: c("#fff7ed"),
    navbar: c("#ffffff"),
    background: c("#ffffff"),
    cards: c("#ffffff"),
    borders: c("#fed7aa"),
    buttons: c("#ea580c"),
    text: c("#431407"),
  }),
  palette("blue", "Blue", {
    primary: c("#2563eb"),
    secondary: c("#0284c7"),
    accent: c("#7c3aed"),
    sidebar: c("#eff6ff"),
    navbar: c("#ffffff"),
    background: c("#ffffff"),
    cards: c("#ffffff"),
    borders: c("#dbeafe"),
    buttons: c("#2563eb"),
    text: c("#1e3a8a"),
  }),
];
