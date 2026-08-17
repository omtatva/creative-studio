"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";
import { useLogoPointCloud } from "./useLogoPointCloud";
import { buildBlobLayout } from "./metaballLayout";
import { createMetaballMaterial } from "./metaballMaterial";

interface TransformationSceneProps {
  pageProgress: MotionValue<number>;
  compact?: boolean;
}

const LOOP_DURATION = 18; // seconds
// Pushed below the headline/CTA column so the visual never sits behind readable text.
const Y_OFFSET = -2.15;
const MACHINE_POS = new THREE.Vector3(-2.6, Y_OFFSET, 0);
const LOGO_OFFSET_X = 2.3;
const PRIMARY_COLOR = "#4f56d6";
const RIM_COLOR = "#22d3ee";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

const dummy = new THREE.Object3D();

/**
 * The three-part story, left to right: a small AI "machine" (rotating
 * fragment rings, always active) → a directional particle stream that
 * continuously flows from it toward the right → an actual glass-like
 * Omtatva logo (raymarched metaball surface, see metaballMaterial.ts)
 * that assembles from that same material, holds, and dissolves back —
 * an 18s seamless loop. Real-time and stylized, not a literal match to
 * any pre-rendered reference; the composition and story are faithful,
 * the rendering technique is what a browser can actually do at 60fps.
 */
export function TransformationScene({ pageProgress, compact = false }: TransformationSceneProps) {
  const { camera, gl } = useThree();
  const blobCount = compact ? 22 : 40;
  const logoCloud = useLogoPointCloud(compact ? 90 : 180);

  const machineGroupRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.InstancedMesh>(null);
  const ring2Ref = useRef<THREE.InstancedMesh>(null);
  const streamRef = useRef<THREE.InstancedMesh>(null);
  const metaballMeshRef = useRef<THREE.Mesh>(null);

  const shardGeometry = useMemo(() => {
    const geometry = new THREE.OctahedronGeometry(0.075, 0);
    geometry.scale(0.8, 1.2, 0.8);
    return geometry;
  }, []);

  const ring1Count = compact ? 8 : 14;
  const ring2Count = compact ? 6 : 10;
  const streamCount = compact ? 22 : 45;

  const streamTiming = useMemo(() => {
    const rand = mulberry32(5151);
    return Array.from({ length: streamCount }, () => ({
      offset: rand(),
      speed: 0.06 + rand() * 0.03,
      waviness: 0.15 + rand() * 0.2,
      yBase: Y_OFFSET + (rand() - 0.5) * 0.9,
      zBase: (rand() - 0.5) * 0.6,
    }));
  }, [streamCount]);

  const blobLayout = useMemo(() => {
    if (!logoCloud) return null;
    return buildBlobLayout(logoCloud, blobCount, LOGO_OFFSET_X, Y_OFFSET);
  }, [logoCloud, blobCount]);

  const metaballHandle = useMemo(() => createMetaballMaterial(blobCount, compact ? 48 : 72), [blobCount, compact]);

  const quadGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);

  useEffect(() => {
    return () => {
      metaballHandle.material.dispose();
      quadGeometry.dispose();
      shardGeometry.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const loopTime = state.clock.elapsedTime % LOOP_DURATION;

    // --- Machine: two counter-rotating rings, always active. ---
    if (machineGroupRef.current) {
      machineGroupRef.current.rotation.y += delta * 0.06;
    }
    if (ring1Ref.current) {
      for (let i = 0; i < ring1Count; i++) {
        const angle = (i / ring1Count) * Math.PI * 2 + state.clock.elapsedTime * 0.15;
        dummy.position.set(Math.cos(angle) * 0.55, Math.sin(angle * 1.3) * 0.12, Math.sin(angle) * 0.55);
        dummy.rotation.set(angle, angle * 0.5, 0);
        dummy.scale.setScalar(0.8);
        dummy.updateMatrix();
        ring1Ref.current.setMatrixAt(i, dummy.matrix);
      }
      ring1Ref.current.instanceMatrix.needsUpdate = true;
    }
    if (ring2Ref.current) {
      for (let i = 0; i < ring2Count; i++) {
        const angle = (i / ring2Count) * Math.PI * 2 - state.clock.elapsedTime * 0.22;
        dummy.position.set(Math.cos(angle) * 0.85, Math.sin(angle * 1.6) * 0.1, Math.sin(angle) * 0.85);
        dummy.rotation.set(angle * 0.7, angle, 0);
        dummy.scale.setScalar(1.05);
        dummy.updateMatrix();
        ring2Ref.current.setMatrixAt(i, dummy.matrix);
      }
      ring2Ref.current.instanceMatrix.needsUpdate = true;
    }

    // --- Stream: continuous directional flow, machine → logo, independent of the macro loop. ---
    if (streamRef.current) {
      streamTiming.forEach((particle, i) => {
        const pathT = (state.clock.elapsedTime * particle.speed + particle.offset) % 1;
        const x = THREE.MathUtils.lerp(MACHINE_POS.x, LOGO_OFFSET_X, pathT);
        const wave = Math.sin(pathT * Math.PI * 2.5 + i) * particle.waviness * (1 - Math.abs(pathT - 0.5) * 1.2);
        const y = particle.yBase + wave;
        const z = particle.zBase;
        const edgeFade = smooth(0, 0.12, pathT) * (1 - smooth(0.85, 1, pathT));
        dummy.position.set(x, y, z);
        dummy.rotation.set(pathT * 6 + i, i, 0);
        dummy.scale.setScalar(0.7 * edgeFade + 0.05);
        dummy.updateMatrix();
        streamRef.current!.setMatrixAt(i, dummy.matrix);
      });
      streamRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Metaball logo: assembles from dispersed (near machine) to the real logo shape, holds, dissolves. ---
    if (blobLayout && metaballMeshRef.current) {
      const convergeIn = smooth(5, 13, loopTime);
      const convergeOut = 1 - smooth(15, 18, loopTime);
      const baseConverge = Math.min(convergeIn, convergeOut);
      const opacity = smooth(4, 6, loopTime) * (1 - smooth(16, 18, loopTime));

      blobLayout.logoCenters.forEach((logoCenter, i) => {
        const dispersed = blobLayout.dispersedCenters[i];
        if (!dispersed) return;
        const stagger = (blobLayout.arrivalStagger[i] ?? 0) * 0.4;
        const localT = THREE.MathUtils.clamp((baseConverge - stagger) / (1 - stagger || 1), 0, 1);
        const target = metaballHandle.blobCenters[i];
        if (!target) return;
        target.lerpVectors(dispersed, logoCenter, localT);
      });

      const material = metaballHandle.material;
      // Non-null: these uniforms are always present, defined in createMetaballMaterial's fixed uniform set.
      (material.uniforms.uCameraPos!.value as THREE.Vector3).copy(camera.position);
      material.uniforms.uOpacity!.value = opacity;
      material.uniforms.uEmissive!.value = loopTime > 13 && loopTime < 15 ? 0.22 : 0.08;

      // Billboard the metaball quad to exactly fill the camera frustum at a fixed distance, so world-space ray reconstruction in the shader is correct.
      const distance = 14;
      metaballMeshRef.current.position.copy(camera.position);
      metaballMeshRef.current.quaternion.copy(camera.quaternion);
      metaballMeshRef.current.translateZ(-distance);
      const vFov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
      const height = 2 * Math.tan(vFov / 2) * distance;
      const width = height * (state.size.width / state.size.height);
      metaballMeshRef.current.scale.set(width, height, 1);
    }

    const overall = Math.min(1, Math.max(0, pageProgress.get()));
    const driftX = Math.sin(state.clock.elapsedTime * 0.04) * 0.15;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, driftX, 1.5, delta || 0.016);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 8.4 - overall * 0.3, 2, delta || 0.016);
    camera.lookAt(-0.4, Y_OFFSET * 0.65, 0);

    gl.setClearColor(0x05070d, 1);
  });

  if (!logoCloud || !blobLayout) return null;

  return (
    <>
      <fog attach="fog" args={["#05070d", 6, 16]} />
      <ambientLight intensity={0.25} />
      <directionalLight position={[2, 4, 3]} intensity={0.7} color="#eef1fb" />
      <pointLight position={MACHINE_POS.toArray()} intensity={1.1} color={RIM_COLOR} distance={4} />
      <pointLight position={[LOGO_OFFSET_X, 0, 1]} intensity={0.5} color={PRIMARY_COLOR} distance={5} />

      <group ref={machineGroupRef} position={MACHINE_POS}>
        <instancedMesh ref={ring1Ref} args={[undefined, undefined, ring1Count]}>
          <primitive object={shardGeometry} attach="geometry" />
          <meshPhysicalMaterial color={PRIMARY_COLOR} emissive={RIM_COLOR} emissiveIntensity={0.3} metalness={0.7} roughness={0.25} />
        </instancedMesh>
        <instancedMesh ref={ring2Ref} args={[undefined, undefined, ring2Count]}>
          <primitive object={shardGeometry} attach="geometry" />
          <meshPhysicalMaterial color={"#2c3563"} emissive={PRIMARY_COLOR} emissiveIntensity={0.2} metalness={0.6} roughness={0.35} />
        </instancedMesh>
      </group>

      <instancedMesh ref={streamRef} args={[undefined, undefined, streamCount]}>
        <primitive object={shardGeometry} attach="geometry" />
        <meshPhysicalMaterial color={RIM_COLOR} emissive={RIM_COLOR} emissiveIntensity={0.4} metalness={0.5} roughness={0.3} />
      </instancedMesh>

      <mesh ref={metaballMeshRef} geometry={quadGeometry} material={metaballHandle.material} />
    </>
  );
}
