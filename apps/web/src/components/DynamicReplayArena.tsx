"use client";

/**
 * DynamicReplayArena — SSR-safe wrapper for ReplayArena (Phase C)
 *
 * ReplayArena uses R3F (WebGL), next/navigation, and browser APIs.
 * Disable SSR so Next.js doesn't try to render it on the server.
 *
 * Must be a Client Component ("use client") because next/dynamic with
 * ssr: false is not permitted in Server Components.
 */

import dynamic from "next/dynamic";

const DynamicReplayArena = dynamic(() => import("./ReplayArena"), {
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
        fontFamily: "monospace",
        fontSize: "0.7rem",
        color: "#2a6a9e",
        letterSpacing: "0.12em",
      }}
    >
      LOADING REPLAY ARENA…
    </div>
  ),
});

export default DynamicReplayArena;
