# ZWN — Zuup World Model

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Network](https://img.shields.io/badge/solana-devnet-9945FF.svg)](https://explorer.solana.com/?cluster=devnet)
[![Status](https://img.shields.io/badge/phase-2A%20active-1D9E75.svg)](#build-status)

The Zuup World Model (ZWM) is the integration layer that transforms nine independent
Solana-deployed platforms into a single, causally-coherent world model. It listens to
all nine programs, writes their state changes into a shared Neo4j graph, evaluates
causal propagation rules across substrates, and exposes a GraphQL API that Veyra
queries for world state before each reasoning call.

**Owner:** Aldrich Khaalis Wooden, Sr. · Zuup Innovation Lab · Visionblox LLC

---

## Architecture

```
 Solana Devnet
 ┌─────────────────────────────────────────────────┐
 │  civium  aureon  qal  symbion  relian  podx      │
 │  veyra   zusdc  zuup-hq  (Anchor programs)       │
 └────────────────────┬────────────────────────────┘
                      │ WebSocket logs
                      ▼
             zuup-zwm-indexer/
             ┌─────────────────────────────────────┐
             │  src/listeners/   (one per platform) │
             │       ↓                              │
             │  src/parsers/     (IDL deserialization)
             │       ↓                              │
             │  src/writers/     (Neo4j, append-only)
             │       ↓                              │
             │  src/causal/      (propagation engine)
             │       ↓                              │
             │  POST /zwm/ingest → platform services│
             │  GraphQL API      :4000              │
             │  Enterprise REST  :3001              │
             └─────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
      frontend/               veyra/service/
      (Next.js :3000)         (reasoning + context injection)
```

---

## Repo Map

| Package | Description | Status | Key Tech |
|---|---|---|---|
| `zuup-zwm-indexer/` | Solana listener + Neo4j writer + causal engine + GraphQL/REST API | Active | TypeScript, Neo4j, @coral-xyz/anchor |
| `zuup-zwm-indexer/sdk/` | TypeScript client SDK (`@zuup/zwm-sdk`) | Active | TypeScript, axios |
| `frontend/` | World model visualization + developer portal | Active | Next.js, Tailwind, Three.js |
| `zwm-daily/` | Daily 10x brief generator | Active | Node.js, Anthropic API |
| `veyra/service/` | Reasoning service + ZWM context injection | Active | Python |

Platform repos (`civium/`, `aureon/`, `qal/`, `symbion/`, `relian/`, `podx/`, `zusdc/`, `zuup-hq/`) are cloned separately — see `.gitignore`.

**GitHub org:** `khaaliswooden-max`  
**Solana Program ID (devnet):** `H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM`

---

## Build Status

| Phase | Scope | Status |
|---|---|---|
| 2A — Emit side | Anchor `#[event]` structs + `emit!()` calls per platform | Civium + Aureon complete |
| 2B — Ingest side | `POST /zwm/ingest` endpoint per platform service | In progress |
| 2C — Neo4j init | Constraint + index Cypher, run once at startup | Complete |
| 3 — Veyra integration | Context injection layer for reasoning calls | Complete |

---

## Quick Start

**Prerequisites**

- Node.js 18+
- Neo4j 5+ (local Docker or [AuraDB](https://neo4j.com/cloud/platform/aura-graph-database/))
- Rust (stable) + [Anchor CLI 0.30.1](https://www.anchor-lang.com/docs/installation)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (configured for devnet)

**Indexer**

```bash
cd zuup-zwm-indexer
cp .env.example .env          # fill in NEO4J_PASSWORD + any missing program IDs
npm install
npm run build
npx ts-node src/db/init.ts    # run once — creates Neo4j constraints + indexes
npm start
```

**Frontend**

```bash
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

Set `NEXT_PUBLIC_ZWM_API_URL` and `NEXT_PUBLIC_ZWM_GRAPHQL_URL` in `.env.local` to point
at a running indexer. Without them, the UI falls back to seeded mock data.

**Daily Brief**

```bash
cd zwm-daily
cp .env.example .env          # add ANTHROPIC_API_KEY
npm install
bash run-daily.sh             # Linux/macOS
.\run-daily.ps1               # Windows PowerShell
```

---

## Documentation

| File | Purpose |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Internal Claude Code session context: graph schema, causal rules, Anchor event contracts, session prompts |
| [`zuup-zwm-indexer/README.md`](zuup-zwm-indexer/README.md) | Indexer setup, env vars, GraphQL/REST API reference |
| [`frontend/README.md`](frontend/README.md) | Frontend setup, pages, design tokens, Vercel deployment |
| [`zwm-daily/README.md`](zwm-daily/README.md) | Daily brief generator setup and scheduling |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branching, commit style, build steps, session workflow |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reporting, key management, Solana security notes |

---

## Contact

Aldrich Khaalis Wooden, Sr.  
Zuup Innovation Lab · Visionblox LLC  
khaaliswooden@gmail.com · zuup.org · Huntsville, Alabama
