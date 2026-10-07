/**
 * GLOBAL PROJECT APPEARANCE — the Super-Admin-controlled style of the
 * project HEADER (project details/creative workspace header banner and
 * the project-card cover). Stored in `platform_settings/appearance`
 * (server-write-only, signed-in-readable — see firestore.rules).
 *
 * WHERE THE OLD PURPLE CAME FROM: `ProjectDetailsHeader` painted
 * `linear-gradient(135deg, rgb(<project.color> / .9), rgb(<project.color> / .45))`
 * from the per-project `color` field, which every project got at creation from
 * the FIRST color of the workspace project palette — `99 102 241` (indigo) in
 * lib/constants/projectOptions.ts — so every existing project stored the same
 * default indigo (it is also the icon/progress accent); `ProjectCard` used a
 * hard-coded indigo/violet radial placeholder; and this module's own shipped
 * default was indigo/violet. All of that is now the Omtatva blue below.
 *
 * "CUSTOM" vs "DEFAULT" color: `99 102 241` and the Omtatva blue are DEFAULTS
 * (nobody chose them); any other `project.color` was picked on purpose and is
 * preserved as the project's own header/accent.
 *
 * HOW IT WORKS NOW — no per-project writes, ever:
 *   - The style lives in three design tokens (CSS variables) that
 *     default in globals.css and are applied from the platform doc by
 *     ProjectAppearanceApplier: `--project-header-primary`,
 *     `--project-header-secondary`, `--project-header-gradient-direction`.
 *     Components reference `PROJECT_HEADER_GRADIENT` (the tokens), never
 *     a hex.
 *   - Whether a given project FOLLOWS the platform style is DERIVED:
 *       a project follows iff Super Admin has applied the style to all
 *       existing projects (`appliedToAllAt` set), OR the project was
 *       created at/after the default was first saved (`defaultSavedAt`).
 *     Projects that don't follow keep their legacy `project.color`
 *     gradient untouched. "Save as default" therefore only affects
 *     new projects; "Apply to Existing Projects" flips ONE global
 *     timestamp and every project updates by being re-rendered — no
 *     mass Firestore writes.
 *   - Precedence for the banner: the project's own cover image (always
 *     wins) -> platform style if Super Admin applied it to ALL projects
 *     (an explicit, confirmed replace) -> the project's own CUSTOM color ->
 *     platform style (new projects under a saved default) -> the shipped
 *     Omtatva blue baseline. Workspace branding (ThemeContext's
 *     --color-primary etc.) is a separate token set and is deliberately NOT
 *     consulted here.
 */

export const PROJECT_HEADER_DIRECTIONS = [
  { value: "120deg", label: "Diagonal 120° (default)" },
  { value: "to right", label: "Left → Right" },
  { value: "to left", label: "Right → Left" },
  { value: "to bottom", label: "Top → Bottom" },
  { value: "to top", label: "Bottom → Top" },
  { value: "to bottom right", label: "Diagonal ↘" },
  { value: "to bottom left", label: "Diagonal ↙" },
  { value: "to top right", label: "Diagonal ↗" },
  { value: "to top left", label: "Diagonal ↖" },
] as const;

export type ProjectHeaderDirection = (typeof PROJECT_HEADER_DIRECTIONS)[number]["value"];

export interface ProjectHeaderStyle {
  /** #RRGGBB */
  primary: string;
  /** #RRGGBB */
  secondary: string;
  direction: ProjectHeaderDirection;
}

/** The Omtatva blue system — the shipped default for a platform that has never saved a style. (#EAF3FF is the light tint, see PROJECT_HEADER_LIGHT.) */
export const DEFAULT_PROJECT_HEADER_STYLE: ProjectHeaderStyle = {
  primary: "#3D6FA8",
  secondary: "#66A8E0",
  direction: "120deg",
};
export const PROJECT_HEADER_LIGHT = "#EAF3FF";

/** Omtatva blue as the space-separated RGB triplet every project accent uses. */
export const OMTATVA_BLUE_RGB = "61 111 168";
/** Old default project colors nobody chose on purpose (the first entry of the previous default palette) — treated as "no custom color". */
const LEGACY_DEFAULT_PROJECT_COLORS = ["99 102 241"];

/** True when the project's color was deliberately picked (not a default). */
export function hasCustomProjectColor(project: { color?: string | null }): boolean {
  const c = (project.color ?? "").trim();
  return c !== "" && c !== OMTATVA_BLUE_RGB && !LEGACY_DEFAULT_PROJECT_COLORS.includes(c);
}

/** The color for a project's icon tint / progress bar / ring: its own custom color, else Omtatva blue. Use this instead of reading `project.color` directly. */
export function projectAccentRgb(project: { color?: string | null }): string {
  return hasCustomProjectColor(project) ? (project.color as string).trim() : OMTATVA_BLUE_RGB;
}

export interface PlatformAppearanceDoc {
  projectHeader: ProjectHeaderStyle;
  /** When the default was FIRST saved — projects created at/after this follow the platform style. */
  defaultSavedAt: string | null;
  /** When Super Admin last applied the style to every existing project — null if never. */
  appliedToAllAt: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The token-based gradient for the Super-Admin-controlled style — no hex in components. */
export const PROJECT_HEADER_GRADIENT =
  "linear-gradient(var(--project-header-gradient-direction), rgb(var(--project-header-primary)), rgb(var(--project-header-secondary)))";

/** The shipped Omtatva blue baseline — separate tokens that the applier never overwrites, so existing projects stay blue until Super Admin applies a new style to them. */
export const PROJECT_HEADER_DEFAULT_GRADIENT =
  "linear-gradient(var(--project-header-default-direction), rgb(var(--project-header-default-primary)), rgb(var(--project-header-default-secondary)))";

/** A project's own deliberately chosen color, as a banner. */
const customGradient = (project: { color?: string | null }) =>
  `linear-gradient(120deg, rgb(${projectAccentRgb(project)}), rgb(${projectAccentRgb(project)} / 0.6))`;

/**
 * The banner background for a project WITHOUT a cover image (the cover wins before this is asked).
 * See the module doc for the precedence.
 */
export function projectHeaderBackground(
  project: { color?: string | null; createdAt: string },
  appearance: Pick<PlatformAppearanceDoc, "defaultSavedAt" | "appliedToAllAt"> | null | undefined
): string {
  if (appearance?.appliedToAllAt) return PROJECT_HEADER_GRADIENT;
  if (hasCustomProjectColor(project)) return customGradient(project);
  return projectFollowsPlatformHeader(project, appearance) ? PROJECT_HEADER_GRADIENT : PROJECT_HEADER_DEFAULT_GRADIENT;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** "#RRGGBB" -> "R G B" (the space-separated triplet every --color-* token uses, so it composes with `/ alpha`). */
export function hexToRgbTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Validates a style payload (Super Admin save). Only #RRGGBB colors and a whitelisted direction keyword can ever reach CSS. */
export function validateProjectHeaderStyle(input: unknown): { ok: true; style: ProjectHeaderStyle } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "projectHeader must be an object." };
  const { primary, secondary, direction } = input as Record<string, unknown>;
  if (!isValidHexColor(primary)) return { ok: false, error: "Primary color must be a #RRGGBB hex value." };
  if (!isValidHexColor(secondary)) return { ok: false, error: "Secondary color must be a #RRGGBB hex value." };
  if (!PROJECT_HEADER_DIRECTIONS.some((d) => d.value === direction)) return { ok: false, error: "Unknown gradient direction." };
  return { ok: true, style: { primary: primary.toUpperCase(), secondary: secondary.toUpperCase(), direction: direction as ProjectHeaderDirection } };
}

/** Whether this project renders the platform header style (see the module doc). Fails closed to the legacy look when the platform has never saved one. */
export function projectFollowsPlatformHeader(project: { createdAt: string }, appearance: Pick<PlatformAppearanceDoc, "defaultSavedAt" | "appliedToAllAt"> | null | undefined): boolean {
  if (!appearance) return false;
  if (appearance.appliedToAllAt) return true;
  if (!appearance.defaultSavedAt) return false;
  const created = Date.parse(project.createdAt);
  const since = Date.parse(appearance.defaultSavedAt);
  return Number.isFinite(created) && Number.isFinite(since) && created >= since;
}
