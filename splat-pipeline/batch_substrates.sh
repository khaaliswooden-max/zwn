#!/usr/bin/env bash
# batch_substrates.sh — bake one .ksplat per substrate backdrop.
#
# Runs video_to_splat.sh sequentially for each (substrate, source-video) pair
# defined below. Each run takes 10–25 min (COLMAP + 7k-iter nerfstudio), so
# this script is intentionally serial — parallelising would OOM most GPUs.
#
# Usage:
#   bash batch_substrates.sh [--dry-run] [video_dir]
#
# Arguments:
#   --dry-run    Echo what would run; don't invoke the pipeline
#   video_dir    Root of input MP4s. Defaults to ../ltx-service/outputs/
#
# Expected inputs:
#   ${VIDEO_DIR}/<substrate>.mp4   one video per substrate name below
#
# Outputs:
#   ../frontend/public/splats/<substrate>.ksplat

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN=0

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
  shift
fi

VIDEO_DIR="${1:-${SCRIPT_DIR}/../ltx-service/outputs}"

# Substrate → scene prompt name. Keep in sync with ltx-service/prompts.py
# and frontend/components/SceneGallery.tsx.
SUBSTRATES=(
  "compliance-domain"      # civium
  "procurement-lattice"    # aureon
  "causal-flow"            # cross-substrate
  "biological-field"       # symbion
  "world-nebula"           # default / world actor
)

echo "=== ZWM Splat Pipeline: batch substrate bake ==="
echo "  Video dir: ${VIDEO_DIR}"
echo "  Substrates: ${#SUBSTRATES[@]}"
echo "  Dry run:   $([ $DRY_RUN -eq 1 ] && echo yes || echo no)"
echo ""

FAIL_COUNT=0
SUCCESS_COUNT=0
SKIP_COUNT=0

for SCENE in "${SUBSTRATES[@]}"; do
  VIDEO="${VIDEO_DIR}/${SCENE}.mp4"
  echo "──────────────────────────────────────────────────────────────────"
  echo "  Substrate: ${SCENE}"
  echo "  Source:    ${VIDEO}"

  if [ ! -f "${VIDEO}" ]; then
    echo "  SKIP — source video not found."
    echo "         Run: ltx-service /generate scene=${SCENE} first,"
    echo "         then copy the mp4 to ${VIDEO}"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    continue
  fi

  if [ $DRY_RUN -eq 1 ]; then
    echo "  DRY RUN — would invoke:"
    echo "    bash ${SCRIPT_DIR}/video_to_splat.sh ${VIDEO} ${SCENE}"
    continue
  fi

  if bash "${SCRIPT_DIR}/video_to_splat.sh" "${VIDEO}" "${SCENE}"; then
    echo "  ✓ ${SCENE} baked"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "  ✗ ${SCENE} FAILED (continuing to next)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo "=== Batch complete ==="
echo "  Success: ${SUCCESS_COUNT}"
echo "  Skipped: ${SKIP_COUNT}"
echo "  Failed:  ${FAIL_COUNT}"

# Non-zero exit if any substrate failed, so CI can flag the run.
[ $FAIL_COUNT -eq 0 ]
