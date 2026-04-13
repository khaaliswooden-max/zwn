# Zuup World Model Launches 3D Gaussian Splat Nebula Visualization for Causal Graph Exploration

## Custom Three.js shaders with volumetric particle clouds, a cinematic post-processing pipeline, and interactive causal flow animation bring the institutional world model to life in the browser.

**FOR IMMEDIATE RELEASE**

**HUNTSVILLE, AL -- April 13, 2026** -- Zuup Innovation Lab today released a production-grade 3D visualization system for the Zuup World Model (ZWM). The new Gaussian Splat Nebula renderer replaces the previous 2D force-directed graph with a volumetric particle system where each platform substrate appears as a distinct colored cloud, causal connections flow as animated edges between clusters, and a full post-processing pipeline delivers cinematic visual quality directly in the browser.

The visualization is not decorative. It is an operational instrument. Every particle cloud represents live state from one of nine Solana-deployed platforms. Every edge represents a causal connection -- a compliance violation that triggered a procurement recalculation, a biological anomaly that escalated to a reasoning cycle. Users can trigger the causal flow animation with a single keypress to watch cause propagate through the world model in real time.

### What Was Built

The renderer is a custom Three.js shader system built on React Three Fiber, with no dependency on `@react-three/drei`. All orbit controls are inlined for bundle size optimization. The particle system uses Fibonacci sphere distribution for uniform cluster placement, Gaussian falloff (e^(-4.5 * distance^2)) with additive blending for volumetric depth, and simplex noise FBM (fractal Brownian motion) for organic turbulence that transforms uniform clusters into churning nebulae.

Each substrate has a distinct color signature. Teal (#1D9E75) for WorldActor nodes. Purple (#7F77DD) for compliance and procurement states. Amber (#EF9F27) for historical and biological data. Coral (#D85A30) for compute and causal events. Risk-based tinting shifts particle color toward coral when an entity's composite risk score is elevated. Breathing pulse animation varies speed per substrate, creating a living system that responds to the state of the world model.

The post-processing pipeline adds bloom, depth of field, ACES filmic tone mapping, chromatic aberration, and vignette through `@react-three/postprocessing`. The camera auto-rotates with damping (0.08 factor, 0.3 speed) and supports full orbit interaction via click-drag and scroll.

### Causal Flow Animation

Pressing "C" triggers the causal flow animation system. Particles arc via Bezier curves from source clusters to target clusters, passing through four lifecycle stages: emit, transit, absorb, and settle. The animation visualizes the causal propagation rules defined in `config/causal-rules.ts` -- a compliance violation in Civium sends a visible pulse to Aureon and ZUSDC simultaneously, making the cross-substrate causality tangible.

### Technical Highlights

- **GaussianSplatRenderer** -- Custom Three.js vertex/fragment shaders with simplex noise FBM, Fibonacci sphere distribution, Gaussian falloff blending, and depth sorting for transparent particles (`frontend/components/nebula/GaussianSplatRenderer.tsx`)
- **PostFX pipeline** -- Bloom, depth of field, ACES filmic tone mapping, chromatic aberration, vignette (`frontend/components/nebula/PostFX.tsx`)
- **Causal flow animator** -- Bezier curve particle arcs with emit/transit/absorb/settle lifecycle stages (`frontend/lib/nebula/causal-animator.ts`)
- **GLSL noise library** -- 87-line simplex noise implementation with FBM and turbulence functions (`frontend/lib/nebula/noise.glsl.ts`)
- **Capability detection** -- `supportsVolumetric()` function with WebGL1 graceful fallback for older browsers (`frontend/lib/nebula/capabilities.ts`)
- **Interactive cluster hit meshes** -- Click targets for each platform cluster with detail panel integration (`frontend/components/nebula/ClusterHitMeshes.tsx`)
- **Zero drei dependency** -- OrbitControls inlined, reducing bundle size and eliminating a transitive dependency chain
- **Substrate color system** -- Centralized color mapping via `SUBSTRATE_COLORS` in `frontend/lib/constants.ts`

> "Visualization is not decoration. When you can see cause flowing from one substrate to another in real time, the world model stops being an abstraction and becomes an instrument. Every particle in that nebula is a state snapshot from a Solana program. Every animated edge is a causal rule firing. The rendering makes the architecture legible."
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
