"use client";

/**
 * NavBar — minimal top navigation bar (Phase C)
 *
 * Thin dark bar with monospace styling consistent with the benchmark
 * aesthetic. Links to the three top-level sections:
 *   Benchmark  (main 3D comparison view)
 *   Leaderboard
 *   Replay Arena
 *
 * Positioned fixed so it overlays the full-screen 3D canvas on the main page.
 */

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR: CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: 36,
  zIndex: 100,
  background: "rgba(2, 10, 18, 0.90)",
  borderBottom: "1px solid #0d3b52",
  display: "flex",
  alignItems: "center",
  padding: "0 20px",
  gap: 0,
  backdropFilter: "blur(4px)",
  userSelect: "none",
};

const BRAND: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.68rem",
  letterSpacing: "0.12em",
  color: "#2a6a9e",
  textTransform: "uppercase" as const,
  marginRight: 24,
  whiteSpace: "nowrap" as const,
};

const DIVIDER: CSSProperties = {
  width: 1,
  height: 16,
  background: "#0d3b52",
  margin: "0 16px",
};

const LINK_BASE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.68rem",
  letterSpacing: "0.08em",
  textDecoration: "none",
  color: "#4a8aaa",
  padding: "4px 8px",
  borderRadius: 3,
  transition: "color 0.15s, background 0.15s",
  whiteSpace: "nowrap" as const,
};

const LINK_ACTIVE: CSSProperties = {
  ...LINK_BASE,
  color: "#00ffa0",
  background: "rgba(0, 255, 160, 0.08)",
};

const VERSION: CSSProperties = {
  marginLeft: "auto",
  fontFamily: "monospace",
  fontSize: "0.62rem",
  color: "#1a4a6a",
  letterSpacing: "0.06em",
};

// ─── Nav links ────────────────────────────────────────────────────────────────

const LINKS: { href: string; label: string }[] = [
  { href: "/",            label: "BENCHMARK" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/replays",     label: "REPLAY ARENA" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav style={BAR}>
      <span style={BRAND}>ABYSSAL</span>
      <div style={DIVIDER} />

      {LINKS.map(({ href, label }, i) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            style={isActive ? LINK_ACTIVE : LINK_BASE}
          >
            {label}
          </Link>
        );
      })}

      <span style={VERSION}>v1.0.0</span>
    </nav>
  );
}
