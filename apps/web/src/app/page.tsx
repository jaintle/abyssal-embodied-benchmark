/**
 * page.tsx — Abyssal Embodied Benchmark demo page (Server Component)
 *
 * Generates world metadata server-side for the debug panel.
 * The WebGL canvas is loaded via DynamicWorldScene (a Client Component
 * that wraps `next/dynamic` with `ssr: false`).
 */

import { generateWorldSpec } from "@abyssal/worldgen";
import DynamicWorldScene from "@/components/DynamicWorldScene";

// ─── Config ───────────────────────────────────────────────────────────────────

/** Demo world seed. Change this to explore different procedural worlds. */
const DEMO_SEED = 42;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  // Generate spec server-side to extract static metadata for the debug panel
  const spec = generateWorldSpec(DEMO_SEED);

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
      {/* ── 3-D canvas fills the viewport ────────────────────────────── */}
      <div style={{ width: "100%", height: "100%" }}>
        <DynamicWorldScene seed={DEMO_SEED} />
      </div>

      {/* ── Debug / metadata overlay ──────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          padding: "12px 16px",
          background: "rgba(2, 10, 18, 0.72)",
          borderRight: "1px solid #0d3b52",
          borderBottom: "1px solid #0d3b52",
          borderBottomRightRadius: "6px",
          fontFamily: "monospace",
          fontSize: "0.72rem",
          lineHeight: 1.7,
          color: "#4a9aba",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <div style={{ color: "#00ffa0", fontWeight: "bold", marginBottom: 4 }}>
          ABYSSAL BENCHMARK
        </div>
        <div>
          <span style={{ color: "#2a6a9e" }}>version  </span>
          {spec.benchmarkVersion}
        </div>
        <div>
          <span style={{ color: "#2a6a9e" }}>seed     </span>
          {spec.worldSeed}
        </div>
        <div>
          <span style={{ color: "#2a6a9e" }}>radius   </span>
          {spec.worldRadius} m
        </div>
        <div>
          <span style={{ color: "#2a6a9e" }}>obs      </span>
          {spec.obstacles.count} (obstacleSeed {spec.obstacles.obstacleSeed})
        </div>
        <div>
          <span style={{ color: "#2a6a9e" }}>degrad   </span>
          {spec.degradation.preset}
        </div>
        <div style={{ marginTop: 6, color: "#1a4a6e", fontSize: "0.65rem" }}>
          drag to orbit · scroll to zoom
        </div>
      </div>
    </div>
  );
}
