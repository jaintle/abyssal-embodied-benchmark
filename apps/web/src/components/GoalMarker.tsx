"use client";

/**
 * GoalMarker — underwater acoustic transponder beacon.
 *
 * Redesigned from a plain emissive sphere to a physically grounded object:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Beacon dome — emissive green glass hemisphere on top       │
 *   │  Body cylinder — tapered metallic transponder housing       │
 *   │  Collar ring — slowly rotates (active sonar indicator)      │
 *   │  Mooring line — thin cable to seabed, not a thick pole      │
 *   │  Acceptance radius — fine wireframe cage (readability kept) │
 *   │  Ping rings — two flat rings that pulse outward on a timer  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Still instantly readable as a navigation target (green, emissive beacon)
 * but no longer reads as a UI element pasted into 3D space.
 *
 * useFrame drives:
 *   - collar ring slow Y-rotation
 *   - ping ring scale oscillation (outward pulse every ~3 s)
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GoalSpec } from "@abyssal/worldgen";
import { TERRAIN_BASE_Y } from "./TerrainMesh";

interface GoalMarkerProps {
  goal: GoalSpec;
}

// Beacon brand colour — green, matches agent heuristic trail colour
const BEACON_HEX  = "#00ffa0";
const BEACON_COL  = new THREE.Color(BEACON_HEX);
const BODY_COL    = new THREE.Color("#2a3a4a");
const ACCENT_COL  = new THREE.Color("#1a4a5e");

export default function GoalMarker({ goal }: GoalMarkerProps) {
  const [x, y, z] = goal.position;
  const ar = goal.acceptanceRadius;

  // Refs for animated parts
  const collarRef = useRef<THREE.Mesh>(null);
  const ping1Ref  = useRef<THREE.Mesh>(null);
  const ping2Ref  = useRef<THREE.Mesh>(null);
  const ping3Ref  = useRef<THREE.Mesh>(null);

  // Distance from beacon to seabed
  const seabedY    = TERRAIN_BASE_Y;
  const mooringLen = Math.abs(y - seabedY) + 0.2;
  const mooringY   = (y + seabedY) / 2 - y; // local Y offset from group origin

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Collar ring: slow continuous rotation
    if (collarRef.current) {
      collarRef.current.rotation.y = t * 0.6;
    }

    // Ping rings: sawtooth scale expansion 1.0→3.5× then reset
    // Three rings staggered by 1 s each over a 3 s cycle
    if (ping1Ref.current) {
      const p1 = (t % 3.0) / 3.0;          // 0→1 over 3 s
      const s1 = 1.0 + p1 * 2.5;           // scale 1.0 → 3.5
      const a1 = (1.0 - p1);               // fade out
      ping1Ref.current.scale.setScalar(s1);
      (ping1Ref.current.material as THREE.MeshBasicMaterial).opacity = a1 * 0.22;
    }
    if (ping2Ref.current) {
      const p2 = ((t + 1.0) % 3.0) / 3.0;
      const s2 = 1.0 + p2 * 2.5;
      const a2 = (1.0 - p2);
      ping2Ref.current.scale.setScalar(s2);
      (ping2Ref.current.material as THREE.MeshBasicMaterial).opacity = a2 * 0.18;
    }
    if (ping3Ref.current) {
      const p3 = ((t + 2.0) % 3.0) / 3.0;
      const s3 = 1.0 + p3 * 2.5;
      const a3 = (1.0 - p3);
      ping3Ref.current.scale.setScalar(s3);
      (ping3Ref.current.material as THREE.MeshBasicMaterial).opacity = a3 * 0.15;
    }
  });

  return (
    <group name="goal-marker" position={[x, y, z]}>

      {/* ── Body: tapered transponder housing ──────────────────────── */}
      <mesh position={[0, -0.55, 0]}>
        <cylinderGeometry args={[0.28, 0.42, 1.1, 10]} />
        <meshStandardMaterial
          color={BODY_COL}
          roughness={0.65}
          metalness={0.45}
        />
      </mesh>

      {/* Mounting flange at base */}
      <mesh position={[0, -1.12, 0]}>
        <cylinderGeometry args={[0.50, 0.50, 0.08, 10]} />
        <meshStandardMaterial
          color={ACCENT_COL}
          roughness={0.7}
          metalness={0.55}
        />
      </mesh>

      {/* ── Beacon dome: emissive green glass hemisphere on top ────── */}
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial
          color={BEACON_COL}
          emissive={BEACON_COL}
          emissiveIntensity={2.0}
          roughness={0.08}
          metalness={0.0}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Small beacon lens cap */}
      <mesh position={[0, 0.44, 0]}>
        <sphereGeometry args={[0.14, 12, 8]} />
        <meshStandardMaterial
          color={BEACON_COL}
          emissive={BEACON_COL}
          emissiveIntensity={3.2}
          roughness={0.05}
          metalness={0.0}
        />
      </mesh>

      {/* ── Collar ring: slowly rotating indicator band ─────────────── */}
      <mesh ref={collarRef} position={[0, -0.18, 0]}>
        <torusGeometry args={[0.35, 0.045, 8, 28]} />
        <meshStandardMaterial
          color={BEACON_COL}
          emissive={BEACON_COL}
          emissiveIntensity={0.9}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>

      {/* ── Vertical light column — wide upward cone from beacon ──────── */}
      {/* AdditiveBlending: bright shaft without occluding terrain */}
      <mesh position={[0, 18, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.05, 2.5, 36, 12, 1, true]} />
        <meshBasicMaterial
          color={BEACON_COL}
          transparent
          opacity={0.07}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* ── Ping rings: flat discs that pulse outward ────────────────── */}
      {/* Three rings staggered by 1 s, scale 1.0→3.5× */}
      <mesh ref={ping1Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ar * 0.88, ar, 40]} />
        <meshBasicMaterial
          color={BEACON_COL}
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ping2Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ar * 0.88, ar, 40]} />
        <meshBasicMaterial
          color={BEACON_COL}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ping3Ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ar * 0.88, ar, 40]} />
        <meshBasicMaterial
          color={BEACON_COL}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ── Acceptance-radius wireframe cage (readability) ─────────── */}
      <mesh>
        <sphereGeometry args={[ar, 14, 10]} />
        <meshBasicMaterial
          color={BEACON_COL}
          wireframe
          transparent
          opacity={0.14}
        />
      </mesh>

      {/* ── Mooring line: thin cable to seabed ─────────────────────── */}
      <mesh position={[0, mooringY, 0]}>
        <cylinderGeometry args={[0.012, 0.012, mooringLen, 4]} />
        <meshBasicMaterial
          color={ACCENT_COL}
          transparent
          opacity={0.55}
        />
      </mesh>

      {/* ── Proximity point light (illuminates terrain nearby) ──────── */}
      <pointLight
        color={BEACON_COL}
        intensity={22}
        distance={28}
        decay={2}
        position={[0, 0.4, 0]}
      />
    </group>
  );
}
