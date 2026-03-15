"use client";

/**
 * CameraController — camera preset logic (Phase 4.5)
 *
 * Must be rendered inside a React Three Fiber <Canvas>.
 *
 * Modes:
 *   "overview" — no-op; OrbitControls handles the camera normally.
 *   "follow"   — camera lerps to a fixed offset above/behind the agent
 *                each frame. OrbitControls must be disabled in this mode.
 *
 * The fixed follow offset is world-space (not agent-relative rotation)
 * to keep the implementation simple and deterministic.
 */

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ReplayStep } from "@abyssal/replay-schema";

/** Agent eye-level height — must match AGENT_Y in AgentPlayback */
const AGENT_Y = 0.8;

/** World-space offset from agent position to follow-camera position */
const FOLLOW_OFFSET = new THREE.Vector3(0, 14, 18);

/** Lerp factor per frame — lower = smoother, slower to catch up */
const FOLLOW_LERP = 0.05;

export interface CameraControllerProps {
  mode: "overview" | "follow";
  steps: ReplayStep[];
  currentStep: number;
}

export default function CameraController({
  mode,
  steps,
  currentStep,
}: CameraControllerProps) {
  const { camera } = useThree();
  const desiredPos = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());

  useFrame(() => {
    if (mode !== "follow" || steps.length === 0) return;

    const step = steps[Math.min(currentStep, steps.length - 1)];
    const ax = step.position[0];
    const az = step.position[2];

    desiredPos.current.set(
      ax + FOLLOW_OFFSET.x,
      AGENT_Y + FOLLOW_OFFSET.y,
      az + FOLLOW_OFFSET.z
    );
    lookAt.current.set(ax, AGENT_Y, az);

    camera.position.lerp(desiredPos.current, FOLLOW_LERP);
    camera.lookAt(lookAt.current);
  });

  return null;
}
