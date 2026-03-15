/**
 * page.tsx — Abyssal Embodied Benchmark replay viewer (Phase 4)
 *
 * Server Component root. Renders the full-screen replay viewer via
 * DynamicReplayViewer, which opts out of SSR for the WebGL canvas.
 *
 * All playback state, replay loading, and 3D rendering are handled
 * inside DynamicReplayViewer (a Client Component).
 */

import DynamicReplayViewer from "@/components/DynamicReplayViewer";

export default function BenchmarkPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#020a12",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <DynamicReplayViewer />
    </div>
  );
}
