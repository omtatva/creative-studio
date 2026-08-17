"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/constants/routes";
import { useReducedMotion } from "./useReducedMotion"; 

/**
 * Full-viewport autoplaying background video (public/marketing/hero-background.mp4,
 * served as a static asset — no backend involved). Text sits directly
 * over the video with only a left-side gradient scrim for legibility
 * (no solid glass panel) so the video stays visible, not covered.
 * Skips the video entirely (falling back to a plain navy/violet
 * gradient) for `prefers-reduced-motion` and for `navigator.connection`'s
 * save-data/slow-network signal, so nobody on a constrained connection
 * is forced to download an 8MB clip they can't see the benefit of anyway.
 */
function shouldPlayVideo(prefersReducedMotion: boolean): boolean {
  if (prefersReducedMotion) return false;
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && ["slow-2g", "2g"].includes(connection.effectiveType)) return false;
  return true;
}

export function Hero() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [playVideo, setPlayVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setPlayVideo(shouldPlayVideo(prefersReducedMotion));
  }, [prefersReducedMotion]);

  function scrollToNext() {
    document.getElementById("workflow")?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  return (
    <section id="hero" className="relative flex min-h-screen w-full items-center overflow-hidden bg-background">
      {/* Gradient underlay — always present, so there's never a black flash before the video loads (or at all, if it's skipped). */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-surface to-background" />

      {playVideo && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${videoReady ? "opacity-100" : "opacity-0"}`}
        >
          <source src="/marketing/hero-background.mp4" type="video/mp4" />
        </video>
      )}

      {/* Left-side scrim only — legible text without covering the video, which stays fully visible on the right. */}
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/75 to-background/10 sm:via-background/60 sm:to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/80 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start px-6 text-left sm:px-12"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Creative work, organized beautifully.</p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight text-foreground sm:text-5xl md:text-6xl">
          Create. Review.{" "}
          <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Transform.
          </span>
        </h1>
        <p className="mt-5 max-w-md text-base text-foreground-muted sm:text-lg">
          Manage projects, tasks, files, reviews, collaboration and AI — all in one connected workspace built for
          creative teams.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => router.push(`${ROUTES.signup}?plan=starter`)}>
            Start Free
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push(ROUTES.pricing)}>
            View Plans
          </Button>
        </div>
      </motion.div>

      <button
        onClick={scrollToNext}
        className="absolute bottom-8 right-6 z-10 flex items-center gap-2 rounded-full p-2 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:right-12"
      >
        Scroll to explore
        <ArrowDown className="h-4 w-4 motion-safe:animate-bounce" />
      </button>
    </section>
  );
}
