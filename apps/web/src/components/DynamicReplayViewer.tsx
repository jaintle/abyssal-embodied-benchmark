"use client";

/**
 * DynamicReplayViewer — SSR-safe loader for the replay viewer (Phase 4)
 *
 * `next/dynamic` with `ssr: false` is only valid inside a Client Component.
 * This thin wrapper exists so that page.tsx can remain a Server Component
 * while still opting out of SSR for the full interactive viewer.
 */

import dynamic from "next/dynamic";

const ReplayViewer = dynamic(() => import("./ReplayViewer"), {
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
      INITIALISING WORLD…
    </div>
  ),
});

export default function DynamicReplayViewer() {
  return <ReplayViewer />;
}
