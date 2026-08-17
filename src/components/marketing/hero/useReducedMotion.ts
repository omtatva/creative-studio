"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe `prefers-reduced-motion` read. Starts `false` (matches
 * server render) and syncs to the real value on mount + live-updates
 * if the OS setting changes mid-session, so the hero can swap from
 * <Scene3D> to <HeroFallback> without a stale read.
 */
export function useReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(query.matches);

    const handleChange = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return prefersReduced;
}
