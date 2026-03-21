"use client";

/**
 * PublicLeaderboardTable — full public leaderboard (Phase C)
 *
 * Displays LeaderboardEntry[] loaded from the canonical manifest.
 * Supports sorting by success rate and date, filtering by status
 * and algorithm family, and verified/provisional visual semantics.
 *
 * Stateful (sorting, filtering, selected entry) but data-driven —
 * no hardcoded agent lists.
 *
 * Renders an "Official Baselines" highlighted section above the main
 * community table so internal reference points are easy to identify.
 */

import { useState, useMemo } from "react";
import type { CSSProperties } from "react";
import type { LeaderboardEntry } from "@abyssal/replay-schema";
import {
  isBaseline,
  sortEntries,
  filterEntries,
  entryColor,
  type SortKey,
  type SortDir,
} from "@/lib/leaderboardLoader";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublicLeaderboardTableProps {
  entries: LeaderboardEntry[];
  selectedId?: string;
  onSelect?: (entry: LeaderboardEntry) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    verified:    { bg: "rgba(0,255,160,0.10)", text: "#00ffa0", border: "#00ffa0" },
    provisional: { bg: "rgba(255,204,68,0.10)", text: "#ffcc44", border: "#ffcc44" },
    rejected:    { bg: "rgba(255,80,80,0.10)", text: "#ff5050", border: "#ff5050" },
  };
  const c = colors[status] ?? colors.provisional;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "monospace",
        fontSize: "0.6rem",
        letterSpacing: "0.06em",
        padding: "2px 6px",
        borderRadius: 3,
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
        whiteSpace: "nowrap" as const,
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function AlgoBadge({ family }: { family: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "monospace",
        fontSize: "0.59rem",
        padding: "1px 5px",
        borderRadius: 3,
        background: "rgba(42,106,158,0.15)",
        color: "#4a8aaa",
        border: "1px solid #0d3b52",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap" as const,
      }}
    >
      {family}
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SECTION_TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  letterSpacing: "0.12em",
  color: "#2a6a9e",
  textTransform: "uppercase" as const,
  marginBottom: 10,
  marginTop: 24,
};

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: "monospace",
  fontSize: "0.7rem",
};

const TH: CSSProperties = {
  padding: "6px 10px",
  color: "#2a6a9e",
  borderBottom: "1px solid #0d3b52",
  textAlign: "left" as const,
  fontWeight: "normal" as const,
  letterSpacing: "0.06em",
  whiteSpace: "nowrap" as const,
  cursor: "pointer",
  userSelect: "none" as const,
};

const TH_RIGHT: CSSProperties = { ...TH, textAlign: "right" as const };

const TD: CSSProperties = {
  padding: "7px 10px",
  color: "#7ab8d0",
  borderBottom: "1px solid rgba(13,59,82,0.35)",
  whiteSpace: "nowrap" as const,
  verticalAlign: "middle" as const,
};

const TD_RIGHT: CSSProperties = { ...TD, textAlign: "right" as const };

const TD_DIM: CSSProperties = { ...TD, color: "#3a5a6a" };
const TD_BEST: CSSProperties = { ...TD_RIGHT, color: "#00ffa0", fontWeight: "bold" as const };

const FILTER_ROW: CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap" as const,
  alignItems: "center",
};

const SELECT: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.68rem",
  background: "rgba(13,59,82,0.3)",
  border: "1px solid #0d3b52",
  color: "#7ab8d0",
  borderRadius: 4,
  padding: "4px 8px",
  cursor: "pointer",
};

const FILTER_LABEL: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#2a6a9e",
  letterSpacing: "0.06em",
};

const EMPTY: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#2a6a9e",
  padding: "24px 0",
  textAlign: "center" as const,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PublicLeaderboardTable({
  entries,
  selectedId,
  onSelect,
}: PublicLeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("clear_success_rate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "provisional">("all");
  const [algoFilter, setAlgoFilter] = useState<string>("all");

  // Derive available algorithm families from data
  const algoFamilies = useMemo(
    () => ["all", ...Array.from(new Set(entries.map((e) => e.algorithm_family))).sort()],
    [entries]
  );

  // Split baselines vs community before filtering
  const baselines = useMemo(
    () => entries.filter(isBaseline),
    [entries]
  );
  const community = useMemo(
    () => entries.filter((e) => !isBaseline(e)),
    [entries]
  );

  // Apply filters + sort to baselines and community entries independently.
  // Baselines are included in filter results so status/algorithm selectors
  // have visible effect even when there are no community submissions yet.
  const applyFilters = (arr: LeaderboardEntry[]) => {
    let filtered = filterEntries(arr, { status: statusFilter });
    if (algoFilter !== "all") {
      filtered = filtered.filter((e) => e.algorithm_family === algoFilter);
    }
    return filtered;
  };

  const filteredBaselines = useMemo(
    () => sortEntries(applyFilters(baselines), sortKey, sortDir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baselines, statusFilter, algoFilter, sortKey, sortDir]
  );

  const filteredCommunity = useMemo(
    () => sortEntries(applyFilters(community), sortKey, sortDir),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [community, statusFilter, algoFilter, sortKey, sortDir]
  );

  // Best clear success rate across all entries (for highlight)
  const bestClear = useMemo(
    () => Math.max(...entries.map((e) => e.clear_success_rate ?? -1)),
    [entries]
  );
  const bestHeavy = useMemo(
    () => Math.max(...entries.map((e) => e.heavy_success_rate ?? -1)),
    [entries]
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (key !== sortKey) return " ↕";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  function renderRow(entry: LeaderboardEntry, rank: number, baseline = false) {
    const isSelected = entry.submission_id === selectedId;
    const color = entryColor(entry, rank);
    const clearBest = entry.clear_success_rate === bestClear && bestClear > -1;
    const heavyBest = entry.heavy_success_rate === bestHeavy && bestHeavy > -1;

    return (
      <tr
        key={entry.submission_id}
        onClick={() => onSelect?.(entry)}
        style={{
          cursor: onSelect ? "pointer" : "default",
          background: isSelected
            ? "rgba(0,255,160,0.06)"
            : baseline
            ? "rgba(255,204,68,0.03)"
            : "transparent",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLTableRowElement).style.background =
              "rgba(42,106,158,0.08)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            (e.currentTarget as HTMLTableRowElement).style.background =
              baseline ? "rgba(255,204,68,0.03)" : "transparent";
          }
        }}
      >
        {/* Rank */}
        <td style={TD_DIM}>{rank + 1}</td>

        {/* Name */}
        <td style={TD}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              marginRight: 8,
              flexShrink: 0,
              verticalAlign: "middle",
            }}
          />
          <span style={{ color: isSelected ? "#00ffa0" : color }}>
            {entry.display_name}
          </span>
          {baseline && (
            <span
              style={{
                marginLeft: 8,
                fontSize: "0.58rem",
                color: "#ffcc44",
                fontFamily: "monospace",
                letterSpacing: "0.04em",
              }}
            >
              ★ baseline
            </span>
          )}
        </td>

        {/* Team */}
        <td style={TD_DIM}>{entry.team_name}</td>

        {/* Status */}
        <td style={TD}>
          <StatusBadge status={entry.status} />
        </td>

        {/* Algorithm */}
        <td style={TD}>
          <AlgoBadge family={entry.algorithm_family} />
        </td>

        {/* Clear success */}
        <td style={clearBest ? TD_BEST : TD_RIGHT}>
          {pct(entry.clear_success_rate)}
        </td>

        {/* Heavy success */}
        <td style={heavyBest ? TD_BEST : TD_RIGHT}>
          {pct(entry.heavy_success_rate)}
        </td>

        {/* Date */}
        <td style={TD_DIM}>{entry.date_submitted ?? "—"}</td>

        {/* Action */}
        <td style={TD}>
          {onSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(entry); }}
              style={{
                fontFamily: "monospace",
                fontSize: "0.6rem",
                background: "rgba(13,59,82,0.4)",
                border: "1px solid #1a5a7a",
                color: "#4a8aaa",
                borderRadius: 3,
                padding: "2px 7px",
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              INSPECT
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div>
      {/* ── Filter controls ─────────────────────────────────────────────── */}
      <div style={FILTER_ROW}>
        <span style={FILTER_LABEL}>FILTER</span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...FILTER_LABEL, fontSize: "0.62rem" }}>STATUS</span>
          <select
            style={SELECT}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All</option>
            <option value="verified">Verified only</option>
            <option value="provisional">Provisional only</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...FILTER_LABEL, fontSize: "0.62rem" }}>ALGORITHM</span>
          <select
            style={SELECT}
            value={algoFilter}
            onChange={(e) => setAlgoFilter(e.target.value)}
          >
            {algoFamilies.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All algorithms" : f}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ ...FILTER_LABEL, fontSize: "0.62rem" }}>SORT</span>
          <select
            style={SELECT}
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="clear_success_rate:desc">Clear success ↓</option>
            <option value="clear_success_rate:asc">Clear success ↑</option>
            <option value="heavy_success_rate:desc">Heavy success ↓</option>
            <option value="heavy_success_rate:asc">Heavy success ↑</option>
            <option value="date_submitted:desc">Date (newest)</option>
            <option value="date_submitted:asc">Date (oldest)</option>
            <option value="display_name:asc">Name A–Z</option>
          </select>
        </div>
      </div>

      {/* ── Official Baselines ──────────────────────────────────────────── */}
      {baselines.length > 0 && (
        <>
          <div style={SECTION_TITLE}>Official Baselines</div>
          <table style={TABLE}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={TH}>Submission</th>
                <th style={TH}>Team</th>
                <th style={TH}>Status</th>
                <th style={TH}>Algorithm</th>
                <th style={TH_RIGHT} onClick={() => handleSort("clear_success_rate")}>
                  Clear{sortIndicator("clear_success_rate")}
                </th>
                <th style={TH_RIGHT} onClick={() => handleSort("heavy_success_rate")}>
                  Heavy{sortIndicator("heavy_success_rate")}
                </th>
                <th style={TH}>Date</th>
                <th style={TH} />
              </tr>
            </thead>
            <tbody>
              {filteredBaselines.length === 0 ? (
                <tr>
                  <td colSpan={9} style={EMPTY}>
                    No baselines match the current filters.
                  </td>
                </tr>
              ) : (
                filteredBaselines.map((e, i) => renderRow(e, i, true))
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ── Community entries ────────────────────────────────────────────── */}
      <div style={SECTION_TITLE}>Community Submissions</div>
      <table style={TABLE}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 32 }}>#</th>
            <th style={TH}>Submission</th>
            <th style={TH}>Team</th>
            <th style={TH}>Status</th>
            <th style={TH}>Algorithm</th>
            <th style={TH_RIGHT} onClick={() => handleSort("clear_success_rate")}>
              Clear{sortIndicator("clear_success_rate")}
            </th>
            <th style={TH_RIGHT} onClick={() => handleSort("heavy_success_rate")}>
              Heavy{sortIndicator("heavy_success_rate")}
            </th>
            <th style={TH} onClick={() => handleSort("date_submitted")}>
              Date{sortIndicator("date_submitted")}
            </th>
            <th style={TH} />
          </tr>
        </thead>
        <tbody>
          {filteredCommunity.length === 0 ? (
            <tr>
              <td colSpan={9} style={EMPTY}>
                No community submissions yet — be the first to submit!
              </td>
            </tr>
          ) : (
            filteredCommunity.map((e, i) => renderRow(e, i, false))
          )}
        </tbody>
      </table>
    </div>
  );
}
