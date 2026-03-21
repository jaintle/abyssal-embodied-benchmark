/**
 * /replays — Replay Arena page (Phase C)
 *
 * Full-screen replay exploration. DynamicReplayArena handles all
 * interactivity client-side (no SSR — WebGL).
 *
 * Accepts optional URL query params for deep-linking:
 *   ?agents=<id1>,<id2>   pre-select submissions
 *   &preset=<name>         pre-select degradation preset
 *   &episode=<n>           pre-select episode index
 */

import { Suspense } from "react";
import DynamicReplayArena from "@/components/DynamicReplayArena";

export default function ReplaysPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#020a12",
        overflow: "hidden",
        paddingTop: 36, // NavBar height
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Suspense
        fallback={
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "monospace",
              fontSize: "0.7rem",
              color: "#2a6a9e",
              letterSpacing: "0.1em",
            }}
          >
            LOADING REPLAY ARENA…
          </div>
        }
      >
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DynamicReplayArena />
        </div>
      </Suspense>
    </div>
  );
}
