#!/usr/bin/env bash
# demo_web_artifacts.sh
#
# Copy a benchmark leaderboard bundle into the Next.js public folder so the
# web viewer serves the fresh artifacts without a backend.
#
# Usage (from python/benchmark/ OR repo root, or any directory):
#   bash python/benchmark/scripts/demo_web_artifacts.sh <run-name>
#   # — or —
#   cd python/benchmark && bash scripts/demo_web_artifacts.sh <run-name>
#
#   <run-name>  The run-name passed to run_benchmark.py.
#               Leaderboard bundles live at: <repo-root>/results/leaderboard/<run-name>/
#
# Example:
#   bash scripts/demo_web_artifacts.sh demo-20260315-120000
#
# After running, start the web app:
#   cd <repo-root>/apps/web && npm run dev
#   open http://localhost:3000

set -euo pipefail

# ─── Args ─────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
    echo "Usage: bash scripts/demo_web_artifacts.sh <run-name>"
    echo ""
    echo "  <run-name>  Subdirectory under <repo-root>/results/leaderboard/"
    exit 1
fi

RUN_NAME="$1"

# ─── Resolve paths ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCHMARK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"   # python/benchmark/
REPO_ROOT="$(cd "${BENCHMARK_DIR}/../.." && pwd)"  # repo root

BUNDLE="${REPO_ROOT}/results/leaderboard/${RUN_NAME}"
WEB_PUBLIC="${REPO_ROOT}/apps/web/public/benchmark"

# ─── Validate bundle ──────────────────────────────────────────────────────────

echo ""
echo "[ demo_web_artifacts ]  run_name: ${RUN_NAME}"
echo "  bundle:     ${BUNDLE}"
echo "  web public: ${WEB_PUBLIC}"
echo ""

if [[ ! -d "${BUNDLE}" ]]; then
    echo "ERROR: Bundle not found: ${BUNDLE}"
    echo "       Run demo_train_and_benchmark.sh first, or pass the correct run-name."
    echo ""
    echo "  Available bundles:"
    ls "${REPO_ROOT}/results/leaderboard/" 2>/dev/null | sed 's/^/    /' || echo "    (none yet)"
    exit 1
fi

REQUIRED_PRESETS=("clear" "heavy")
MISSING=0

for preset in "${REQUIRED_PRESETS[@]}"; do
    dir="${BUNDLE}/${preset}"
    if [[ ! -f "${dir}/aggregate_summary.json" ]]; then
        echo "WARNING: Missing ${preset}/aggregate_summary.json — preset skipped"
        MISSING=$((MISSING + 1))
    fi
done

if [[ ! -f "${BUNDLE}/robustness_summary.json" ]]; then
    echo "WARNING: Missing robustness_summary.json"
fi

if [[ "${MISSING}" -ge "${#REQUIRED_PRESETS[@]}" ]]; then
    echo "ERROR: No valid preset directories found in ${BUNDLE}/"
    exit 1
fi

echo "  Bundle validated: OK"
echo ""

# ─── Copy artifacts ───────────────────────────────────────────────────────────

echo "[ 1/3 ]  Copying per-preset artifacts..."

for preset in "${REQUIRED_PRESETS[@]}"; do
    src="${BUNDLE}/${preset}"
    dst="${WEB_PUBLIC}/${preset}"
    if [[ -d "${src}" ]]; then
        mkdir -p "${dst}"
        cp -r "${src}/." "${dst}/"
        echo "         ✓ ${preset}/ → apps/web/public/benchmark/${preset}/"
    fi
done

echo ""
echo "[ 2/3 ]  Copying robustness summary..."

if [[ -f "${BUNDLE}/robustness_summary.json" ]]; then
    cp "${BUNDLE}/robustness_summary.json" "${WEB_PUBLIC}/robustness_summary.json"
    echo "         ✓ robustness_summary.json → apps/web/public/benchmark/robustness_summary.json"
fi

if [[ -f "${BUNDLE}/robustness_summary.csv" ]]; then
    cp "${BUNDLE}/robustness_summary.csv" "${WEB_PUBLIC}/robustness_summary.csv"
fi

echo ""
echo "[ 3/3 ]  Verifying web artifact layout..."

EXPECTED_FILES=(
    "clear/benchmark_config.json"
    "clear/aggregate_summary.json"
    "heavy/benchmark_config.json"
    "heavy/aggregate_summary.json"
    "robustness_summary.json"
)

ALL_OK=1
for f in "${EXPECTED_FILES[@]}"; do
    if [[ -f "${WEB_PUBLIC}/${f}" ]]; then
        echo "         ✓ public/benchmark/${f}"
    else
        echo "         ✗ MISSING: public/benchmark/${f}"
        ALL_OK=0
    fi
done

echo ""

if [[ "${ALL_OK}" -eq 1 ]]; then
    echo "══════════════════════════════════════════════════════════════"
    echo "  Web artifacts updated from run: ${RUN_NAME}"
    echo ""
    echo "  Start the viewer:"
    echo "    cd ${REPO_ROOT}/apps/web && npm run dev"
    echo "    open http://localhost:3000"
    echo "══════════════════════════════════════════════════════════════"
else
    echo "WARNING: Some expected files are missing — the viewer may show"
    echo "         partial results.  Check the bundle in ${BUNDLE}/"
fi
echo ""
