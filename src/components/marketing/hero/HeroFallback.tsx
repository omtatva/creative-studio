/**
 * CSS/SVG-only stand-in for <Scene3D> — used as the `next/dynamic`
 * loading state AND as the permanent visual when reduced-motion,
 * WebGL is unavailable, or a low-power device is detected (see
 * Hero.tsx). No Three.js/fiber code is imported here, so choosing
 * this path costs nothing extra to load. Echoes the same "O made of
 * discrete fragments" motif as the 3D version, in pure CSS — any
 * motion is `motion-safe:`-gated so it's automatically inert under
 * `prefers-reduced-motion`, regardless of which condition triggered
 * this fallback.
 */
export function HeroFallback() {
  const tickCount = 24;
  const ticks = Array.from({ length: tickCount }, (_, i) => i);

  return (
    <div className="relative flex h-full w-full items-center justify-center" aria-hidden="true">
      <div className="absolute h-64 w-64 rounded-full bg-primary/20 blur-3xl motion-safe:animate-pulse sm:h-80 sm:w-80" />
      <svg viewBox="0 0 200 200" className="relative h-56 w-56 motion-safe:animate-[spin_60s_linear_infinite] sm:h-72 sm:w-72">
        {ticks.map((i) => {
          const angle = (i / tickCount) * 360;
          return (
            <rect
              key={i}
              x="97"
              y="6"
              width="6"
              height="18"
              rx="2"
              className="fill-primary/70"
              transform={`rotate(${angle} 100 100)`}
              style={{ opacity: 0.4 + (i % 4) * 0.15 }}
            />
          );
        })}
        <circle cx="100" cy="100" r="58" className="fill-none stroke-secondary/40" strokeWidth="1.5" strokeDasharray="4 6" />
      </svg>
    </div>
  );
}
