# frontend

Next.js frontend for the Zuup World Model. Visualizes entity state across all nine
substrates, renders the causal graph as a 3D Nebula canvas, and provides a developer
portal for API access and platform integration.

When the ZWM indexer is not running, all data calls fall back silently to seeded
mock data — the UI is always functional for demos.

---

## Pages

| Route | Description |
|---|---|
| `/` | Homepage — 3D Nebula canvas + ZWM intro copy |
| `/world` | World state: force-directed entity graph |
| `/substrates` | Nine substrate cards with benchmarks and status badges |
| `/build` | Access tiers: API / Platform Partnership / Institutional |
| `/entities/[id]` | Entity detail — current state across all substrates |
| `/graph` | Raw Nebula canvas (development/debug view) |

---

## Setup

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

**Production build:**

```bash
npm run build
npm start
```

---

## Environment Variables

Create `frontend/.env.local` (or set these in Vercel project settings):

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_ZWM_API_URL` | `http://localhost:3001` | Enterprise REST API base URL |
| `NEXT_PUBLIC_ZWM_GRAPHQL_URL` | `http://localhost:4000/graphql` | GraphQL endpoint |

Without these, the frontend uses seeded mock data and works offline.

---

## Connecting to a Live Indexer

1. Start `zuup-zwm-indexer` (see its README)
2. Set the env vars above to point at the running indexer
3. Restart `npm run dev`

Real-time SubstrateEvent subscriptions require the GraphQL endpoint to support
WebSocket (`graphql-ws` or `subscriptions-transport-ws`).

---

## Design Tokens

Defined in `tailwind.config.ts` under the `zwn` namespace:

| Token | Value | Used for |
|---|---|---|
| `zwn-bg` | `#0a0a0a` | Canvas and page background |
| `zwn-surface` | `#111111` | Cards, panels |
| `zwn-border` | `#1e1e1e` | Dividers, card borders |
| `zwn-text` | `#f0ece4` | Primary text |
| `zwn-muted` | `#888880` | Secondary text, labels |
| `zwn-teal` | `#1D9E75` | WorldActor nodes, accent |
| `zwn-purple` | `#7F77DD` | ComplianceState, ProcurementState |
| `zwn-amber` | `#EF9F27` | BiologicalState, HistoricalRecon |
| `zwn-coral` | `#D85A30` | MigrationState, ComputeState, CAUSED_BY edges |
| `zwn-gray` | `#888780` | SubstrateEvent nodes |

---

## Key Components

| Component | Path | Description |
|---|---|---|
| `NebulaCanvas` | `components/nebula/NebulaCanvas.tsx` | 3D Gaussian Splat procedural renderer (Three.js) |
| `GaussianSplatRenderer` | `components/nebula/GaussianSplatRenderer.tsx` | Core splat geometry + animation loop |
| `NebulaHUD` | `components/nebula/NebulaHUD.tsx` | Overlay stats (slot, TPS, program ID) |
| API client | `lib/api.ts` | `getWorldState`, `getCompositeRisk`, `getCausalChain` with mock fallback |
| GraphQL client | `lib/gql.ts` | Thin `gqlQuery` wrapper |
| Constants | `lib/constants.ts` | API base URLs, program ID, substrate colors/labels |

---

## Deployment

Deployed via [Vercel](https://vercel.com/). Configuration lives at the repo root
in `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

The root `package.json` `build` script runs `cd frontend && npm install && npm run build`,
which Vercel invokes automatically on every push to `main`.

Set `NEXT_PUBLIC_ZWM_API_URL` and `NEXT_PUBLIC_ZWM_GRAPHQL_URL` as environment
variables in the Vercel project settings for production.
