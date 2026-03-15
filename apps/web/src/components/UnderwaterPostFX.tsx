"use client";

/**
 * UnderwaterPostFX — postprocessing effects stack for all Canvas scenes.
 *
 * ⚠  CURRENTLY NOT USED — R3F v9 INCOMPATIBILITY
 *
 * @react-three/postprocessing v2.x internally reads `group.__r3f.objects`
 * (the R3F v8 instance array name) but R3F v9 renamed that field to
 * `group.__r3f.children`.  This causes a runtime crash:
 *   "Cannot read properties of undefined (reading 'length')"
 *
 * The scenes use hardware antialias:true instead.
 * Re-enable this component once @react-three/postprocessing ships a v3
 * that is compatible with @react-three/fiber v9.
 *
 * Correct prop: `enableNormalPass={false}` (not `disableNormalPass`).
 */

import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { UnderwaterMediumConfig } from "@/lib/underwaterMedium";
import { DEFAULT_MEDIUM } from "@/lib/underwaterMedium";

interface UnderwaterPostFXProps {
  config?: UnderwaterMediumConfig;
}

export default function UnderwaterPostFX({ config = DEFAULT_MEDIUM }: UnderwaterPostFXProps) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* Anti-aliasing — must be first so subsequent effects work on smooth edges */}
      <SMAA />

      {/*
       * Bloom: restricted to the brightest emissive elements only.
       * luminanceThreshold ~0.72: goal beacon + agent glows exceed this;
       * terrain, obstacles, and fog do not.
       * intensity 0.4–0.5: visible but restrained — not a sci-fi halo.
       */}
      <Bloom
        luminanceThreshold={config.bloomLuminanceThreshold}
        luminanceSmoothing={0.08}
        intensity={config.bloomIntensity}
        blendFunction={BlendFunction.ADD}
      />

      {/*
       * Vignette: dark edge, subtle lens fall-off feel.
       * offset controls where the dark edge begins (0 = center, 1 = no vignette).
       * darkness controls depth of the darkening at the frame edge.
       */}
      <Vignette
        offset={config.vignetteOffset}
        darkness={config.vignetteDarkness}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
