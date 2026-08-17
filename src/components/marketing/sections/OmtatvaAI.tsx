"use client";

import dynamic from "next/dynamic";
import { SectionWrapper } from "../SectionWrapper";
import { HeroFallback } from "../hero/HeroFallback";
import { useReducedMotion } from "../hero/useReducedMotion";
import { FRAGMENT_COUNT_REDUCED } from "../hero/fragments";

const Scene3D = dynamic(() => import("../hero/Scene3D"), { ssr: false, loading: () => <HeroFallback /> });

/** A smaller, frozen continuation of the hero's 3D object — same fragment system, held at a static "structure forming" pose rather than re-deriving its own scroll-phase range. */
export function OmtatvaAI() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <SectionWrapper id="omtatva-ai" className="max-w-5xl">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div className="relative order-2 aspect-square w-full max-w-sm justify-self-center lg:order-1">
          {prefersReducedMotion ? (
            <HeroFallback />
          ) : (
            <Scene3D fragmentCount={FRAGMENT_COUNT_REDUCED} frozenPhase={{ phase: 3, localT: 0.5 }} showConnections />
          )}
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Omtatva + AI</p>
          <h2 className="mt-3 text-3xl font-semibold text-foreground sm:text-4xl">From complexity to clarity.</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-foreground-muted">
            Every project starts as a scattered set of ideas, files and feedback. Omtatva pairs human creative judgment with
            AI-assisted structure — connecting the pieces, surfacing what matters, and helping teams converge on what&apos;s next
            instead of getting lost in the process.
          </p>
        </div>
      </div>
    </SectionWrapper>
  );
}
