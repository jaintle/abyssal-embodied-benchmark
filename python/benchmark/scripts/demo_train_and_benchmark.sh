#!/usr/bin/env bash
# demo_train_and_benchmark.sh
#
# End-to-end demo: train both baselines, run multi-agent multi-preset benchmark,
# export one replay per agent.
#
# Usage (from python/benchmark/ OR repo root, or any directory):
#   bash python/benchmark/scripts/demo_train_and_benchmark.sh
#   # — or —
#   cd python/benchmark && bash scripts/demo_train_and_benchmark.sh
#
# Optional env vars:
#   WORLD_SEED     (default: 42)
#   N_EPISODES     (default: 20)
#   PPO_STEPS      (default: 50000)
#   CAUTIOUS_STEPS (default: 200000)
#   RUN_NAME       (default: demo-<timestamp>)

set -euo pipefail

# ─── Resolve paths ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"   # python/benchmark/
REPO_ROOT="$(cd "${BENCHMARK_DIR}/../.." && pwd)"  # repo root

# run_benchmark.py writes to <repo_root>/results/leaderboard/
RESULTS_DIR="${REPO_ROOT}/results/leaderboard"
RUNS_DIR="${REPO_ROOT}/results/runs"

# ─── Configuration ────────────────────────────────────────────────────────────

WORLD_SEED="${WORLD_SEED:-42}"
N_EPISODES="${N_EPISODES:-20}"
PPO_STEPS="${PPO_STEPS:-50000}"
CAUTIOUS_STEPS="${CAUTIOUS_STEPS:-200000}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_NAME="${RUN_NAME:-demo-${TIMESTAMP}}"

REPLAY_SEED=1338301409

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       abyssal-embodied-benchmark  ·  Phase 9 Demo           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  world_seed    : ${WORLD_SEED}"
echo "║  n_episodes    : ${N_EPISODES}"
echo "║  ppo_steps     : ${PPO_STEPS}"
echo "║  cautious_steps: ${CAUTIOUS_STEPS}"
echo "║  run_name      : ${RUN_NAME}"
echo "║  results_dir   : ${RESULTS_DIR}"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Smoke-test environment ───────────────────────────────────────────

echo "[ 1/5 ]  Smoke-testing environment..."
cd "${BENCHMARK_DIR}"
python scripts/smoke_env.py
echo "         ✓ environment OK"
echo ""

# ─── Step 2: Train standard PPO baseline ─────────────────────────────────────

PPO_CHECKPOINT="${RUNS_DIR}/${RUN_NAME}-ppo/model.zip"

echo "[ 2/5 ]  Training standard PPO baseline (${PPO_STEPS} steps)..."
python scripts/train_ppo.py \
    --world-seed "${WORLD_SEED}" \
    --total-steps "${PPO_STEPS}" \
    --run-name "${RUN_NAME}-ppo"
echo "         ✓ PPO checkpoint: ${PPO_CHECKPOINT}"
echo ""

# ─── Step 3: Train cautious PPO baseline ─────────────────────────────────────

CAUTIOUS_CHECKPOINT="${RUNS_DIR}/${RUN_NAME}-cautious/model.zip"

echo "[ 3/5 ]  Training cautious PPO baseline (${CAUTIOUS_STEPS} steps, caution_coeff=0.3)..."
python scripts/train_cautious_ppo.py \
    --world-seed "${WORLD_SEED}" \
    --total-steps "${CAUTIOUS_STEPS}" \
    --caution-coeff 0.3 \
    --run-name "${RUN_NAME}-cautious"
echo "         ✓ Cautious PPO checkpoint: ${CAUTIOUS_CHECKPOINT}"
echo ""

# ─── Step 4: Run multi-agent multi-preset benchmark ──────────────────────────

LEADERBOARD_DIR="${RESULTS_DIR}/${RUN_NAME}"

echo "[ 4/5 ]  Running benchmark (heuristic + ppo + cautious_ppo + random,"
echo "         presets: clear + heavy, ${N_EPISODES} episodes each)..."
python scripts/run_benchmark.py \
    --agents heuristic \
            "ppo:${PPO_CHECKPOINT}" \
            "cautious_ppo:${CAUTIOUS_CHECKPOINT}" \
            random \
    --world-seed "${WORLD_SEED}" \
    --n-episodes "${N_EPISODES}" \
    --degradation-presets clear heavy \
    --export-replay-seed "${REPLAY_SEED}" \
    --run-name "${RUN_NAME}"
echo "         ✓ Leaderboard bundle: ${LEADERBOARD_DIR}/"
echo ""

# ─── Step 5: Print summary ────────────────────────────────────────────────────

echo "[ 5/5 ]  Results summary:"
echo ""

python3 - <<PYEOF
import json, pathlib, sys

bundle = pathlib.Path("${LEADERBOARD_DIR}")
presets = ["clear", "heavy"]

for preset in presets:
    summary_path = bundle / preset / "aggregate_summary.json"
    if not summary_path.exists():
        continue
    rows = json.loads(summary_path.read_text())
    print(f"  Preset: {preset}")
    print(f"  {'Agent':<16} {'succ%':>6} {'coll%':>6} {'tout%':>6} {'reward':>8} {'speed':>7}")
    print(f"  {'-'*55}")
    for r in sorted(rows, key=lambda x: -x.get('success_rate', 0)):
        agent   = r['agent_id']
        succ    = f"{r['success_rate']*100:.0f}%"
        coll    = f"{r['collision_rate']*100:.0f}%"
        tout    = f"{r['timeout_rate']*100:.0f}%"
        reward  = f"{r['mean_reward']:+.2f}"
        speed   = f"{r.get('mean_action_magnitude', 0):.2f}" if r.get('mean_action_magnitude') else "  —"
        print(f"  {agent:<16} {succ:>6} {coll:>6} {tout:>6} {reward:>8} {speed:>7}")
    print()
PYEOF

# ─── Done ─────────────────────────────────────────────────────────────────────

echo "══════════════════════════════════════════════════════════════"
echo "  Demo complete."
echo ""
echo "  Artifacts:"
echo "    ${LEADERBOARD_DIR}/"
echo ""
echo "  To update the web viewer with these artifacts:"
echo "    bash ${SCRIPT_DIR}/demo_web_artifacts.sh ${RUN_NAME}"
echo "══════════════════════════════════════════════════════════════"
echo ""
