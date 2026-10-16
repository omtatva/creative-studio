/**
 * Pure synchronization policy for version comparison (no DOM) so the rules are
 * explicit and testable. Used by components/review/compare/CompareView.tsx.
 *
 * TIMELINE POLICY — time-based, from 0. The comparison has ONE shared timeline
 * whose length is the LONGER version's duration. Each version is shown at
 * `min(sharedTime, itsOwnDuration)`: when the shared time passes the end of the
 * shorter version, that version HOLDS (paused on its last frame) while the longer
 * one keeps playing; when the longer one ends, everything stops. Frames are never
 * assumed to align beyond "same elapsed time".
 *
 * The LONGER version is the "leader" (its clock drives the shared time); the other
 * is the "follower" and is corrected toward the leader.
 */

/** Below this the two players are treated as in sync — do nothing (no jitter). */
export const DRIFT_IGNORE_SECONDS = 0.08;
/** Between IGNORE and HARD we nudge playbackRate by a few percent (smooth, no seek). Above HARD we seek. */
export const DRIFT_HARD_SECONDS = 0.3;
/** After a hard seek, don't seek again for this long — prevents a resync loop while the browser settles. */
export const RESEEK_COOLDOWN_MS = 1500;
const NUDGE = 0.05;
/** Stop this far short of the end when holding, so `ended` doesn't fire and the last frame stays on screen. */
const END_EPSILON = 0.05;

/** The time a video should be at for a given shared time (clamped to its own duration). */
export function clampToDuration(sharedTime: number, duration: number | null): number {
  const t = Math.max(0, sharedTime);
  if (duration === null || !Number.isFinite(duration) || duration <= 0) return t;
  return Math.min(t, Math.max(0, duration - END_EPSILON));
}

/** Shared timeline length: the longer of the two known durations (0 when neither is known yet). */
export function sharedDuration(a: number | null, b: number | null): number {
  const known = [a, b].filter((d): d is number => d !== null && Number.isFinite(d) && d > 0);
  return known.length ? Math.max(...known) : 0;
}

/** Index of the leader: the longer video; a tie (or unknown durations) goes to B, the newer version by default. */
export function leaderIndex(a: number | null, b: number | null): 0 | 1 {
  const da = a !== null && Number.isFinite(a) ? a : 0;
  const db = b !== null && Number.isFinite(b) ? b : 0;
  return da > db ? 0 : 1;
}

export type FollowerAction =
  | { type: "none" }
  | { type: "hold" } // follower has run out of video: pause it on its last frame
  | { type: "rate"; rate: number } // small drift: speed up / slow down slightly
  | { type: "seek"; time: number }; // large drift: resynchronize

export function planFollowerCorrection(args: {
  leaderTime: number;
  followerTime: number;
  followerDuration: number | null;
  baseRate: number;
  nowMs: number;
  lastSeekMs: number;
}): FollowerAction {
  const { leaderTime, followerTime, followerDuration, baseRate, nowMs, lastSeekMs } = args;
  const known = followerDuration !== null && Number.isFinite(followerDuration) && followerDuration > 0;
  if (known && leaderTime >= (followerDuration as number) - END_EPSILON) return { type: "hold" };

  const expected = clampToDuration(leaderTime, followerDuration);
  const drift = followerTime - expected; // + = follower is ahead
  const abs = Math.abs(drift);
  if (abs < DRIFT_IGNORE_SECONDS) return { type: "rate", rate: baseRate }; // in sync: make sure any earlier nudge is undone
  if (abs < DRIFT_HARD_SECONDS) return { type: "rate", rate: drift > 0 ? baseRate * (1 - NUDGE) : baseRate * (1 + NUDGE) };
  if (nowMs - lastSeekMs < RESEEK_COOLDOWN_MS) return { type: "none" };
  return { type: "seek", time: expected };
}

/** "1920×1080" or null when unknown. */
export function formatDimensions(d: { width: number; height: number } | null): string | null {
  return d && d.width > 0 && d.height > 0 ? `${d.width}×${d.height}` : null;
}

/** True when the two aspect ratios differ by more than 2% — worth a subtle indicator. */
export function aspectsDiffer(a: { width: number; height: number } | null, b: { width: number; height: number } | null): boolean {
  if (!a || !b || !a.height || !b.height) return false;
  const ra = a.width / a.height;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / Math.max(ra, rb) > 0.02;
}

/** Default pair: the active/newest version as B, and the version immediately before it as A. */
export function defaultComparePair(versionNumbers: number[], active: number): [number, number] | null {
  const sorted = [...new Set(versionNumbers)].sort((x, y) => x - y);
  if (sorted.length < 2) return null;
  const b = sorted.includes(active) ? active : sorted[sorted.length - 1]!;
  const older = sorted.filter((v) => v < b);
  const a = older.length ? older[older.length - 1]! : sorted.find((v) => v > b)!;
  return a < b ? [a, b] : [b, a];
}
