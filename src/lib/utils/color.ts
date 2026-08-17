/**
 * Color conversion + parsing utilities backing the brand color
 * picker (see components/settings/color/). Every stored color's
 * source of truth is a hex string; RGB/HSL are derived for display
 * and for the CSS variables the rest of the app already reads
 * (`rgb(var(--color-x) / <alpha-value>)`, see tailwind.config.ts).
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(hex.trim());
}

export function normalizeHex(hex: string): string {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHex(hex);
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      h = ((bn - rn) / d + 2) / 6;
      break;
    default:
      h = ((rn - gn) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsl(hex: string): HslColor {
  return rgbToHsl(hexToRgb(hex));
}

export function hslToHex(hsl: HslColor): string {
  return rgbToHex(hslToRgb(hsl));
}

/** "R G B" space-separated channel string — the format every CSS variable in this app stores (see globals.css / tailwind.config.ts). */
export function hexToChannelString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export function channelStringToHex(channels: string): string {
  const [r, g, b] = channels.split(" ").map(Number);
  return rgbToHex({ r: r || 0, g: g || 0, b: b || 0 });
}

export function formatRgbString({ r, g, b }: RgbColor, opacity = 100): string {
  return opacity < 100 ? `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${(opacity / 100).toFixed(2)})` : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function formatHslString({ h, s, l }: HslColor, opacity = 100): string {
  return opacity < 100 ? `hsla(${h}, ${s}%, ${l}%, ${(opacity / 100).toFixed(2)})` : `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * Accepts a hex, rgb()/rgba(), or hsl()/hsla() string typed by the
 * user and returns a normalized hex — the picker's "type a custom
 * color code" input runs through this before being stored.
 */
export function parseAnyColor(input: string): string | null {
  const value = input.trim();

  if (isValidHex(value)) return normalizeHex(value);

  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return rgbToHex({ r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) });
  }

  const hslMatch = value.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/i);
  if (hslMatch) {
    return hslToHex({ h: Number(hslMatch[1]), s: Number(hslMatch[2]), l: Number(hslMatch[3]) });
  }

  return null;
}
