#!/usr/bin/env bash
# smoke_end_to_end.sh — Phase 9: fast end-to-end pipeline smoke test
#
# Goal: verify the full pipeline (train → benchmark → web artifacts) runs
#       cleanly on a laptop in < 5 minutes.  Quality is deliberately low
#       (8 000 PPO steps, 5 episodes) — use demo_train_and_benchmark.sh for
#       publishable results.
#
# Usage (from repo root or python/benchmark):
#   bash python/benchmark/scripts/smoke_end_to_end.sh
#
# Optional env vars:
#   WORLD_SEED      (default: 42)
#   PPO_STEPS       (default: 8000)   — small enough to finish in < 2 min on CPU
#   N_EPISODES      (default: 5)
#   RUN_NAME        (default: smoke-<timestamp>)
#   SKIP_TRAIN      (default: 0)  — set 1 to skip training (reuse existing models)
#   PPO_MODEL       (path)        — pre-trained PPO model; required when SKIP_TRAIN=1
#   CAUTIOUS_MODEL  (path)        — pre-trained cautious_ppo model (41-dim obs).
#                                   When SKIP_TRAIN=1 and not set, auto-detected by
#                                   replacing "-ppo/model.zip" → "-cautious/model.zip"
#                                   in PPO_MODEL.  Silently omitted if not found.
#   NO_WEB_COPY     (default: 0)  — set 1 to skip copying artifacts to public/
#
# Exit codes:
#   0 — all steps passed
#   1 — a step failed (see FAILED STEPS in the summary)

set -euo pipefail

# ─── Resolve paths ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"  # python/benchmark/
REPO_ROOT="$(cd "${BENCHMARK_DIR}/../.." && pwd)" # repo root

RESULTS_DIR="${REPO_ROOT}/results/leaderboard"
RUNS_DIR="${REPO_ROOT}/results/runs"
WEB_BENCHMARK="${REPO_ROOT}/apps/web/public/benchmark"

# ─── Configuration ────────────────────────────────────────────────────────────

WORLD_SEED="${WORLD_SEED:-42}"
PPO_STEPS="${PPO_STEPS:-8000}"
N_EPISODES="${N_EPISODES:-5}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_NAME="${RUN_NAME:-smoke-${TIMESTAMP}}"
SKIP_TRAIN="${SKIP_TRAIN:-0}"
PPO_MODEL="${PPO_MODEL:-}"
CAUTIOUS_MODEL="${CAUTIOUS_MODEL:-}"
NO_WEB_COPY="${NO_WEB_COPY:-0}"
REPLAY_SEED=1338301409

# Derived paths
PPO_CHECKPOINT="${RUNS_DIR}/${RUN_NAME}-ppo/model.zip"
LEADERBOARD_DIR="${RESULTS_DIR}/${RUN_NAME}"

# Track per-step pass/fail
STEPS_PASSED=()
STEPS_FAILED=()

# ─── Helpers ─────────────────────────────────────────────────────────────────

step_pass() { STEPS_PASSED+=("$1"); echo "         ✓ $1"; }
step_fail() { STEPS_FAILED+=("$1"); echo "         ✗ $1"; }

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     abyssal-embodied-benchmark  ·  Smoke End-to-End         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf  "║  world_seed   : %-44s║\n" "${WORLD_SEED}"
printf  "║  ppo_steps    : %-44s║\n" "${PPO_STEPS}"
printf  "║  n_episodes   : %-44s║\n" "${N_EPISODES}"
printf  "║  run_name     : %-44s║\n" "${RUN_NAME}"
printf  "║  skip_train   : %-44s║\n" "${SKIP_TRAIN}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

cd "${BENCHMARK_DIR}"

# ─── Step 0: Environment smoke test ───────────────────────────────────────────

echo "[ 0/5 ]  Smoke-testing Gymnasium environment..."
if python scripts/smoke_env.py; then
    step_pass "env smoke"
else
    step_fail "env smoke"
    echo "         FATAL — environment failed to load.  Aborting."
    exit 1
fi
echo ""

# ─── Step 1: Train PPO (or reuse existing checkpoint) ─────────────────────────

if [[ "${SKIP_TRAIN}" == "1" ]]; then
    echo "[ 1/5 ]  SKIP_TRAIN=1 — skipping PPO training."
    if [[ -n "${PPO_MODEL}" ]]; then
        PPO_CHECKPOINT="${PPO_MODEL}"
        echo "         Using PPO model    : ${PPO_CHECKPOINT}"
    fi
    if [[ ! -f "${PPO_CHECKPOINT}" ]]; then
        step_fail "ppo training"
        echo "         FATAL — PPO_MODEL not found: ${PPO_CHECKPOINT}"
        exit 1
    fi

    # Auto-detect cautious model if not explicitly set.
    # Convention: cautious checkpoint lives alongside ppo, with -ppo/ → -cautious/.
    if [[ -z "${CAUTIOUS_MODEL}" && -n "${PPO_MODEL}" ]]; then
        CAUTIOUS_MODEL="${PPO_MODEL/-ppo\/model.zip/-cautious\/model.zip}"
    fi
    if [[ -f "${CAUTIOUS_MODEL}" ]]; then
        echo "         Using cautious model: ${CAUTIOUS_MODEL}"
    else
        echo "         Cautious model not found — cautious_ppo will be skipped."
        CAUTIOUS_MODEL=""
    fi

    step_pass "ppo checkpoint (skipped training)"
else
    echo "[ 1/5 ]  Training PPO baseline (${PPO_STEPS} steps)..."
    if python scripts/train_ppo.py \
            --world-seed "${WORLD_SEED}" \
            --total-steps "${PPO_STEPS}" \
            --run-name "${RUN_NAME}-ppo"; then
        step_pass "ppo training"
    else
        step_fail "ppo training"
        echo "         Continuing with remaining steps..."
    fi
fi
echo ""

# ─── Step 2: Run benchmark (all 4 agents, clear + heavy) ─────────────────────

echo "[ 2/5 ]  Running benchmark..."
echo "         agents    : heuristic, ppo, cautious_ppo, random"
echo "         presets   : clear heavy"
echo "         n_episodes: ${N_EPISODES}"
echo ""

# Build agent list.
# - ppo uses the standard 40-dim checkpoint
# - cautious_ppo needs a separately trained 41-dim checkpoint (uncertainty_obs=True)
AGENTS=("heuristic")
if [[ -f "${PPO_CHECKPOINT}" ]]; then
    AGENTS+=("ppo:${PPO_CHECKPOINT}")
fi
if [[ -n "${CAUTIOUS_MODEL}" && -f "${CAUTIOUS_MODEL}" ]]; then
    AGENTS+=("cautious_ppo:${CAUTIOUS_MODEL}")
fi
AGENTS+=("random")

if python scripts/run_benchmark.py \
        --agents "${AGENTS[@]}" \
        --world-seed "${WORLD_SEED}" \
        --n-episodes "${N_EPISODES}" \
        --degradation-presets clear heavy \
        --export-replay-seed "${REPLAY_SEED}" \
        --run-name "${RUN_NAME}"; then
    step_pass "benchmark run"
else
    step_fail "benchmark run"
fi
echo ""

# ─── Step 3: Validate artifacts ───────────────────────────────────────────────

echo "[ 3/5 ]  Validating artifacts..."

_check_file() {
    local path="$1"
    local label="$2"
    if [[ -f "${path}" ]]; then
        step_pass "${label}"
    else
        step_fail "${label} (missing: ${path})"
    fi
}

_check_file "${LEADERBOARD_DIR}/clear/aggregate_summary.json"  "clear/aggregate_summary.json"
_check_file "${LEADERBOARD_DIR}/heavy/aggregate_summary.json"  "heavy/aggregate_summary.json"
_check_file "${LEADERBOARD_DIR}/robustness_summary.json"       "robustness_summary.json"
_check_file "${LEADERBOARD_DIR}/clear/replays/replay_heuristic_seed_${REPLAY_SEED}.jsonl"    "clear/replay_heuristic"
_check_file "${LEADERBOARD_DIR}/heavy/replays/replay_heuristic_seed_${REPLAY_SEED}.jsonl"    "heavy/replay_heuristic"
if [[ -f "${PPO_CHECKPOINT}" ]]; then
    _check_file "${LEADERBOARD_DIR}/clear/replays/replay_ppo_seed_${REPLAY_SEED}.jsonl" "clear/replay_ppo"
    _check_file "${LEADERBOARD_DIR}/heavy/replays/replay_ppo_seed_${REPLAY_SEED}.jsonl" "heavy/replay_ppo"
fi
if [[ -n "${CAUTIOUS_MODEL}" && -f "${CAUTIOUS_MODEL}" ]]; then
    _check_file "${LEADERBOARD_DIR}/clear/replays/replay_cautious_ppo_seed_${REPLAY_SEED}.jsonl" "clear/replay_cautious_ppo"
    _check_file "${LEADERBOARD_DIR}/heavy/replays/replay_cautious_ppo_seed_${REPLAY_SEED}.jsonl" "heavy/replay_cautious_ppo"
fi
echo ""

# ─── Step 4: Copy to web public/ ─────────────────────────────────────────────

if [[ "${NO_WEB_COPY}" != "1" ]]; then
    echo "[ 4/5 ]  Copying artifacts to web public/..."
    if bash "${SCRIPT_DIR}/demo_web_artifacts.sh" "${RUN_NAME}"; then
        step_pass "web artifact copy"
    else
        step_fail "web artifact copy"
    fi
else
    echo "[ 4/5 ]  NO_WEB_COPY=1 — skipping web copy."
fi
echo ""

# ─── Step 5: Print results summary ────────────────────────────────────────────

echo "[ 5/5 ]  Results summary:"
echo ""

python3 - <<PYEOF
import json, pathlib

bundle = pathlib.Path("${LEADERBOARD_DIR}")
presets = ["clear", "heavy"]

for preset in presets:
    summary_path = bundle / preset / "aggregate_summary.json"
    if not summary_path.exists():
        print(f"  [{preset}]  no aggregate_summary.json")
        continue
    rows = json.loads(summary_path.read_text())
    print(f"  Preset: {preset}")
    print(f"  {'Agent':<16} {'succ%':>6} {'coll%':>6} {'tout%':>6} {'reward':>9}")
    print(f"  {'-'*50}")
    for r in sorted(rows, key=lambda x: -x.get('success_rate', 0)):
        agent  = r['agent_id']
        succ   = f"{r['success_rate']*100:.0f}%"
        coll   = f"{r['collision_rate']*100:.0f}%"
        tout   = f"{r['timeout_rate']*100:.0f}%"
        reward = f"{r['mean_reward']:+.2f}"
        print(f"  {agent:<16} {succ:>6} {coll:>6} {tout:>6} {reward:>9}")
    print()
PYEOF

# ─── Final pass/fail summary ──────────────────────────────────────────────────

echo "══════════════════════════════════════════════════════════════"
echo "  Smoke test complete."
echo ""

if [[ ${#STEPS_PASSED[@]} -gt 0 ]]; then
    echo "  PASSED (${#STEPS_PASSED[@]}):"
    for s in "${STEPS_PASSED[@]}"; do
        echo "    ✓  ${s}"
    done
fi

if [[ ${#STEPS_FAILED[@]} -gt 0 ]]; then
    echo ""
    echo "  FAILED (${#STEPS_FAILED[@]}):"
    for s in "${STEPS_FAILED[@]}"; do
        echo "    ✗  ${s}"
    done
    echo ""
    echo "  Exit status: FAIL"
    echo "══════════════════════════════════════════════════════════════"
    exit 1
else
    echo ""
    echo "  Artifacts: ${LEADERBOARD_DIR}/"
    if [[ "${NO_WEB_COPY}" != "1" ]]; then
        echo "  Web view : ${WEB_BENCHMARK}/"
    fi
    echo ""
    echo "  Exit status: PASS"
    echo "══════════════════════════════════════════════════════════════"
fi
