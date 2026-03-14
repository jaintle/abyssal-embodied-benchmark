"use client";

/**
 * DynamicWorldScene — client-side dynamic loader for the WebGL canvas.
 *
 * `next/dynamic` with `ssr: false` is only valid inside a Client Component.
 * This thin wrapper exists solely to satisfy that constraint, keeping
 * page.tsx a Server Component for metadata / debug-panel generation.
 */

import dynamic from "next/dynamic";
import type { WorldSceneProps } from "./WorldScene";

const WorldScene = dynamic(() => import("./WorldScene"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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

export default function DynamicWorldScene(props: WorldSceneProps) {
  return <WorldScene {...props} />;
}
