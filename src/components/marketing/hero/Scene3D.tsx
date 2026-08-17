"use client";

import { Canvas } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import { OFragmentSystem } from "./OFragmentSystem";

interface Scene3DProps {
  fragmentCount: number;
  progress?: MotionValue<number>;
  frozenPhase?: { phase: number; localT: number };
  showConnections?: boolean;
}

/**
 * The O-fragment WebGL boundary — dynamically imported with
 * `ssr:false` by sections/OmtatvaAI.tsx (Canvas can't render on the
 * server), so importing `three`/`@react-three/fiber` here never
 * blocks or bloats any non-landing-page route's bundle. The hero
 * itself now uses LogoFormationCanvas.tsx instead; this stays dedicated
 * to the O-fragment system's "ideas reconnecting" visual.
 */
export default function Scene3D({ fragmentCount, progress, frozenPhase, showConnections = true }: Scene3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <pointLight position={[-4, -2, -3]} intensity={0.5} color="#14b8a6" />
      {/* Rim light from behind/above — gives the clearcoat/metalness on the shard material a soft edge highlight instead of reading flat. */}
      <pointLight position={[0, 3, -4]} intensity={0.6} color="#818cf8" />
      <OFragmentSystem fragmentCount={fragmentCount} progress={progress} frozenPhase={frozenPhase} showConnections={showConnections} />
    </Canvas>
  );
}
