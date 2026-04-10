# Graph Page — Non-Technical Walkthrough

**Page:** `zworldmodel.sys/graph`
**Source:** `frontend/components/nebula/NebulaCanvas.tsx`

---

## What You're Looking At

The graph page is a live 3D map of the entire Zuup World Model. Think of it
like a galaxy map, but instead of stars, each glowing orb represents a piece
of the system — a company, a compliance check, a procurement score, a
biological reading, etc.

The colored blobs floating in the dark space are **clusters of data**, and the
faint lines connecting them show **relationships** — who owns what state, and
what caused what to happen.

### Color Coding

| Color | Meaning |
|---|---|
| Teal/green (`#1D9E75`) | WorldActors — the core entities (companies, agencies, people) |
| Purple (`#7F77DD`) | Compliance and Procurement states (Civium/Aureon data) |
| Amber/gold (`#EF9F27`) | Historical and Biological states (QAL/Symbion data) |
| Coral/red-orange (`#D85A30`) | Migration and Compute states (Relian/PodX data) |
| Gray (`#888780`) | Substrate events (the triggers that caused things to happen) |

### Interaction

- **Click and drag** to orbit around the scene
- **Scroll** to zoom in/out
- **Single-click** an orb to open a side panel showing its details (what it is,
  what substrate it belongs to, key metrics)
- **Double-click** an orb to fly the camera toward it
- The whole scene **slowly auto-rotates** so you can see it from different angles

---

## How "Press C" Works

At the bottom-left of the screen there's a small hint:
**"press C to trigger causal flow."**

This is a demo trigger that lets you watch cause-and-effect happen in real time.
Here's what it does in plain English:

1. You press the **C** key on your keyboard.
2. The system finds the **Compliance node** (Civium) and the **Procurement node** (Aureon).
3. It launches **5 small glowing particles** from the Compliance orb.
4. Those particles **travel through the air along a curved arc** (like a
   slow-motion flare) from Compliance to Procurement.
5. When they arrive, the Procurement orb absorbs them and briefly brightens.

This visualizes the real causal rule: *"When a compliance status changes,
Aureon recalculates its FitIQ score."* The animation makes that invisible
data flow **visible** — you can literally watch one platform's event ripple
into another.

### Animation Stages

| Stage | Duration | What Happens |
|---|---|---|
| **Emit** | 0.5s | The source orb flashes as it "fires" the event |
| **Transit** | 1.5s | The particles arc through space along a curved Bezier path |
| **Absorb** | 0.5s | The target orb flashes as it receives the event |
| **Settle** | 1.0s | Everything calms back to normal |

You can press C multiple times to fire off multiple animations simultaneously.

### Source Code

- Keyboard listener: `frontend/components/nebula/NebulaCanvas.tsx` (lines 177–199)
- Animation lifecycle: `frontend/lib/nebula/causal-animator.ts`

---

## The 3D Gaussian Splat Fuzzing Design

This is the visual style — why everything looks like soft, glowing clouds
instead of hard circles or squares.

**In simple terms:** Each data node isn't drawn as a solid dot. Instead, it's
rendered as a **cluster of dozens of tiny transparent particles**, each one
fading out softly from its center — like a spray of luminous fog. When many
of these overlap, they blend together and create that fuzzy, nebula-like glow
you see on screen.

### How It Works, Step by Step

1. **Each node becomes a cloud.** A WorldActor might be made of ~26 particles.
   A state node gets ~12–16. They're arranged in a small sphere shape using a
   mathematical spiral pattern (Fibonacci distribution — the same pattern you
   see in sunflower seeds).

2. **Each particle is a "Gaussian splat."** The word "Gaussian" just means
   "bell curve." Each particle is brightest at its center and fades to
   invisible at its edges following a smooth bell-curve falloff. The shader
   code computes `e^(-4.5 * distance^2)` — a Gaussian function — for every
   pixel on screen.

3. **Additive blending.** Where particles overlap, their light **adds together**
   instead of one blocking the other. This is what makes the centers of
   clusters glow intensely while the edges are wispy and translucent — just
   like real nebulae or out-of-focus city lights.

4. **Breathing.** Every cluster gently **pulses in and out** on a slow sine
   wave, giving the whole scene an organic, alive feeling. Different substrates
   breathe at different speeds (e.g., violations pulse faster as a visual
   warning).

5. **Drift.** Each particle has a tiny random velocity that slowly changes
   direction, so the clouds **subtly shimmer and shift** — never perfectly
   still, but never chaotic either. The drift decays quickly (98% damping per
   frame) so nothing flies away.

6. **Depth sorting.** Since these are transparent particles, the system
   continuously sorts them back-to-front relative to your camera so that
   closer particles render on top of farther ones. This keeps the 3D illusion
   correct as you orbit.

7. **Risk tinting.** If a node has elevated risk, its color shifts toward
   **coral-red** proportionally — a visual early warning system baked right
   into the glow.

### Why This Design

Traditional graph visualizations use hard dots and lines — they look like subway
maps. The Gaussian splat approach makes the graph feel like a **living organism**
rather than a spreadsheet. The softness communicates uncertainty and continuous
state, which is more honest to what the data actually represents. It also makes
the causal animations (the "press C" flow) feel natural — particles flowing
between clouds rather than arrows between boxes.

### Key Source Files

| File | Purpose |
|---|---|
| `frontend/components/nebula/GaussianSplatRenderer.tsx` | WebGL shaders + instanced particle rendering |
| `frontend/lib/nebula/gaussian-math.ts` | Particle cluster generation (Fibonacci sphere) |
| `frontend/lib/nebula/layout.ts` | 3D semantic positioning of nodes |
| `frontend/lib/nebula/depth-sort.ts` | Back-to-front transparency sorting |
| `frontend/lib/nebula/data-mapper.ts` | Maps graph data to visual cluster descriptors |

### Technical Stack

- **Three.js** v0.170.0 via **React Three Fiber** v9.5.0
- Custom GLSL vertex/fragment shaders
- Instanced rendering (one draw call for all particles)
- No post-processing — the glow is pure shader math + additive blending

---

**TL;DR:** It's a 3D nebula-style map of all the platforms' data. Each glowing
cloud is a piece of the world model. Press C to watch cause-and-effect flow
between them in real time. The fuzzy glow comes from hundreds of tiny transparent
particles blended together using Gaussian math — the same math behind camera
bokeh and real nebula rendering.
