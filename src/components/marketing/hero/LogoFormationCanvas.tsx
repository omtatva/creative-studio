"use client";

import { Canvas } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { LogoFormationScene } from "./LogoFormationScene";

interface LogoFormationCanvasProps {
  pageProgress: MotionValue<number>;
  compact?: boolean;
}

/**
 * The hero's WebGL boundary — dynamically imported with `ssr:false`
 * by Hero.tsx. Full-bleed behind the headline/CTAs, per the current
 * layout: no separate "frame" panel, the scene IS the hero background.
 */
export default function LogoFormationCanvas({ pageProgress, compact }: LogoFormationCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, -0.2, 7.4], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
      aria-hidden="true"
    >
      <LogoFormationScene pageProgress={pageProgress} compact={compact} />
    </Canvas>
  );
}
