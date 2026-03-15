"use client";

/**
 * WaterSurface — animated ocean surface viewed from below (Phase 11).
 *
 * Technique:
 *   - PlaneGeometry(220, 220, 80, 80) baked to XZ orientation (rotateX).
 *   - Vertex shader sums 4 Gerstner waves with different frequencies,
 *     directions and phases to produce a natural multi-frequency swell.
 *   - Fragment shader:
 *       * High-power specular shimmer where wave normal faces sun → sharp
 *         caustic-like bright patches on the surface underside.
 *       * Wide diffuse glow from sky scatter.
 *       * Lissajous interference shimmer (second frequency).
 *       * Fresnel-like opacity: more opaque at shallow view angles.
 *   - DoubleSide so the surface is visible from above and below as the
 *     camera orbits.
 *   - depthWrite: false prevents z-fighting with fog / particles above it.
 *
 * Placement:
 *   WATER_SURFACE_Y = 35  (camera at Y=22, seabed at Y≈-7)
 *   Positioned well above the camera so looking up reveals shimmering surface.
 */

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";

/** World-space Y of the animated water surface (metres). */
export const WATER_SURFACE_Y = 35;

// ─── Shaders ──────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
  uniform float uTime;

  varying vec3  vPos;
  varying vec3  vNormal;
  varying float vEdgeFade;  // 1 at centre, 0 at plane edge

  /**
   * One Gerstner wave term.
   * Returns (dX, dY, dZ) displacement in local XZ-horizontal space.
   * amp       — wave amplitude (metres)
   * wl        — wavelength (metres)
   * dir       — normalised 2D propagation direction in XZ
   * phase     — initial phase offset (radians)
   */
  vec3 gerstner(vec2 xz, float amp, float wl, vec2 dir, float phase) {
    float k  = 6.28318 / wl;
    float w  = sqrt(9.81 * k) * 0.30;     // slowed 3× — aesthetically calm
    float th = k * dot(dir, xz) - w * uTime + phase;
    return vec3(dir.x * amp * cos(th),
                amp * sin(th),
                dir.y * amp * cos(th));
  }

  void main() {
    // After geo.rotateX(-PI/2) bake: position.xz = horizontal, y starts 0
    vec3 pos = position;

    // Sum 4 overlapping wave families
    vec3 d  = vec3(0.0);
    d += gerstner(pos.xz, 0.55, 18.0, normalize(vec2( 1.0,  0.4)), 0.00);
    d += gerstner(pos.xz, 0.28, 10.0, normalize(vec2(-0.3,  1.0)), 1.20);
    d += gerstner(pos.xz, 0.13,  5.5, normalize(vec2( 0.9, -0.5)), 2.40);
    d += gerstner(pos.xz, 0.07,  3.0, normalize(vec2(-0.5,  0.8)), 0.80);

    pos += d;

    // Analytical displaced normal from wave tangent slopes (simplified)
    vNormal = normalize(vec3(-d.x * 0.22, 1.0, -d.z * 0.22));
    vPos    = pos;

    // Edge fade: full at centre, zero at 80% of the half-extent (300 m)
    // smoothstep(0.5, 0.8, r) → 0 inside 150 m, 1 outside 240 m
    float r    = length(position.xz) / 300.0;
    vEdgeFade  = 1.0 - smoothstep(0.50, 0.80, r);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uSkyColor;
  uniform vec3  uDeepColor;
  uniform vec3  uSunDir;

  varying vec3  vPos;
  varying vec3  vNormal;
  varying float vEdgeFade;

  void main() {
    vec3 n = normalize(vNormal);

    // ── Primary specular shimmer (sharp caustic glints) ───────────────────
    float sunFace = max(0.0, dot(n, uSunDir));
    float shimmer = pow(sunFace, 22.0) * 3.8;

    // ── Wide diffuse glow from surface scatter ────────────────────────────
    float glow = pow(sunFace, 3.0) * 0.45;

    // ── Lissajous interference pattern (second caustic frequency) ────────
    float s2 = sin(vPos.x * 0.36 + uTime * 0.13)
             * sin(vPos.z * 0.41 - uTime * 0.10);
    float interfere = pow(max(0.0, s2 * 0.5 + 0.5), 5.5) * 0.9;

    // ── Transmission colour: deep-water blue mixed upward to sky ─────────
    vec3 col = mix(uDeepColor, uSkyColor, 0.70);

    // ── Add light contributions ───────────────────────────────────────────
    col += vec3(1.0, 0.97, 0.87) * (shimmer + interfere * 0.38);
    col += uSkyColor * glow;

    // ── Fresnel-like opacity: more opaque at shallow view angles ─────────
    float cosA    = abs(n.y);
    float fresnel = 1.0 - cosA;
    float alpha   = 0.28 + fresnel * 0.36 + shimmer * 0.10;

    // ── Edge fade: make the plane boundary invisible ──────────────────────
    gl_FragColor = vec4(col, clamp(alpha * vEdgeFade, 0.0, 0.88));
  }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface WaterSurfaceProps {
  config?: UnderwaterMediumConfig;
}

export default function WaterSurface({ config = DEFAULT_MEDIUM }: WaterSurfaceProps) {
  // ── Derived uniforms ──────────────────────────────────────────────────────
  const sunDir = useMemo(() => {
    const [sx, sy, sz] = config.sunPosition;
    return new THREE.Vector3(sx, sy, sz).normalize();
  }, [config.sunPosition]);

  const skyColor  = useMemo(() => new THREE.Color(config.fogColor),        [config.fogColor]);
  const deepColor = useMemo(() => new THREE.Color(config.backgroundColor), [config.backgroundColor]);

  // ── Geometry + material (recreated if config changes) ────────────────────
  const [geometry, material] = useMemo(() => {
    // Bake horizontal orientation into geometry so vertex shader sees
    // position.xz = world horizontal, position.y = vertical offset.
    const geo = new THREE.PlaneGeometry(600, 600, 80, 80);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:     { value: 0 },
        uSkyColor: { value: skyColor.clone() },
        uDeepColor:{ value: deepColor.clone() },
        uSunDir:   { value: sunDir.clone() },
      },
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
      blending:    THREE.NormalBlending,
    });
    return [geo, mat] as const;
  }, [skyColor, deepColor, sunDir]);

  // Keep a always-current ref for use inside useFrame
  const materialRef = useRef<THREE.ShaderMaterial>(material);
  materialRef.current = material;

  useFrame(({ clock }) => {
    materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[0, WATER_SURFACE_Y, 0]}
      renderOrder={10}
    />
  );
}
