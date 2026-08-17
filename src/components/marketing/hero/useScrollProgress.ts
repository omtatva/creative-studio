"use client";

import { useScroll, type MotionValue } from "framer-motion";
import type { RefObject } from "react";

/**
 * Raw 0→1 scroll progress across the hero's own scroll-tall wrapper
 * (see Hero.tsx — a `h-[400vh]` container with a `sticky` inner
 * canvas gives room to scrub through the 5 phases before the page
 * moves past the hero). Returned as a framer-motion `MotionValue`,
 * not React state — OFragmentSystem reads it imperatively via
 * `.get()` inside its own `useFrame` loop so a scroll tick never
 * triggers a React re-render of the 3D tree (R3F's render loop
 * already sits outside React's commit cycle; state here would just
 * fight it).
 */
export function useScrollProgress(targetRef: RefObject<HTMLElement | null>): MotionValue<number> {
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"],
  });
  return scrollYProgress;
}

export const PHASE_COUNT = 5;

/**
 * Splits 0..1 scroll progress into the 5 named bands (SOLID, BREAK,
 * INTELLIGENCE, REORGANIZATION, REBUILD) and returns which band is
 * active plus how far through it (0..1) — the per-frame interpolation
 * in OFragmentSystem lerps between adjacent fragment-transform sets
 * using `localT`.
 */
export function getPhaseProgress(progress: number): { phase: number; localT: number } {
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * PHASE_COUNT;
  const phase = Math.min(PHASE_COUNT - 1, Math.floor(scaled));
  const localT = scaled - phase;
  return { phase, localT };
}
