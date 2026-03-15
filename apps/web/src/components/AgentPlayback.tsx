"use client";

/**
 * AgentPlayback — animated agent mesh driven by replay steps (Phase 4)
 *
 * This component MUST be rendered inside a React Three Fiber <Canvas>.
 * It owns the per-frame animation loop via useFrame, updating the agent
 * mesh position directly through a ref (no React state → no re-renders).
 *
 * 2D → 3D mapping:
 *   replay step position = [x, 0, z]  (Y=0 from Python benchmark)
 *   rendered position    = [x, AGENT_Y, z]  (raised above terrain floor)
 *
 * Smooth interpolation between steps prevents jitter at normal playback
 * speed (10 steps/sec at 1×).
 */

import { useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ReplayStep } from "@abyssal/replay-schema";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Simulated time between replay steps (matches Python env DT=0.1) */
const STEP_DURATION = 0.1; // seconds

/** Height above terrain floor where the agent sphere is centred */
const AGENT_Y = 0.8;

/** Sphere radius for the agent mesh */
const AGENT_RADIUS = 0.45;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentPlaybackProps {
  steps: ReplayStep[];
  playing: boolean;
  speed: number;
  /** Increment this value to reset playback to step 0 */
  playbackKey: number;
  /** Called whenever the current step index changes (for UI updates) */
  onStepChange?: (stepIndex: number) => void;
  /**
   * Scrubber seek support (Phase 4.5).
   * Increment seekVersion to snap the agent to seekToStep.
   * Both must be updated together in the same state transition.
   */
  seekVersion?: number;
  seekToStep?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgentPlayback({
  steps,
  playing,
  speed,
  playbackKey,
  onStepChange,
  seekVersion,
  seekToStep,
}: AgentPlaybackProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Animation state kept in refs — no React state, no re-renders per frame
  const currentStepRef = useRef(0);
  const timeAccRef = useRef(0);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);

  // Keep refs in sync with props without triggering re-render
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  // Reset animation when playbackKey changes (restart action)
  useEffect(() => {
    currentStepRef.current = 0;
    timeAccRef.current = 0;
    if (steps.length > 0 && meshRef.current) {
      const s = steps[0];
      meshRef.current.position.set(s.position[0], AGENT_Y, s.position[2]);
    }
    onStepChange?.(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackKey]);

  // Seek to a specific step when seekVersion changes (scrubber drag)
  useEffect(() => {
    if (seekVersion === undefined || seekToStep === undefined) return;
    const target = Math.max(0, Math.min(seekToStep, steps.length - 1));
    currentStepRef.current = target;
    timeAccRef.current = 0;
    if (steps.length > 0 && meshRef.current) {
      const s = steps[target];
      meshRef.current.position.set(s.position[0], AGENT_Y, s.position[2]);
    }
    onStepChange?.(target);
  // seekVersion is the trigger; seekToStep is always read alongside it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekVersion]);

  // Set initial position on first mount / steps change
  useEffect(() => {
    if (steps.length > 0 && meshRef.current) {
      const s = steps[0];
      meshRef.current.position.set(s.position[0], AGENT_Y, s.position[2]);
    }
  }, [steps]);

  useFrame((_, delta) => {
    if (!meshRef.current || steps.length === 0) return;

    const idx = currentStepRef.current;
    const curr = steps[idx];
    const next = steps[Math.min(idx + 1, steps.length - 1)];

    if (playingRef.current && idx < steps.length - 1) {
      timeAccRef.current += delta * speedRef.current;

      // Advance through as many steps as accumulated time warrants
      while (
        timeAccRef.current >= STEP_DURATION &&
        currentStepRef.current < steps.length - 1
      ) {
        timeAccRef.current -= STEP_DURATION;
        currentStepRef.current++;
        onStepChange?.(currentStepRef.current);
      }
    }

    // Smooth sub-step interpolation
    const t = Math.min(timeAccRef.current / STEP_DURATION, 1);
    const cx = curr.position[0];
    const cz = curr.position[2];
    const nx = next.position[0];
    const nz = next.position[2];

    meshRef.current.position.set(
      cx + (nx - cx) * t,
      AGENT_Y,
      cz + (nz - cz) * t
    );

    // Subtle pulsing glow effect on the outer shell
    if (glowRef.current) {
      const pulse = 1 + Math.sin(Date.now() * 0.004) * 0.08;
      glowRef.current.scale.setScalar(pulse);
    }
  });

  if (steps.length === 0) return null;

  return (
    <group>
      {/* Core agent sphere */}
      <mesh ref={meshRef} position={[0, AGENT_Y, 0]}>
        <sphereGeometry args={[AGENT_RADIUS, 20, 16]} />
        <meshStandardMaterial
          color="#00ffaa"
          emissive="#00cc88"
          emissiveIntensity={0.8}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>

      {/* Pulsing outer glow shell — larger, transparent */}
      <mesh ref={glowRef} position={[0, AGENT_Y, 0]}>
        <sphereGeometry args={[AGENT_RADIUS * 1.6, 16, 12]} />
        <meshStandardMaterial
          color="#00ffaa"
          emissive="#00ffaa"
          emissiveIntensity={0.2}
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Agent point light — illuminates nearby terrain */}
      <pointLight
        color="#00ffaa"
        intensity={6}
        distance={8}
        position={[0, AGENT_Y, 0]}
      />
    </group>
  );
}
