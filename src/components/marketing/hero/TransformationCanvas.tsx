"use client";

import { Canvas } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { TransformationScene } from "./TransformationScene";

interface TransformationCanvasProps {
  pageProgress: MotionValue<number>;
  compact?: boolean;
}

/**
 * The hero's WebGL boundary for the "AI machine → transformation stream
 * → Omtatva logo" composition. Dynamically imported with `ssr:false` by
 * Hero.tsx. The wrapping div in Hero.tsx is pointer-events-none so the
 * canvas never blocks the headline/CTAs/nav; `eventSource`/`eventPrefix`
 * here point R3F's own pointer tracking at the document instead, so
 * camera parallax still reacts to the cursor despite that.
 */
export default function TransformationCanvas({ pageProgress, compact }: TransformationCanvasProps) {
  return (
    <Canvas
      camera={{ position: [0, -0.1, 8.4], fov: 46 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      eventSource={typeof document !== "undefined" ? document.body : undefined}
      eventPrefix="client"
      aria-hidden="true"
    >
      <TransformationScene pageProgress={pageProgress} compact={compact} />
    </Canvas>
  );
}
