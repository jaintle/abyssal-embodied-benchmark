"use client";

/**
 * ObstacleField — renders all seeded obstacles as sphere meshes.
 *
 * Phase 10 material upgrade:
 *   Removed the previous cyan emissive tint — submerged rocks do not
 *   self-illuminate.  Material now reads as dark wet basalt / granite:
 *     - Very high roughness (0.90) — no specular hotspots
 *     - Near-zero metalness       — rock, not metal
 *     - Slightly lighter than terrain for silhouette separation
 *
 * Phase 12 addition: shadow discs.
 *   Each obstacle gets a soft radial-gradient disc on the seabed.
 *   A single shared ShaderMaterial is reused across all discs (one instance).
 *   AdditiveBlending is avoided here — darkening (subtractive) is correct for
 *   a contact shadow.  The disc uses NormalBlending with a black, transparent
 *   material so the underlying terrain appears slightly darker underneath.
 *
 * The instanced rendering note is intentional: 12 obstacles is trivially
 * handled by individual draw calls and keeps the code auditable.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { ObstacleData } from "@abyssal/worldgen";
import { TERRAIN_BASE_Y } from "./TerrainMesh";

// ─── Shadow disc shaders ──────────────────────────────────────────────────────

const SHADOW_VERT = /* glsl */ `
  varying vec2 vUV;
  void main() {
    vUV         = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHADOW_FRAG = /* glsl */ `
  varying vec2 vUV;
  void main() {
    // Map uv [0,1]² → centred [-1,1]²
    vec2  d    = vUV * 2.0 - 1.0;
    float dist = length(d);
    // Radial gradient: fully dark at centre, fades out at edge
    float a = (1.0 - smoothstep(0.3, 1.0, dist)) * 0.40;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface ObstacleFieldProps {
  obstacles: ObstacleData[];
}

export default function ObstacleField({ obstacles }: ObstacleFieldProps) {
  // Single shared shadow material — all discs reuse it
  const shadowMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader:   SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent:    true,
        depthWrite:     false,
        side:           THREE.FrontSide,
      }),
    []
  );

  return (
    <group name="obstacle-field">
      {obstacles.map((obs) => (
        <group key={obs.index}>
          {/* ── Rock sphere ──────────────────────────────────────────── */}
          <mesh
            position={[obs.position[0], obs.position[1], obs.position[2]]}
            castShadow={false}
            receiveShadow={false}
          >
            <sphereGeometry args={[obs.radius, 20, 14]} />
            {/*
             * Dark wet basalt/granite look.
             * No emissive — rocks don't glow underwater.
             * Slightly lighter base than terrain so obstacles read
             * as solid objects against the seabed.
             */}
            <meshStandardMaterial
              color="#1d2e3d"
              roughness={0.90}
              metalness={0.05}
            />
          </mesh>

          {/* ── Contact shadow disc on seabed ────────────────────────── */}
          {/* Radius 1.8× the obstacle radius gives a soft penumbra ring */}
          <mesh
            position={[obs.position[0], TERRAIN_BASE_Y + 0.05, obs.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={1}
          >
            <circleGeometry args={[obs.radius * 1.8, 16]} />
            <primitive object={shadowMat} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
