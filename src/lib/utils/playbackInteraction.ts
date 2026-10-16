/**
 * Who owns a pointer/keyboard event on a review player — one place, pure and testable.
 *
 *   NORMAL (select tool)     click on the media           → Play/Pause
 *   ANNOTATION tool active   the annotation layer owns it → NEVER toggles playback
 *   EXISTING marker / shape  the marker owns it           → select + seek, NEVER toggles
 *   PLAYER CONTROL           the control owns it          → its own action
 *   COMMENT UI               the panel owns it            → never reaches the media
 *
 * The structural half of this is the DOM: controls, panels and the comment composer are
 * SIBLINGS of the media element (not descendants), markers stop propagation, and the
 * annotation layer is pointer-transparent except while a draw tool is active. This module is
 * the decision half that the click handlers consult.
 */

/** The tool names used by AnnotationToolbar; "select" is the only one that means "no annotation interaction". */
export const NON_ANNOTATION_TOOL = "select";

export function shouldToggleOnMediaClick(args: {
  /** The active AnnotationToolbar tool. */
  tool: string;
  /** A marker/shape was just placed and its comment composer is open — keep the video paused while the reviewer types. */
  hasPendingMarker: boolean;
  /** MouseEvent.detail: 1 for a single click, 2+ for the 2nd/3rd click of a multi-click. */
  clickDetail: number;
}): boolean {
  if (args.tool !== NON_ANNOTATION_TOOL) return false; // annotation interaction owns the pointer
  if (args.hasPendingMarker) return false; // typing a comment: stay paused
  if (args.clickDetail > 1) return false; // a double-click is ONE toggle, not two (no play→pause flicker)
  return true;
}

/** Elements for which Space keeps its normal meaning (typing a space, activating a button, opening a select, moving a slider). */
export function isSpaceOwnedByTarget(target: { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  if (target.tagName && /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target.tagName.toUpperCase())) return true;
  const role = target.getAttribute?.("role");
  return role === "slider" || role === "textbox" || role === "combobox" || role === "button" || role === "switch" || role === "checkbox" || role === "menuitem";
}

/** Should a global Space press toggle playback? */
export function shouldToggleOnSpace(args: { key: string; code?: string; target: Parameters<typeof isSpaceOwnedByTarget>[0]; defaultPrevented?: boolean; hasModifier?: boolean }): boolean {
  const isSpace = args.key === " " || args.code === "Space";
  if (!isSpace || args.defaultPrevented || args.hasModifier) return false;
  return !isSpaceOwnedByTarget(args.target);
}

/** Pausing is required the moment an annotation tool becomes active, or a marker/composer is open. */
export function shouldForcePause(args: { tool: string; hasPendingMarker: boolean }): boolean {
  return args.tool !== NON_ANNOTATION_TOOL || args.hasPendingMarker;
}
