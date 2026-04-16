# ZWM Splat Pipeline

Converts LTX-Video 2.3 generated MP4 videos into `.ksplat` files for browser rendering.

## Pipeline

```
LTX-Video 2.3 (ltx-service) → MP4
  ↓ FFmpeg (2 FPS frame extraction)
  ↓ COLMAP (Structure-from-Motion → camera poses + sparse point cloud)
  ↓ nerfstudio splatfacto (3D Gaussian Splatting training, 7000 iterations)
  ↓ ns-export gaussian-splat (.ply export)
  ↓ ply_to_ksplat.py (.ksplat binary conversion)
→ frontend/public/splats/<scene>.ksplat
```

## Prerequisites

### 1. FFmpeg
```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

### 2. COLMAP
```bash
# Ubuntu/Debian
sudo apt install colmap

# macOS
brew install colmap

# Or build from source: https://colmap.github.io/install.html
```

### 3. nerfstudio + CUDA
Requires an NVIDIA GPU with CUDA 11.8+ for splatfacto training.

```bash
# Install with pip (requires CUDA toolkit)
pip install nerfstudio

# Verify installation
ns-train --help
ns-export --help
```

Full install guide: https://docs.nerf.studio/quickstart/installation.html

### 4. Python dependencies
```bash
pip install -r requirements.txt
```

## Usage

### Step 1: Generate video with LTX-Video
```bash
# Start the ltx-service
cd ../ltx-service
cp .env.example .env && nano .env  # add your FAL_KEY
uvicorn main:app --port 8100

# Generate a video
curl -X POST http://localhost:8100/generate -H "Content-Type: application/json" \
  -d '{"scene": "world-nebula"}'

# Check status (replace JOB_ID)
curl http://localhost:8100/status/JOB_ID
# → {"status": "done", "video_path": "outputs/world-nebula-xxxx.mp4"}
```

### Step 2: Run the full pipeline
```bash
bash video_to_splat.sh ../ltx-service/outputs/world-nebula-xxxx.mp4 world-nebula
```

The output `.ksplat` file will be placed at:
```
../frontend/public/splats/world-nebula.ksplat
```

### Step 3: View in browser
Start the frontend dev server and navigate to `/world`. The SplatScene component
automatically loads `/splats/world-demo.ksplat` (or whichever URL is passed).

## Troubleshooting

### COLMAP fails to reconstruct (LTX-Video content)

LTX-Video generates stylized/dreamlike content that may not have enough texture
for COLMAP's feature matching (SIFT). Options:

**Option A: Increase frame count**
```bash
bash video_to_splat.sh video.mp4 my-scene 4  # extract at 4 FPS instead of 2
```

**Option B: Use DUSt3R/MASt3R (better for monocular video)**
DUSt3R handles low-texture scenes better than COLMAP.
```bash
pip install dust3r
# See: https://github.com/naver/dust3r
```

**Option C: Use pre-captured photogrammetry scenes**
For maximum visual quality, capture a real-world space with a camera
(or use LumaAI mobile app) and use that .ksplat directly.

### nerfstudio training is slow

- Use `--max-num-iterations 3000` for faster (lower quality) results
- Ensure CUDA is available: `python -c "import torch; print(torch.cuda.is_available())"`

### Worker file issues in browser

If `@mkkellogg/gaussian-splats-3d` throws worker errors, see frontend `next.config.mjs`
for the webpack configuration that handles web workers.
