/**
 * page.tsx — Abyssal Embodied Benchmark multi-agent comparison viewer (Phase 6)
 *
 * Server Component root. Renders the multi-agent comparison viewer via
 * DynamicMultiReplayViewer, which opts out of SSR for the WebGL canvas.
 *
 * Layout (owned by MultiReplayViewer):
 *   left  — sidebar: BenchmarkSummaryPanel + LeaderboardTable
 *   right — 3D comparison canvas + ReplayComparisonControls overlay
 */

import DynamicMultiReplayViewer from "@/components/DynamicMultiReplayViewer";

export default function BenchmarkPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "calc(100vh - 36px)",
        marginTop: 36,
        background: "#020a12",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <DynamicMultiReplayViewer />
    </div>
  );
}
