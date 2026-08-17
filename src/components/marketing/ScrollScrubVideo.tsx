"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useReducedMotion } from "./hero/useReducedMotion";

interface ScrollScrubVideoProps {
  /** Existing video asset — never recreated, edited, or rotated. */
  src: string;
  /** The scroll range the video's timeline maps to — its top = frame 0, its bottom (minus one viewport) = the last frame. Does NOT include the footer. */
  containerRef: RefObject<HTMLElement | null>;
  className?: string;
}

const DEBUG = process.env.NODE_ENV !== "production";

/**
 * A single fixed background video whose `currentTime` is driven
 * directly by scroll position — never `play()`ed, never looped. At
 * the top of `containerRef`, progress is 0 (video's first frame); at
 * its bottom (one viewport height before the end, so the last frame
 * lands exactly at the end of scrollable content), progress is 1.
 * Scrolling up runs the video backward, since currentTime is always
 * a direct function of scroll position, not an incrementing player.
 *
 * The scroll handler only computes progress and stores the target
 * time in a ref; the actual `videoRef.current.currentTime` write
 * happens inside the next animation frame, which is what keeps this
 * smooth instead of janky (and matches how real scroll-scrub video
 * implementations are built — writing currentTime synchronously
 * inside a scroll handler is the usual cause of a "stuck" video).
 */
export function ScrollScrubVideo({ src, containerRef, className }: ScrollScrubVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const targetTimeRef = useRef(0);
  const durationRef = useRef(0);

  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    // Browsers restore the previous scroll position on reload/back-forward
    // by default, which would silently start the video mid-timeline
    // instead of at frame 0 on a fresh page load. This page's scroll
    // position exists to drive the video, not to be remembered.
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    if (prefersReducedMotion) {
      // No scroll-driven motion at all — freeze on the first frame (the machine).
      video.currentTime = 0;
      return;
    }

    function computeProgress(): number {
      if (!container) return 0;
      const rect = container.getBoundingClientRect();
      const scrollableDistance = rect.height - window.innerHeight;
      if (scrollableDistance <= 0) return 0;
      const raw = -rect.top / scrollableDistance;
      return Math.min(1, Math.max(0, raw));
    }

    // Runs every animation frame while a scroll is pending. Writes
    // DIRECTLY to the HTMLVideoElement — this is not driven by React
    // state/re-render, since a state-driven `currentTime` prop would
    // only apply on commit and silently miss most scroll frames.
    function tick() {
      rafRef.current = null;
      const duration = durationRef.current;
      if (!video || duration <= 0 || !Number.isFinite(duration)) return;
      video.currentTime = targetTimeRef.current;
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log("[ScrollScrubVideo]", {
          scrollProgress: targetTimeRef.current / duration,
          duration,
          targetTime: targetTimeRef.current,
          currentTime: video.currentTime,
        });
      }
    }

    function handleScrollOrResize() {
      const duration = durationRef.current;
      if (duration <= 0 || !Number.isFinite(duration)) return;
      targetTimeRef.current = computeProgress() * duration;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    function handleLoadedMetadata() {
      if (!video) return;
      durationRef.current = video.duration;
      handleScrollOrResize(); // set the initial frame for wherever the page happens to already be scrolled
    }

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    // Metadata may already be available (e.g. cached) before this listener attaches, in which case "loadedmetadata" never fires again.
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      durationRef.current = video.duration;
      handleScrollOrResize();
    }

    window.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      window.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, prefersReducedMotion]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-20 h-full w-full object-cover ${className ?? ""}`}
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}
