"use client";

/**
 * ParticleField — suspended underwater particulates (marine snow).
 *
 * Technique: THREE.Points with a custom ShaderMaterial that animates
 * particle positions entirely on the GPU using the time uniform.
 * Each particle has a per-vertex `aOffset` attribute (random float 0–1)
 * that de-synchronises its motion so they don't all move in unison.
 *
 * Each particle orbits around its initial position with a slow, gentle
 * Lissajous-like path: sin(t * freq_x + phase_x) * amp for each axis.
 * The result is the characteristic slight-drift-and-float of marine snow
 * without any per-frame CPU buffer writes (no needsUpdate each frame).
 *
 * Visual characteristics:
 *   - Tiny circular sprites (discard outside circle radius in fragment)
 *   - Very slight blue-white tint
 *   - Perspective-correct size attenuation
 *   - Depth fade: particles fade in the far fog naturally because the
 *     fog is exponential and applies at the fragment level in R3F
 *
 * Particle count and opacity come from the UnderwaterMediumConfig so
 * presets can dial density (e.g. heavy turbidity → more particles).
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  attribute float aOffset;
  uniform float uTime;
  uniform float uSize;

  void main() {
    vec3 pos = position;

    // Slow Lissajous drift — each particle has unique phase (aOffset * 2π * N)
    float ox = aOffset * 6.2832;
    float oy = aOffset * 12.5664;
    float oz = aOffset * 9.4248;

    pos.x += sin(uTime * 0.18 + ox) * 0.75;
    pos.y += sin(uTime * 0.13 + oy) * 0.38;  // gentler vertical motion
    pos.z += cos(uTime * 0.16 + oz) * 0.75;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    // Perspective-correct size: larger up close, smaller far away
    gl_PointSize = uSize * (280.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const FRAG = /* glsl */ `
  uniform float uOpacity;

  void main() {
    // Discard outside unit circle → circular sprite, no square border
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;

    // Smooth radial falloff for soft edges
    float alpha = (0.5 - d) * 2.0 * uOpacity;

    // Slight blue-white tint — suspended mineral particles in seawater
    gl_FragColor = vec4(0.72, 0.88, 1.0, alpha);
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface ParticleFieldProps {
  config?: UnderwaterMediumConfig;
}

// Volume bounds for initial particle placement
const VOL_X = 80;
const VOL_Y_MIN = -10;
const VOL_Y_MAX =  14;
const VOL_Z = 80;

export default function ParticleField({ config = DEFAULT_MEDIUM }: ParticleFieldProps) {
  const count = config.particleCount;
  const matRef = useRef<THREE.ShaderMaterial>(null);

  // Build geometry once; particle count changes only on config change
  const [geometry, material] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const offsets   = new Float32Array(count);

    const rng = mulberry32(0xdeadbeef); // deterministic — same world each load

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (rng() - 0.5) * VOL_X;
      positions[i * 3 + 1] = VOL_Y_MIN + rng() * (VOL_Y_MAX - VOL_Y_MIN);
      positions[i * 3 + 2] = (rng() - 0.5) * VOL_Z;
      offsets[i]            = rng();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aOffset",  new THREE.BufferAttribute(offsets,   1));

    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:    { value: 0 },
        uSize:    { value: 1.4 },
        uOpacity: { value: config.particleOpacity },
      },
      transparent: true,
      depthWrite:  false,
      blending:    THREE.NormalBlending,
    });

    return [geo, mat] as const;
  }, [count, config.particleOpacity]);

  // Update only the time uniform — zero CPU buffer writes
  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <points geometry={geometry} renderOrder={2}>
      <primitive object={material} ref={matRef} attach="material" />
    </points>
  );
}

// ─── Deterministic RNG (mulberry32) ───────────────────────────────────────────
// Simple seeded PRNG — same seed → same particle layout every page load,
// so the scene is visually deterministic (important for a benchmark product).

function mulberry32(seed: number) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
