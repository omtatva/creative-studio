/**
 * Distinct color per comment marker number — cycles through a fixed
 * palette so marker 1/2/3/... are visually distinguishable on the
 * canvas, the timeline, and the comments panel, consistently. Kept
 * separate from resolved/open state (see AssetStatusBadge) — a
 * resolved marker keeps its assigned color and gets a checkmark
 * badge instead of being recolored, so its identity stays stable.
 */
const MARKER_PALETTE = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ef4444", // red
];

export function getMarkerColor(markerNumber: number | null): string {
  const fallback = MARKER_PALETTE[0] ?? "#6366f1";
  if (markerNumber === null || markerNumber < 1) return fallback;
  return MARKER_PALETTE[(markerNumber - 1) % MARKER_PALETTE.length] ?? fallback;
}
