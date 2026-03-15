"use client";

/**
 * UnderwaterCameraController — simulates handheld underwater camera sway.
 *
 * Renders no geometry.  Uses useFrame at priority=1 (runs after OrbitControls
 * at priority=0) so the sway is added ON TOP of the user's orbit position.
 * OrbitControls re-sets the spherical base each frame; this component adds a
 * smooth Lissajous oscillation offset, giving the camera constant gentle drift
 * without fighting the orbit control.
 *
 * Three independent sine frequencies (prime-ratio to avoid beating):
 *   X — 0.17 rad/s slow horizontal drift
 *   Y — 0.11 rad/s slow vertical bob
 *   Z — 0.13 rad/s slow fore-aft drift
 * Roll — 0.09 rad/s subtle camera tilt (not controlled by OrbitControls)
 *
 * When disabled the roll is damped back to zero so disabling is smooth.
 *
 * Props:
 *   enabled   — master on/off switch
 *   amplitude — scale factor (0 = no sway, 1 = default, >1 = stronger)
 */

import { useFrame, useThree } from "@react-three/fiber";

interface UnderwaterCameraControllerProps {
  enabled: boolean;
  amplitude?: number;
}

export default function UnderwaterCameraController({
  enabled,
  amplitude = 1.0,
}: UnderwaterCameraControllerProps) {
  const { camera } = useThree();

  // Priority 1 → executes after OrbitControls (priority 0) every frame
  useFrame(({ clock }) => {
    if (!enabled) {
      // Smoothly return camera roll to 0 when disabled
      camera.rotation.z *= 0.90;
      return;
    }

    const t = clock.getElapsedTime();
    const a = amplitude;

    // ── Position drift (added on top of OrbitControls base) ────────────
    // Different prime-ratio frequencies prevent visible periodicity
    camera.position.x += Math.sin(t * 0.17 + 1.10) * a * 0.036;
    camera.position.y += Math.sin(t * 0.11 + 2.30) * a * 0.018;
    camera.position.z += Math.cos(t * 0.13 + 0.74) * a * 0.036;

    // ── Camera roll — handheld tilt, not managed by OrbitControls ──────
    camera.rotation.z = Math.sin(t * 0.09) * a * 0.011;
  }, 1);

  return null;
}
