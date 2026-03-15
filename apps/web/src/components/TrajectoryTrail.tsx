"use client";

/**
 * TrajectoryTrail — faint line showing the agent's path up to currentStep (Phase 4.5)
 *
 * Uses a pre-allocated BufferGeometry (all positions baked in once).
 * Only the draw range changes as currentStep advances — no per-frame
 * geometry rebuild.
 *
 * Toggle: set TRAIL_ENABLED = false to disable globally.
 */

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import type { ReplayStep } from "@abyssal/replay-schema";

/** Set to false to globally disable trail rendering */
export const TRAIL_ENABLED = true;

/** Y height — must match AGENT_Y in AgentPlayback */
const TRAIL_Y = 0.8;

interface TrajectoryTrailProps {
  steps: ReplayStep[];
  currentStep: number;
}

export default function TrajectoryTrail({ steps, currentStep }: TrajectoryTrailProps) {
  // Build the full position buffer once from all replay steps.
  // The draw range controls how much is visible — no allocation on update.
  const { line, geometry } = useMemo(() => {
    const positions = new Float32Array(steps.length * 3);
    for (let i = 0; i < steps.length; i++) {
      positions[i * 3]     = steps[i].position[0];
      positions[i * 3 + 1] = TRAIL_Y;
      positions[i * 3 + 2] = steps[i].position[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 1);

    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#1aafa0"),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    return { line: new THREE.Line(geo, mat), geometry: geo };
  }, [steps]);

  // Extend (or shrink on seek) the visible trail without touching positions.
  useEffect(() => {
    geometry.setDrawRange(0, currentStep + 1);
  }, [currentStep, geometry]);

  if (!TRAIL_ENABLED || steps.length === 0) return null;

  return <primitive object={line} />;
}
