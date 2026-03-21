"use client";

/**
 * ReplayArena — dynamic replay exploration component (Phase C)
 *
 * Loads the public leaderboard manifest to enumerate available submissions,
 * then lets the user:
 *   1. Select up to 2 submissions
 *   2. Choose degradation preset (from available published presets)
 *   3. Choose episode index (1 – n_episodes from summary)
 *   4. Load replays from /data/submissions/<id>/replays/<preset>/episode_NNNN.jsonl
 *   5. Play back via ComparisonScene with synchronized controls
 *
 * This component is NOT SSR-safe (uses R3F/WebGL). Wrap in DynamicReplayArena.
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

import type { LeaderboardEntry } from "@abyssal/replay-schema";
import type { ReplayFile } from "@abyssal/replay-schema";
import type { ComparisonAgent } from "./ComparisonScene";

import { loadLeaderboardManifest, entryColor, isBaseline } from "@/lib/leaderboardLoader";
import {
  loadSubmissionSummary,
  loadSubmissionReplay,
  availableEpisodeIndices,
  availablePresets,
  type SubmissionSummary,
} from "@/lib/submissionLoader";
import type { LoadResult } from "@/lib/benchmarkLoader";
import ReplayComparisonControls from "./ReplayComparisonControls";

// ─── Lazy-load ComparisonScene (WebGL — needs dynamic import) ─────────────────

const ComparisonScene = dynamic(() => import("./ComparisonScene"), {
  ssr: false,
  loading: () => (
    <div style={{ ...CANVAS_AREA, ...CANVAS_LOADING }}>
      INITIALISING RENDERER…
    </div>
  ),
});

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SELECTED = 2;

// ─── Styles ───────────────────────────────────────────────────────────────────

const ROOT: CSSProperties = {
  display: "flex",
  width: "100%",
  height: "100%",
  background: "#020a12",
  overflow: "hidden",
};

const SIDEBAR: CSSProperties = {
  width: 300,
  flexShrink: 0,
  borderRight: "1px solid #0d3b52",
  display: "flex",
  flexDirection: "column",
  overflowY: "auto" as const,
  background: "#020e18",
};

const SIDEBAR_SECTION: CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #0d3b52",
};

const SECTION_TITLE: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.62rem",
  letterSpacing: "0.1em",
  color: "#2a6a9e",
  textTransform: "uppercase" as const,
  marginBottom: 10,
};

const CANVAS_AREA: CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
};

const CANVAS_LOADING: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "monospace",
  fontSize: "0.7rem",
  color: "#2a6a9e",
  letterSpacing: "0.1em",
};

const SELECT: CSSProperties = {
  width: "100%",
  fontFamily: "monospace",
  fontSize: "0.68rem",
  background: "rgba(13,59,82,0.3)",
  border: "1px solid #0d3b52",
  color: "#7ab8d0",
  borderRadius: 4,
  padding: "5px 8px",
  cursor: "pointer",
  boxSizing: "border-box" as const,
};

const BTN: CSSProperties = {
  width: "100%",
  fontFamily: "monospace",
  fontSize: "0.7rem",
  letterSpacing: "0.06em",
  background: "rgba(0,255,160,0.10)",
  border: "1px solid #00ffa0",
  color: "#00ffa0",
  borderRadius: 4,
  padding: "8px 0",
  cursor: "pointer",
  marginTop: 10,
};

const BTN_DISABLED: CSSProperties = {
  ...BTN,
  background: "rgba(13,59,82,0.3)",
  border: "1px solid #0d3b52",
  color: "#2a6a9e",
  cursor: "not-allowed",
};

const AGENT_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 0",
  cursor: "pointer",
  borderBottom: "1px solid rgba(13,59,82,0.25)",
};

const FIELD_LABEL: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.62rem",
  color: "#2a6a9e",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const STATUS_TAG: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.57rem",
  padding: "1px 5px",
  borderRadius: 2,
};

const ERROR_BOX: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#ff9944",
  background: "rgba(255,80,0,0.08)",
  border: "1px solid rgba(255,80,0,0.2)",
  borderRadius: 4,
  padding: "8px 10px",
  marginTop: 8,
};

const INFO_BOX: CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.65rem",
  color: "#4a8aaa",
  padding: "8px 0",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSlot {
  entry: LeaderboardEntry;
  summary: SubmissionSummary | null;
  replay: ReplayFile | null;
  loading: boolean;
  error: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReplayArena() {
  const searchParams = useSearchParams();

  // ── Leaderboard state ─────────────────────────────────────────────────────
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestLoading, setManifestLoading] = useState(true);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState("clear");
  const [episodeIdx, setEpisodeIdx] = useState(1);

  // ── Per-slot data ──────────────────────────────────────────────────────────
  const [slots, setSlots] = useState<Record<string, AgentSlot>>({});

  // ── Playback state ─────────────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  const [playbackKey, setPlaybackKey] = useState(0);
  const [seekVersion, setSeekVersion] = useState(0);
  const [seekToStep, setSeekToStep] = useState(0);

  // Tracks whether a successful load has occurred — used to decide whether a
  // config change should trigger a reset.
  const hasLoadedRef = useRef(false);

  // ── Load manifest on mount ─────────────────────────────────────────────────
  useEffect(() => {
    loadLeaderboardManifest().then((result) => {
      setManifestLoading(false);
      if (result.success) {
        const visible = result.data.entries.filter((e) => e.status !== "rejected");
        setAllEntries(visible);
      } else {
        setManifestError(result.error);
      }
    });
  }, []);

  // ── Pre-select from URL params ────────────────────────────────────────────
  useEffect(() => {
    const agentsParam = searchParams.get("agents");
    const presetParam = searchParams.get("preset");
    const episodeParam = searchParams.get("episode");
    if (agentsParam) {
      const ids = agentsParam.split(",").slice(0, MAX_SELECTED);
      setSelectedIds(ids);
    }
    if (presetParam) setPreset(presetParam);
    if (episodeParam) setEpisodeIdx(parseInt(episodeParam, 10) || 1);
  }, [searchParams]);

  // ── Load summary for each selected entry ──────────────────────────────────
  useEffect(() => {
    selectedIds.forEach((id) => {
      const entry = allEntries.find((e) => e.submission_id === id);
      if (!entry) return;
      if (slots[id]?.summary !== undefined) return; // already loaded

      setSlots((prev) => ({
        ...prev,
        [id]: {
          entry,
          summary: null,
          replay: null,
          loading: true,
          error: null,
        },
      }));

      loadSubmissionSummary(entry.summary_path).then((result) => {
        setSlots((prev) => ({
          ...prev,
          [id]: {
            ...(prev[id] ?? { entry, replay: null }),
            summary: result.success ? result.data : null,
            loading: false,
            error: result.success ? null : result.error,
          },
        }));
      });
    });
  }, [selectedIds, allEntries]);

  // ── Reset playback when selection config changes ──────────────────────────
  // If the user changes preset, episode, or agent selection while a replay is
  // loaded, pause immediately, jump to step 0, and clear the stale trajectory
  // so the canvas doesn't keep showing old data. The user must click LOAD
  // REPLAYS again to see the new configuration.
  useEffect(() => {
    if (!hasLoadedRef.current) return; // nothing loaded yet — no reset needed
    setPlaying(false);
    setCurrentStep(0);
    setSeekVersion((v) => v + 1);
    setSeekToStep(0);
    setSlots((prev) => {
      const next: Record<string, AgentSlot> = {};
      for (const [id, slot] of Object.entries(prev)) {
        next[id] = { ...slot, replay: null };
      }
      return next;
    });
    hasLoadedRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, episodeIdx, selectedIds]);

  // ── Compute available presets and episodes ────────────────────────────────
  const firstSummary = selectedIds.length > 0 ? (slots[selectedIds[0]]?.summary ?? null) : null;
  const presets = useMemo(() => availablePresets(firstSummary), [firstSummary]);
  const episodeCount = firstSummary?.n_episodes ?? 5;
  const episodes = useMemo(() => availableEpisodeIndices(episodeCount), [episodeCount]);

  // ── Toggle agent selection ────────────────────────────────────────────────
  // Note: resetting playback on agent change is handled by the config-change
  // effect that watches selectedIds — no need to duplicate it here.
  function toggleAgent(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTED) return [...prev.slice(1), id];
      return [...prev, id];
    });
  }

  // ── Load replays ──────────────────────────────────────────────────────────
  async function loadReplays() {
    setPlaying(false);
    setCurrentStep(0);
    setSeekVersion((v) => v + 1);
    setSeekToStep(0);
    setPlaybackKey((k) => k + 1);
    hasLoadedRef.current = false;

    let anySuccess = false;

    for (const id of selectedIds) {
      const entry = allEntries.find((e) => e.submission_id === id);
      if (!entry) continue;

      setSlots((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? { entry, summary: null }),
          loading: true,
          error: null,
          replay: null,
        },
      }));

      const result = await loadSubmissionReplay(entry.replay_path, preset, episodeIdx);
      if (result.success) anySuccess = true;

      setSlots((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] ?? { entry, summary: null }),
          loading: false,
          replay: result.success ? result.data : null,
          error: result.success ? null : result.error,
        },
      }));
    }

    // Mark as loaded so future config changes know to reset.
    if (anySuccess) hasLoadedRef.current = true;
  }

  // ── Build comparison agents ───────────────────────────────────────────────
  const comparisonAgents: ComparisonAgent[] = useMemo(() => {
    return selectedIds
      .map((id, i) => {
        const slot = slots[id];
        if (!slot?.replay) return null;
        return {
          agentId: slot.entry.agent_id,
          replay: slot.replay,
          color: entryColor(slot.entry, i),
        };
      })
      .filter(Boolean) as ComparisonAgent[];
  }, [selectedIds, slots]);

  // ── Derive worldSeed from first loaded replay ─────────────────────────────
  const worldSeed = comparisonAgents[0]?.replay.header.worldSeed ?? 42;

  // ── Playback handlers ─────────────────────────────────────────────────────
  const handleRestart = useCallback(() => {
    setCurrentStep(0);
    setSeekVersion((v) => v + 1);
    setSeekToStep(0);
    setPlaying(true);
  }, []);

  const handleSeek = useCallback((step: number) => {
    setSeekVersion((v) => v + 1);
    setSeekToStep(step);
    setCurrentStep(step);
  }, []);

  const totalSteps = useMemo(
    () => Math.max(...comparisonAgents.map((a) => a.replay.steps.length), 1),
    [comparisonAgents]
  );

  const anyLoading = selectedIds.some((id) => slots[id]?.loading);
  const canLoad = selectedIds.length > 0 && !anyLoading;

  return (
    <div style={ROOT}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside style={SIDEBAR}>
        {/* Submission selector */}
        <div style={SIDEBAR_SECTION}>
          <div style={SECTION_TITLE}>Select Agents (max {MAX_SELECTED})</div>

          {manifestLoading && (
            <div style={INFO_BOX}>Loading submissions…</div>
          )}
          {manifestError && (
            <div style={ERROR_BOX}>
              Could not load leaderboard: {manifestError}
            </div>
          )}

          {allEntries.map((entry, i) => {
            const isSelected = selectedIds.includes(entry.submission_id);
            const color = entryColor(entry, i);
            const slot = slots[entry.submission_id];

            return (
              <div
                key={entry.submission_id}
                style={{
                  ...AGENT_ROW,
                  opacity: !isSelected && selectedIds.length >= MAX_SELECTED ? 0.4 : 1,
                  background: isSelected ? "rgba(0,255,160,0.05)" : "transparent",
                }}
                onClick={() => toggleAgent(entry.submission_id)}
              >
                {/* Checkbox */}
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: `1px solid ${isSelected ? color : "#1a4a6a"}`,
                    background: isSelected ? color : "transparent",
                    flexShrink: 0,
                  }}
                />

                {/* Color dot */}
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.68rem",
                      color: isSelected ? color : "#7ab8d0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {entry.display_name}
                    {isBaseline(entry) && (
                      <span style={{ marginLeft: 5, color: "#ffcc44", fontSize: "0.58rem" }}>★</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 2 }}>
                    <span
                      style={{
                        ...STATUS_TAG,
                        background:
                          entry.status === "verified"
                            ? "rgba(0,255,160,0.08)"
                            : "rgba(255,204,68,0.08)",
                        color:
                          entry.status === "verified" ? "#00ffa0" : "#ffcc44",
                        border: `1px solid ${entry.status === "verified" ? "#00ffa055" : "#ffcc4455"}`,
                      }}
                    >
                      {entry.status}
                    </span>
                    <span
                      style={{ ...STATUS_TAG, color: "#4a8aaa", background: "rgba(42,106,158,0.1)", border: "1px solid #0d3b52" }}
                    >
                      {entry.algorithm_family}
                    </span>
                  </div>
                </div>

                {/* Replay status */}
                {slot && (
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.58rem",
                      color: slot.error ? "#ff6060" : slot.replay ? "#00ffa0" : "#4a8aaa",
                      flexShrink: 0,
                    }}
                  >
                    {slot.loading ? "…" : slot.error ? "ERR" : slot.replay ? "✓" : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Preset + episode controls */}
        <div style={SIDEBAR_SECTION}>
          <div style={SECTION_TITLE}>Conditions</div>

          <div style={{ marginBottom: 10 }}>
            <div style={FIELD_LABEL}>DEGRADATION PRESET</div>
            <select
              style={SELECT}
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {presets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={FIELD_LABEL}>EPISODE INDEX (1–{episodeCount})</div>
            <select
              style={SELECT}
              value={episodeIdx}
              onChange={(e) => setEpisodeIdx(parseInt(e.target.value, 10))}
            >
              {episodes.map((n) => (
                <option key={n} value={n}>
                  episode {String(n).padStart(4, "0")}
                </option>
              ))}
            </select>
          </div>

          <button
            style={canLoad ? BTN : BTN_DISABLED}
            disabled={!canLoad}
            onClick={loadReplays}
          >
            {anyLoading ? "LOADING…" : "▶ LOAD REPLAYS"}
          </button>

          {/* Per-slot errors */}
          {selectedIds.map((id) => {
            const slot = slots[id];
            if (!slot?.error) return null;
            return (
              <div key={id} style={ERROR_BOX}>
                <strong>{slot.entry.display_name}:</strong> {slot.error}
              </div>
            );
          })}
        </div>

        {/* Selected agent metrics summary */}
        {selectedIds.some((id) => slots[id]?.summary) && (
          <div style={SIDEBAR_SECTION}>
            <div style={SECTION_TITLE}>Agent Metrics</div>
            {selectedIds.map((id) => {
              const slot = slots[id];
              if (!slot?.summary) return null;
              const m = slot.summary.presets[preset];
              const color = entryColor(slot.entry, selectedIds.indexOf(id));
              return (
                <div key={id} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.65rem",
                      color,
                      marginBottom: 4,
                    }}
                  >
                    {slot.entry.display_name}
                  </div>
                  {m ? (
                    <div
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.62rem",
                        color: "#4a8aaa",
                        lineHeight: 1.7,
                      }}
                    >
                      succ {(m.success_rate * 100).toFixed(0)}% · coll {(m.collision_rate * 100).toFixed(0)}% · rew {m.mean_reward.toFixed(1)}
                    </div>
                  ) : (
                    <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color: "#2a6a9e" }}>
                      no {preset} metrics
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Footer hint */}
        <div
          style={{
            padding: "10px 16px",
            fontFamily: "monospace",
            fontSize: "0.6rem",
            color: "#1a4a6a",
            borderTop: "1px solid #0d3b52",
            lineHeight: 1.6,
          }}
        >
          Select up to {MAX_SELECTED} agents, choose preset and episode, then
          click LOAD REPLAYS to compare trajectories.
        </div>
      </aside>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div
        style={{
          ...CANVAS_AREA,
          // Mirror the same CSS-filter fog used by MultiReplayViewer on the
          // homepage — heavy turbidity dims, desaturates, and softly blurs
          // the canvas to reflect the perception conditions agents operate under.
          filter:
            preset === "heavy"
              ? "brightness(0.78) saturate(0.60) blur(0.3px)"
              : preset === "mild"
              ? "brightness(0.90) saturate(0.80)"
              : "none",
        }}
      >
        {comparisonAgents.length > 0 ? (
          <>
            <ComparisonScene
              worldSeed={worldSeed}
              agents={comparisonAgents}
              playing={playing}
              speed={speed}
              playbackKey={playbackKey}
              seekVersion={seekVersion}
              seekToStep={seekToStep}
              onStepChange={setCurrentStep}
            />
            <ReplayComparisonControls
              playing={playing}
              speed={speed}
              currentStep={currentStep}
              totalSteps={totalSteps}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onRestart={handleRestart}
              onSpeedChange={setSpeed}
              onSeek={handleSeek}
            />
          </>
        ) : (
          <div style={{ ...CANVAS_AREA, ...CANVAS_LOADING }}>
            <div style={{ textAlign: "center" as const }}>
              <div style={{ color: "#2a6a9e", fontSize: "0.75rem", letterSpacing: "0.12em" }}>
                REPLAY ARENA
              </div>
              <div style={{ color: "#1a3a52", fontSize: "0.65rem", marginTop: 12, maxWidth: 320, lineHeight: 1.8 }}>
                Select one or two agents from the sidebar,
                choose a degradation preset and episode, then
                click LOAD REPLAYS to begin playback.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
