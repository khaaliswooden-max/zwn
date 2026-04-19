# Zuup World Model Opens Discovery Surfaces — The R&D, Media, and Daily Intelligence Pipeline Now Visible In-Browser

## Four previously-internal sub-pipelines — the autoresearch loop, LTX-Video scene generator, 3D Gaussian Splat baker, and daily brief generator — now surface directly into the ZWM frontend, turning opaque backend services into living visitor-facing experiences.

**FOR IMMEDIATE RELEASE**

**HUNTSVILLE, AL -- April 19, 2026** -- Zuup Innovation Lab today announced the launch of four new discovery surfaces in the Zuup World Model (ZWM) frontend. The release exposes the autoresearch threshold optimizer, the LTX-Video scene generator, the 3D Gaussian Splat pipeline, and the daily 10x brief generator through dedicated browser routes, a live scene gallery, ambient substrate backdrops, and a navigation-bar badge that pulses until the day's brief has been read.

Where the ZWM backend has been running these four pipelines as independent CLI tools and Python services, the new release treats each one as a first-class visitor artifact — a page, a component, or a notification — so that the experimental machinery behind the world model is no longer invisible to the institutions evaluating it.

### Why This Matters

ZWM is an integration layer: nine Solana-deployed platforms, a Neo4j causal graph, an Apollo GraphQL API, and a Three.js-based world-model canvas. Until this release, the experimental and media machinery that makes those nine platforms behave as a coherent world model — the threshold optimizer that learns the causal rule configuration, the video and splat pipeline that generates the nebula environment, the autonomous daily-brief engine that tracks emerging industry research — all lived outside the browser. Visitors saw the substrate; they did not see the R&D.

This release closes that gap. The autoresearch F1 trajectory is now a live chart. The LTX-Video scene catalog is now a hover-previewed gallery with an estimated-time-to-completion counter. The Gaussian Splat pipeline can now bake one environment per substrate, and the substrate grid now swaps its ambient backdrop as the visitor hovers each card. The daily 10x brief — which Claude generates autonomously every morning from live web search — now has a JSON output pathway and a dedicated reader page, announced by a pulsing amber dot on the navigation bar.

### What the Discovery Surfaces Do

The `/research` page reads `frontend/public/research/experiment_log.json`, written by the `zwm-autoresearch/run_loop.py` loop after every iteration. The page renders an SVG F1-trajectory chart with baseline and running-best reference lines, a list of kept diffs (the threshold changes Claude proposed and that actually improved F1), and a full history table showing every experiment including the reverted ones. Each kept diff is a one-line description of the change Claude proposed — "lower compliance_violation_score 40→35", "raise violation contribution 0.60→0.70" — alongside the F1, precision, recall, and delta.

The LTX-Video service now exposes `GET /preview/{scene}` for cached first-frame PNGs and returns `eta_seconds` + `estimated_seconds` on `/status/{id}`. The new `SceneGallery` component consumes both: each scene tile shows its cached preview image (or a color fallback when no preview is cached), a description, and an estimated generation time. The generating-status chip on `/world` shows a live countdown that ticks down second-by-second as the fal.ai LTX-2 job runs.

The splat-pipeline gains a `batch_substrates.sh` script that iterates over the five substrate scene definitions and bakes one `.ksplat` per substrate into `frontend/public/splats/`. The `SubstrateBackdrop` component then renders those splats as a low-power ambient canvas behind the substrate grid. As the visitor hovers each card, the backdrop URL swaps to that substrate's environment — compliance-domain for Civium, procurement-lattice for Aureon, biological-field for Symbion, causal-flow for QAL and Relian. If a splat has not yet been baked, the backdrop silently 404s and the grid renders unchanged.

The zwm-daily generator gains a `--json-out <path>` flag that mirrors the parsed brief as JSON alongside the existing DOCX output. The new `/brief` page reads that JSON and renders the headline move, affected platforms, implementation steps, a 30-day plan table, the financial-impact paragraph, the "what's new" feed, research backing, and side-by-side successful and failed implementation use cases. A new BRIEF link in the navigation bar carries a pulsing amber dot until the visitor opens the page, at which point the current brief date is stamped into `localStorage` and the dot disappears until a newer brief is published.

### Technical Highlights

- **`/research` page** with server-side ISR (60s revalidation), reads the autoresearch log as a static asset; renders an SVG F1 trajectory with running-best curve, baseline reference line, and per-iteration dots colored by kept/reverted status (`frontend/app/research/page.tsx`, `frontend/components/ThresholdChart.tsx`)
- **`run_loop.py` mirror write** — every iteration now writes `results/experiment_log.json` and, additionally, `../frontend/public/research/experiment_log.json`; the second write is wrapped in an OSError-swallowing try/except so the loop continues to function when the frontend repo is not checked out alongside (`zwm-autoresearch/run_loop.py`)
- **LTX-Video `/preview/{scene}` endpoint** serves cached first-frame PNGs from `outputs/previews/{scene}.png`, returns 404 when no preview has been baked; `AVAILABLE_SCENES` guard prevents path traversal (`ltx-service/main.py`)
- **Live ETA countdown** — `get_job_status()` in `ltx-service/generate.py` tracks `started_at` on transition to running and computes `eta_seconds = max(0, estimated - elapsed)` on every status poll; each scene has a configurable `estimated_seconds` baseline (75s for 10-second scenes, 60s for 8-second scenes)
- **`SceneGallery` component** fetches `/scenes` metadata on mount, merges it with a hardcoded default list so the gallery renders even when ltx-service is unreachable; each tile shows the cached preview image (with `onError` fallback to a color block) plus the description and ETA hint (`frontend/components/SceneGallery.tsx`)
- **`batch_substrates.sh`** — bakes one `.ksplat` per substrate backdrop (compliance-domain, procurement-lattice, causal-flow, biological-field, world-nebula), supports `--dry-run`, skips missing source videos gracefully, and exits non-zero if any substrate fails so CI can surface the failure (`splat-pipeline/batch_substrates.sh`)
- **`SubstrateBackdrop` component** renders one shared R3F canvas behind the substrate grid with `powerPreference: 'low-power'`, `antialias: false`, `dpr: [1, 1.5]`, a slow auto-rotate camera (0.08 rad/s drift), 25% opacity, and `pointer-events: none`; card hover/focus swaps the splat URL via a platform-to-scene map (`frontend/components/splat/SubstrateBackdrop.tsx`, `frontend/app/substrates/page.tsx`)
- **`zwm-daily --json-out` flag** parses `process.argv` for `--json-out <path>`, writes a JSON payload containing the date, model, generation timestamp, and the full parsed brief (whats_new, ten_x_improvement, research_backing, use_cases) alongside the existing DOCX (`zwm-daily/zwm-daily.mjs`)
- **`/brief` page** with ISR (5m revalidation), renders the latest brief as a structured article — headline move, platform tags, implementation steps, 30-day plan table, financial impact, what's-new feed, research backing, and side-by-side successful/failed use cases (`frontend/app/brief/page.tsx`)
- **Navigation-bar brief badge** fetches `/brief/latest.json` on mount, compares its `date` field to the `zwn:brief:seen` key in `localStorage`; if the cached date is older or missing, a pulsing amber dot appears next to the BRIEF link until the visitor opens the page, at which point the date is stamped and the dot disappears (`frontend/components/NavBar.tsx`)
- **Silent-fallback posture across all four surfaces** — every new surface degrades gracefully: the `/research` page renders an empty-state message when the log is missing, `SceneGallery` falls back to hardcoded defaults when ltx-service is offline, `SubstrateBackdrop` loads through the existing silent-404 `SplatEnvironment`, and the brief badge stays hidden when `latest.json` is absent or `localStorage` is blocked
- **Demo seed data** — `frontend/public/research/experiment_log.json` is seeded with the 15-iteration autoresearch log already in `zwm-autoresearch/results/` and `frontend/public/brief/latest.json` is seeded with a demo brief, so both pages render on first clone without requiring the generator services to run first

### The Distinction from the Underlying Services

The four underlying services — `zwm-autoresearch`, `ltx-service`, `splat-pipeline`, `zwm-daily` — have existed in the ZWM monorepo for several weeks and continue to operate as independent CLI tools and FastAPI services. This release does not replace them. It surfaces their outputs.

The autoresearch loop still runs as a Python process; the `/research` page is a static snapshot of its latest log. LTX-Video generation still runs on fal.ai; the scene gallery is a preview and status layer. The splat pipeline still requires COLMAP plus nerfstudio; the substrate backdrop is the delivery mechanism for the baked artifacts. The daily brief is still generated by an Anthropic API call with web search; the `/brief` page is the reader. In each case, the backend is unchanged — what changes is that the work is now visible.

> "For a year we ran these four pipelines on the command line and in cron jobs, producing .json files, .mp4 files, .ksplat files, and .docx files that nobody but the operator ever saw. That was always a temporary state. The world model is not a thesis — it is something we are doing, every day. The research loop learns. The scene generator renders. The splat pipeline bakes. The daily brief thinks. What we shipped today is the window into that work. Institutions evaluating ZWM can now see not only what it does, but what it is in the middle of becoming."
>
> -- Aldrich Khaalis Wooden, Sr., Founder, Zuup Innovation Lab

### About Zuup Innovation Lab

Zuup Innovation Lab, a division of Visionblox LLC, builds the Zuup World Model (ZWM) -- an integration layer that transforms nine independent Solana-deployed platforms into a single, causally-coherent world model. The nine platforms span compliance verification (Civium), procurement intelligence (Aureon), historical reconstruction (QAL), biological monitoring (Symbion), code migration (Relian), edge compute orchestration (PodX), AI reasoning (Veyra), stablecoin settlement (ZUSDC), and on-chain attestation (ZuupHQ).

ZWM listens to all nine programs via Solana WebSocket, writes their state changes into a shared Neo4j graph, evaluates causal propagation rules across substrates, and exposes the resulting world state through GraphQL and REST APIs.

**Website:** zuup.org
**GitHub:** github.com/khaaliswooden-max/zwn
**Solana Network:** Devnet (Program ID: H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM)

### Contact

Aldrich Khaalis Wooden, Sr.
Zuup Innovation Lab · Visionblox LLC
khaaliswooden@gmail.com · zuup.org
Huntsville, Alabama

---

*Zuup Innovation Lab · "Where Ideas Collapse Into Reality"*
