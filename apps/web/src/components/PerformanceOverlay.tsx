"use client";

/**
 * PerformanceOverlay — Phase 2: dev-only render stats HUD
 *
 * Two parts:
 *   PerfCollector   — R3F component that runs INSIDE a <Canvas>; reads
 *                     renderer.info each frame and fires onStats callbacks.
 *   PerformanceHUD  — plain React component rendered OUTSIDE the canvas as
 *                     an absolute-positioned overlay; displays the stats.
 *
 * Toggle:
 *   Press  P  anywhere on the page to show / hide the HUD.
 *   OR pass  visible  prop explicitly (e.g. from URL param ?perf=1).
 *
 * Usage (inside a component that owns a <Canvas>):
 *
 *   // parent state
 *   const [perfStats, setPerfStats] = useState<RenderStats | null>(null);
 *   const [showPerf, setShowPerf] = useState(false);
 *
 *   // inside <Canvas>:
 *   <PerfCollector onStats={setPerfStats} />
 *
 *   // sibling of <Canvas>:
 *   <PerformanceHUD stats={perfStats} visible={showPerf} />
 *
 * The PerfToggle component handles the keyboard listener and can be
 * dropped anywhere in the tree.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { CSSProperties } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  lines: number;
}

// ─── PerfCollector (runs INSIDE Canvas) ──────────────────────────────────────

interface PerfCollectorProps {
  /** Called every frame with current render stats */
  onStats: (stats: RenderStats) => void;
  /** Rolling window for FPS averaging (frames). Default: 30. */
  fpsWindow?: number;
}

export function PerfCollector({ onStats, fpsWindow = 30 }: PerfCollectorProps) {
  const { gl } = useThree();
  const timestamps = useRef<number[]>([]);

  useFrame(() => {
    const now = performance.now();
    const ts = timestamps.current;
    ts.push(now);
    if (ts.length > fpsWindow) ts.shift();

    let fps = 0;
    if (ts.length >= 2) {
      const elapsed = ts[ts.length - 1] - ts[0];
      fps = Math.round(((ts.length - 1) / elapsed) * 1000);
    }

    const info = gl.info.render;
    onStats({
      fps,
      drawCalls: info.calls,
      triangles: info.triangles,
      lines: (info as { lines?: number }).lines ?? 0,
    });
  });

  return null;
}

// ─── PerformanceHUD (rendered OUTSIDE Canvas as HTML overlay) ─────────────────

interface PerformanceHUDProps {
  stats: RenderStats | null;
  visible: boolean;
}

export function PerformanceHUD({ stats, visible }: PerformanceHUDProps) {
  if (!visible || !stats) return null;

  const fpsColor =
    stats.fps >= 55 ? "#00ff88" :
    stats.fps >= 30 ? "#ffcc44" :
    "#ff4444";

  return (
    <div style={HUD_ROOT}>
      <div style={HUD_TITLE}>PERF</div>
      <Row label="FPS"   value={`${stats.fps}`}        color={fpsColor} />
      <Row label="DC"    value={`${stats.drawCalls}`}  />
      <Row label="TRIS"  value={fmtK(stats.triangles)} />
    </div>
  );
}

// ─── PerfToggle (keyboard listener — place once in tree) ─────────────────────

interface PerfToggleProps {
  onToggle: () => void;
}

/** Listens for  P  keydown and calls onToggle. Mount once per page. */
export function PerfToggle({ onToggle }: PerfToggleProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.key === "p" || e.key === "P") &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        onToggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggle]);
  return null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function Row({
  label,
  value,
  color = "#e0f0ff",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={ROW}>
      <span style={LABEL}>{label}</span>
      <span style={{ ...VALUE, color }}>{value}</span>
    </div>
  );
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const HUD_ROOT: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  background: "rgba(2, 10, 18, 0.82)",
  border: "1px solid rgba(0, 200, 255, 0.25)",
  borderRadius: 4,
  padding: "6px 10px",
  fontFamily: "monospace",
  fontSize: 11,
  color: "#e0f0ff",
  pointerEvents: "none",
  zIndex: 1000,
  lineHeight: 1.6,
  minWidth: 90,
  backdropFilter: "blur(4px)",
};

const HUD_TITLE: CSSProperties = {
  fontSize: 9,
  letterSpacing: "0.12em",
  color: "rgba(0, 200, 255, 0.7)",
  marginBottom: 4,
  borderBottom: "1px solid rgba(0, 200, 255, 0.15)",
  paddingBottom: 3,
};

const ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
};

const LABEL: CSSProperties = {
  color: "rgba(0, 200, 255, 0.6)",
  userSelect: "none",
};

const VALUE: CSSProperties = {
  textAlign: "right",
  minWidth: 36,
};
