"use client";

/**
 * DynamicMultiReplayViewer — SSR-safe loader for the multi-agent comparison
 * viewer (Phase 6)
 *
 * `next/dynamic` with `ssr: false` is only valid inside a Client Component.
 * This thin wrapper lets page.tsx remain a Server Component while opting out
 * of SSR for the interactive WebGL viewer.
 */

import dynamic from "next/dynamic";

const MultiReplayViewer = dynamic(() => import("./MultiReplayViewer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#020a12",
        color: "#4a9aba",
        fontFamily: "monospace",
        fontSize: "0.85rem",
        letterSpacing: "0.08em",
      }}
    >
      INITIALISING BENCHMARK…
    </div>
  ),
});

export default function DynamicMultiReplayViewer() {
  return <MultiReplayViewer />;
}
