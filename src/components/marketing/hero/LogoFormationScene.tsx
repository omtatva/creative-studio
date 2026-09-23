"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { useLogoPointCloud } from "./useLogoPointCloud";

interface LogoFormationSceneProps {
  /** 0..1 scroll progress across the hero — a secondary influence (camera dolly) on top of the scene's own autoplaying time-driven loop, not the primary driver. */
  pageProgress: MotionValue<number>;
  compact?: boolean;
}

const NEUTRAL_COLOR = new THREE.Color("#6366f1");
const RIM_COLOR = "#22d3ee";
const LOOP_DURATION = 18; // seconds — matches 0-3 empty / 3-6 enter / 6-9 converge / 9-11 hold / 11-14 break / 14-18 disperse

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep easing — every transition in this scene uses this instead of linear, so nothing ever looks like a sudden jump. */
function smooth(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const dummy = new THREE.Object3D();
const scatterPos = new THREE.Vector3();
const logoPos = new THREE.Vector3();
const lerpedPos = new THREE.Vector3();
const scratchColor = new THREE.Color();

/**
 * The hero's centerpiece — a small, sparse field of individual 3D
 * fragments (never more than a few percent of the viewport each,
 * deliberately mostly empty space) sampled from the real Omtatva
 * logo's own pixels (see useLogoPointCloud.ts). Fragments gently
 * enter, drift, converge into a brief recognizable impression of the
 * logo, hold, then break apart and disperse — a slow, seamless,
 * autoplaying 18s loop. No fragment ever connects to another; there
 * is no mesh, no filled surface, only individual pieces catching
 * light. Scroll/mouse are secondary influences (camera dolly,
 * parallax), not the driver — the loop plays regardless of scroll.
 */
export function LogoFormationScene({ pageProgress, compact = false }: LogoFormationSceneProps) {
  const { camera } = useThree();
  const logoCloud = useLogoPointCloud(compact ? 70 : 150);
  const particleGroupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dataLineRef = useRef<THREE.LineSegments>(null);

  const count = logoCloud?.count ?? 0;

  const scatterPositions = useMemo(() => {
    const rand = mulberry32(3113);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Wide, generous spread — left, right, below the hero text — never a dense central clump.
      positions[i * 3] = (rand() - 0.5) * 7.5;
      positions[i * 3 + 1] = (rand() - 0.5) * 5 - 0.6;
      positions[i * 3 + 2] = (rand() - 0.5) * 5;
    }
    return positions;
  }, [count]);

  // Per-particle entry timing (within the 0-6s EMPTY+ENTER window) and depth-tied size — "different sizes, rotations, depths."
  const particleTiming = useMemo(() => {
    const rand = mulberry32(6060);
    const entry = new Float32Array(count);
    const sizeVariance = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      entry[i] = rand() * 6;
      sizeVariance[i] = 0.6 + rand() * 0.7;
    }
    return { entry, sizeVariance };
  }, [count]);

  const shardGeometry = useMemo(() => {
    // Small, individual fragments — capped well under the "1-4% of viewport width" limit.
    const geometry = new THREE.OctahedronGeometry(0.032, 0);
    geometry.scale(0.8, 1.15, 0.8);
    return geometry;
  }, []);

  // A handful of faint "AI data" lines — never a mesh, never touching the logo formation itself.
  const dataLinePositions = useMemo(() => new Float32Array(5 * 2 * 3), []);
  const dataLineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(dataLinePositions, 3));
    return geometry;
  }, [dataLinePositions]);
  const dataLinePairs = useMemo(() => {
    if (count === 0) return [] as Array<[number, number]>;
    const rand = mulberry32(88);
    return Array.from({ length: 5 }, () => [Math.floor(rand() * count), Math.floor(rand() * count)] as [number, number]);
  }, [count]);

  useFrame((state, delta) => {
    if (!logoCloud || count === 0 || !meshRef.current) return;

    const loopTime = state.clock.elapsedTime % LOOP_DURATION;

    // Convergence: 0 = scattered, 1 = at the logo position. Ramps up across 6-9s (staggered per particle), holds 9-11s, reverses 11-14s, stays scattered 14-18s and 0-6s of the next cycle.
    const convergeIn = smooth(6, 9, loopTime);
    const convergeOut = 1 - smooth(11, 14, loopTime);
    const baseConverge = Math.min(convergeIn, convergeOut);

    // Presence: fragments fade in during 0-6s (staggered per-particle) and fade out during 14-18s so the loop resets to "mostly empty" seamlessly.
    const globalFadeOut = 1 - smooth(14, 18, loopTime);

    for (let i = 0; i < count; i++) {
      const entryStart = particleTiming.entry[i] ?? 0;
      const presence = smooth(entryStart, entryStart + 1.2, loopTime) * globalFadeOut;

      const staggerDelay = (i / count) * 0.5;
      const localConverge = THREE.MathUtils.clamp((baseConverge - staggerDelay * 0.4) / (1 - staggerDelay * 0.4 || 1), 0, 1);

      const px3 = i * 3;
      scatterPos.set(scatterPositions[px3] ?? 0, scatterPositions[px3 + 1] ?? 0, scatterPositions[px3 + 2] ?? 0);
      logoPos.set(logoCloud.positions[px3] ?? 0, logoCloud.positions[px3 + 1] ?? 0, logoCloud.positions[px3 + 2] ?? 0);
      lerpedPos.copy(scatterPos).lerp(logoPos, localConverge);

      // Gentle independent drift — never violent, always present, so nothing ever looks frozen.
      lerpedPos.x += Math.sin(state.clock.elapsedTime * 0.25 + i * 0.6) * 0.05 * (1 - localConverge * 0.7);
      lerpedPos.y += Math.cos(state.clock.elapsedTime * 0.2 + i * 0.5) * 0.05 * (1 - localConverge * 0.7);

      dummy.position.copy(lerpedPos);
      dummy.rotation.set(i * 0.7 + state.clock.elapsedTime * 0.08, i * 0.3 + state.clock.elapsedTime * 0.05, 0);

      // Depth-based size (fake DOF): nearer fragments (larger z) read slightly larger, farther ones smaller/dimmer.
      const depthFactor = THREE.MathUtils.clamp((lerpedPos.z + 2.5) / 5, 0, 1);
      const variance = particleTiming.sizeVariance[i] ?? 1;
      const scale = presence * variance * (0.65 + depthFactor * 0.5);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      const lr = logoCloud.colors[px3] ?? 0.4;
      const lg = logoCloud.colors[px3 + 1] ?? 0.4;
      const lb = logoCloud.colors[px3 + 2] ?? 0.8;
      const brightness = 0.55 + depthFactor * 0.45;
      scratchColor.setRGB(lr, lg, lb).lerp(NEUTRAL_COLOR, 1 - localConverge).multiplyScalar(brightness);
      meshRef.current.setColorAt(i, scratchColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;

    const material = meshRef.current.material as THREE.MeshPhysicalMaterial;
    const holdGlow = loopTime > 9 && loopTime < 11 ? 0.2 : 0;
    material.emissiveIntensity = 0.12 + holdGlow;

    if (dataLineRef.current) {
      const dataOpacity = (1 - smooth(5, 7, loopTime)) * globalFadeOut * 0.22;
      (dataLineRef.current.material as THREE.LineBasicMaterial).opacity = dataOpacity;
      dataLinePairs.forEach(([a, b], pairIndex) => {
        const base = pairIndex * 6;
        const ai = a * 3;
        const bi = b * 3;
        dataLinePositions[base] = scatterPositions[ai] ?? 0;
        dataLinePositions[base + 1] = scatterPositions[ai + 1] ?? 0;
        dataLinePositions[base + 2] = scatterPositions[ai + 2] ?? 0;
        dataLinePositions[base + 3] = scatterPositions[bi] ?? 0;
        dataLinePositions[base + 4] = scatterPositions[bi + 1] ?? 0;
        dataLinePositions[base + 5] = scatterPositions[bi + 2] ?? 0;
      });
      (dataLineGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    const pointerX = state.pointer.x;
    const pointerY = state.pointer.y;
    if (particleGroupRef.current) {
      const targetRotY = pointerX * 0.06;
      const targetRotX = pointerY * 0.035;
      particleGroupRef.current.rotation.y = THREE.MathUtils.damp(particleGroupRef.current.rotation.y, targetRotY, 2, delta || 0.016);
      particleGroupRef.current.rotation.x = THREE.MathUtils.damp(particleGroupRef.current.rotation.x, targetRotX, 2, delta || 0.016);
    }

    // Very slow, subtle camera drift — never aggressive — plus scroll as a gentle secondary dolly.
    const overall = Math.min(1, Math.max(0, pageProgress.get()));
    const driftX = Math.sin(state.clock.elapsedTime * 0.05) * 0.2;
    const driftY = Math.cos(state.clock.elapsedTime * 0.04) * 0.1;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, driftX, 1.5, delta || 0.016);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, driftY, 1.5, delta || 0.016);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 7.4 - overall * 0.3, 2, delta || 0.016);
    camera.lookAt(0, -0.6, 0);
  });

  if (!logoCloud) return null;

  return (
    <>
      <fog attach="fog" args={["#05070d", 5, 13]} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 4, 4]} intensity={0.9} color="#eef1fb" />
      <pointLight position={[-3, 1, 2]} intensity={0.4} color={RIM_COLOR} />
      <pointLight position={[0, -1, 3]} intensity={0.25} color={NEUTRAL_COLOR} />

      <group ref={particleGroupRef} position={[0, -0.6, 0]}>
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
          <primitive object={shardGeometry} attach="geometry" />
          <meshPhysicalMaterial emissive={NEUTRAL_COLOR} emissiveIntensity={0.12} metalness={0.5} roughness={0.3} clearcoat={0.4} clearcoatRoughness={0.3} transparent opacity={0.92} />
        </instancedMesh>

        <lineSegments ref={dataLineRef} geometry={dataLineGeometry}>
          <lineBasicMaterial color={RIM_COLOR} transparent opacity={0} />
        </lineSegments>
      </group>
    </>
  );
}
