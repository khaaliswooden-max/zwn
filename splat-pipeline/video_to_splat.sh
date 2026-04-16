#!/usr/bin/env bash
# video_to_splat.sh — Convert an LTX-Video MP4 into a browser-ready .ksplat file
#
# Usage:
#   bash video_to_splat.sh <video_path> <scene_name> [fps]
#
# Arguments:
#   video_path   Path to input MP4 file (from ltx-service/outputs/)
#   scene_name   Output name, e.g. "world-nebula" → produces world-nebula.ksplat
#   fps          Frame extraction rate (default: 2 — gives 20-40 frames for 10-20s video)
#
# Prerequisites:
#   ffmpeg, colmap, python3 with nerfstudio installed
#   Run: pip install -r requirements.txt
#   See: README.md for full setup
#
# Output:
#   ../frontend/public/splats/<scene_name>.ksplat

set -euo pipefail

VIDEO="${1:?Usage: $0 <video_path> <scene_name> [fps]}"
SCENE="${2:?Usage: $0 <video_path> <scene_name> [fps]}"
FPS="${3:-2}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${SCRIPT_DIR}/work/${SCENE}"
FRONTEND_SPLATS="${SCRIPT_DIR}/../frontend/public/splats"
OUTPUT_KSPLAT="${FRONTEND_SPLATS}/${SCENE}.ksplat"

echo "=== ZWM Splat Pipeline: ${SCENE} ==="
echo "  Input:  ${VIDEO}"
echo "  Output: ${OUTPUT_KSPLAT}"
echo "  FPS:    ${FPS}"
echo ""

# Create working directories
mkdir -p "${WORK_DIR}/frames" "${WORK_DIR}/colmap_out" "${WORK_DIR}/ns_data" "${FRONTEND_SPLATS}"

# ── Step 1: Extract frames ────────────────────────────────────────────────────
echo "[1/5] Extracting frames at ${FPS} FPS..."
ffmpeg -i "${VIDEO}" \
  -vf "fps=${FPS},scale=1280:720" \
  -q:v 2 \
  "${WORK_DIR}/frames/%04d.jpg" \
  -y -loglevel warning
FRAME_COUNT=$(ls "${WORK_DIR}/frames/" | wc -l)
echo "      Extracted ${FRAME_COUNT} frames"

if [ "${FRAME_COUNT}" -lt 10 ]; then
  echo "ERROR: Too few frames (${FRAME_COUNT}). Need at least 10 for reliable SfM."
  echo "       Try increasing FPS or check video duration."
  exit 1
fi

# ── Step 2: COLMAP Structure-from-Motion ─────────────────────────────────────
echo "[2/5] Running COLMAP SfM (this takes 1-5 minutes)..."
colmap automatic_reconstructor \
  --workspace_path "${WORK_DIR}/colmap_out" \
  --image_path "${WORK_DIR}/frames" \
  --quality low \
  --single_camera 1 \
  --dense 0 2>/dev/null || {
    echo "WARNING: COLMAP failed with 'low' quality. Retrying with 'medium'..."
    colmap automatic_reconstructor \
      --workspace_path "${WORK_DIR}/colmap_out" \
      --image_path "${WORK_DIR}/frames" \
      --quality medium \
      --single_camera 1 \
      --dense 0 2>/dev/null
  }

if [ ! -d "${WORK_DIR}/colmap_out/sparse/0" ]; then
  echo "ERROR: COLMAP produced no sparse reconstruction."
  echo "       LTX-Video's stylized content may not have enough feature matches."
  echo "       Try: (1) increasing --fps to get more frames, or"
  echo "            (2) using DUSt3R instead (see README.md)."
  exit 1
fi
echo "      COLMAP sparse reconstruction complete"

# ── Step 3: Convert COLMAP → nerfstudio format ───────────────────────────────
echo "[3/5] Converting COLMAP → nerfstudio format..."
python3 "${SCRIPT_DIR}/colmap_to_nerf.py" \
  --colmap_dir "${WORK_DIR}/colmap_out" \
  --image_dir "${WORK_DIR}/frames" \
  --output_dir "${WORK_DIR}/ns_data"

# ── Step 4: Train 3DGS with nerfstudio splatfacto ────────────────────────────
echo "[4/5] Training 3DGS with nerfstudio splatfacto (7000 iterations ~5-15 min)..."
ns-train splatfacto \
  --data "${WORK_DIR}/ns_data" \
  --output-dir "${WORK_DIR}/ns_outputs" \
  --max-num-iterations 7000 \
  --viewer.quit-on-train-completion True \
  2>&1 | tail -20

CONFIG_PATH=$(find "${WORK_DIR}/ns_outputs" -name "config.yml" | head -1)
if [ -z "${CONFIG_PATH}" ]; then
  echo "ERROR: nerfstudio training produced no config.yml"
  exit 1
fi
echo "      Training complete. Config: ${CONFIG_PATH}"

# ── Step 5: Export .ply → convert to .ksplat ─────────────────────────────────
echo "[5/5] Exporting Gaussian Splat and converting to .ksplat..."
PLY_DIR="${WORK_DIR}/splat_export"
mkdir -p "${PLY_DIR}"

ns-export gaussian-splat \
  --load-config "${CONFIG_PATH}" \
  --output-dir "${PLY_DIR}"

PLY_FILE=$(find "${PLY_DIR}" -name "*.ply" | head -1)
if [ -z "${PLY_FILE}" ]; then
  echo "ERROR: No .ply file found after export"
  exit 1
fi

echo "      Converting .ply → .ksplat..."
python3 "${SCRIPT_DIR}/ply_to_ksplat.py" "${PLY_FILE}" "${OUTPUT_KSPLAT}"

echo ""
echo "=== Pipeline complete ==="
echo "    Output: ${OUTPUT_KSPLAT}"
echo "    Size:   $(du -sh "${OUTPUT_KSPLAT}" | cut -f1)"
echo ""
echo "    Load in browser: /splats/${SCENE}.ksplat"
