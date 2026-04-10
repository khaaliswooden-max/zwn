# Zuup World Model (ZWM) — Workspace Context
**Owner:** Aldrich Khaalis Wooden, Sr. · Zuup Innovation Lab · Visionblox LLC
**Domain:** ZIL (Zuup Innovation Lab R&D)
**Status:** ACTIVE — Phase 2A (Emit side, starting with Civium)
**Last Updated:** April 2026

---

## What This Is

The ZWM (Zuup World Model) is the integration layer that transforms nine independent
Solana-deployed platforms into a single, causally-coherent world model. It consists of:

- **zuup-zwm-indexer/** — NEW repo, primary build target for this workspace
- **Eight platform repos** — each gets a thin adapter (emit + ingest), no restructuring

The ZWM does not replace any platform. It listens to all of them, writes their state
changes into a shared Neo4j graph, evaluates causal propagation rules, and exposes
a GraphQL API that Veyra queries for world state before reasoning.

---

## Repo Map

```
~/your-workspace/          ← run `claude` from HERE, not from inside any repo
  zblackhole.io/           ← zuup.org — ALL frontend work goes here
  zuup-zwm-indexer/        ← primary build target
  civium/                  ← Anchor (Rust) + FastAPI (Python)
  aureon/                  ← Anchor (Rust) + FastAPI (Python)
  qal/                     ← Anchor (Rust) + Python service
  symbion/                 ← Anchor (Rust) + JS/C++ service
  relian/                  ← Anchor (Rust) + Python service
  podx/                    ← Anchor (Rust) + Python service
  veyra/                   ← Anchor (Rust) + Python service
  zusdc/                   ← Anchor (Rust) + TypeScript service
  zuup-hq/                 ← Anchor (Rust) — trust layer, no off-chain service
```

**GitHub org:** khaaliswooden-max
**Solana Program ID (devnet):** H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM
**Anchor version:** 0.30.1
**Network:** Solana Devnet → Mainnet after security audit

---

## ZWM Indexer Structure

```
zuup-zwm-indexer/
  src/
    listeners/          ← Solana WebSocket subscriptions (one per platform)
    parsers/            ← Anchor EventParser deserialization (one per platform)
    writers/            ← Neo4j Cypher writes (append-only, no mutations)
    causal/             ← Propagation engine (evaluates causal-rules.ts)
    api/                ← Apollo GraphQL server (Veyra reads here, port 4000)
    db/                 ← Neo4j init (constraints + indexes, run once at startup)
  idl/                  ← Compiled Anchor IDL JSONs copied from each platform repo
  config/
    causal-rules.ts     ← Cross-substrate propagation rules (source of truth)
  tests/
    civium-e2e.ts       ← Green-path validation test (build this first)
  index.ts              ← Entry point — wires all listeners → parsers → writers → engine
  package.json
  tsconfig.json
  .env.example
```

**Stack:** TypeScript, Node.js, `@coral-xyz/anchor`, `@solana/web3.js`,
`neo4j-driver`, `@apollo/server`, `axios`, `dotenv`

---

## Graph Schema (Neo4j, Append-Only — NEVER mutate nodes)

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `WorldActor` | Stable entity (supplier, agency, org) | `id`, `created_at`, `last_seen` |
| `ComplianceState` | Civium output snapshot | `id`, `entity_id`, `status`, `score`, `domain`, `evidence_hash`, `timestamp`, `solana_slot`, `tx_signature` |
| `ProcurementState` | Aureon output snapshot | `id`, `entity_id`, `fitiq`, `upd`, `timestamp`, `solana_slot`, `tx_signature` |
| `BiologicalState` | Symbion output snapshot | `id`, `entity_id`, `serotonin`, `dopamine`, `cortisol`, `gaba`, `anomaly_flag`, `sensitivity`, `timestamp` |
| `HistoricalRecon` | QAL output snapshot | `id`, `entity_id`, `domain`, `confidence`, `temporal_depth_years`, `risk_metrics`, `timestamp` |
| `MigrationState` | Relian output snapshot | `id`, `project_id`, `semantic_preservation`, `test_coverage`, `velocity_loc_day`, `artifact_hash`, `timestamp` |
| `ComputeState` | PodX output snapshot | `id`, `entity_id`, `xdop_score`, `wcbi`, `ddil_hours`, `tops`, `availability`, `timestamp` |
| `SubstrateEvent` | Causal trigger node | `id`, `type`, `source`, `entity_id`, `payload_hash`, `solana_slot`, `timestamp` |
| `Attestation` | ZuupHQ on-chain record | `id`, `sha256`, `pda_address`, `score`, `attestation_type`, `solana_slot` |
| `SettlementRecord` | ZUSDC on-chain record | `id`, `amount`, `mint_sig`, `burn_sig`, `counterparty_id`, `solana_slot` |

### Edge Types

| Type | Direction | Meaning | Key Properties |
|---|---|---|---|
| `HAS_STATE` | WorldActor → StateNode | Actor has this state snapshot | `since`, `source` |
| `SUPERSEDES` | NewState → OldState | New state replaces old (history preserved) | `at` |
| `CAUSED_BY` | EffectState → SubstrateEvent | This state was caused by this event | `lag_ms`, `rule_id` |
| `ATTESTED_BY` | StateNode → Attestation | On-chain verification anchor | `slot`, `verified` |
| `EMITTED` | StateNode → SubstrateEvent | State change emitted this event | — |

### Current State Query Pattern
```cypher
-- "What is X's current state across all substrates?"
MATCH (actor:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
WHERE NOT (state)-[:SUPERSEDES]->()
RETURN actor, state, labels(state)[0] AS substrate
```

### Neo4j Initialization (run once at startup via src/db/init.ts)
```cypher
CREATE CONSTRAINT FOR (n:WorldActor) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:ComplianceState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:ProcurementState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:BiologicalState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:HistoricalRecon) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:MigrationState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:ComputeState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:SubstrateEvent) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:Attestation) REQUIRE n.id IS UNIQUE;
CREATE INDEX FOR (n:ComplianceState) ON (n.entity_id, n.timestamp);
CREATE INDEX FOR (n:ProcurementState) ON (n.entity_id, n.timestamp);
CREATE INDEX FOR (n:BiologicalState) ON (n.entity_id, n.timestamp);
CREATE INDEX FOR (n:SubstrateEvent) ON (n.source, n.type, n.timestamp);
-- Governance + Economics
CREATE CONSTRAINT FOR (n:ObjectiveState) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:TreatyAttestation) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:FeeRecord) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT FOR (n:ScaleMetric) REQUIRE n.id IS UNIQUE;
CREATE INDEX FOR (n:ObjectiveState) ON (n.status, n.timestamp);
CREATE INDEX FOR (n:TreatyAttestation) ON (n.jurisdiction_code, n.effective_date);
CREATE INDEX FOR (n:FeeRecord) ON (n.entity_id, n.timestamp);
CREATE INDEX FOR (n:ScaleMetric) ON (n.platform, n.timestamp);
```

---

## Governance Graph Schema (Objective Register + Treaty Layer)

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `ObjectiveState` | DAO-approved financial/operational target | `id`, `objective_type`, `target_metric`, `target_value`, `time_horizon_years`, `omega_floor`, `lyapunov_envelope`, `status`, `proposer_id`, `dao_vote_id`, `timestamp`, `solana_slot` |
| `TreatyAttestation` | Bilateral jurisdictional compliance agreement | `id`, `jurisdiction_code`, `jurisdiction_name`, `treaty_type`, `compliance_domain`, `attestation_hash`, `bilateral_partner`, `effective_date`, `expiry_date`, `civium_verification_id`, `timestamp`, `solana_slot` |

### Edge Types

| Type | Direction | Meaning | Key Properties |
|---|---|---|---|
| `GOVERNS` | ObjectiveState → WorldActor | This objective governs this actor's behavior | `since`, `priority` |
| `AUTHORIZED_BY` | ObjectiveState → TreatyAttestation | Objective authorized by this treaty | `scope` |
| `EXPANDS_SCOPE` | TreatyAttestation → TreatyAttestation | New treaty expands jurisdictional scope | `at` |

### Objective Status Values
`PROPOSED` → `VOTING` → `APPROVED` → `ACTIVE` → `COMPLETED` | `REJECTED` | `TERMINATED`

### Objective Query Pattern
```cypher
-- "What are the current active objectives?"
MATCH (o:ObjectiveState)
WHERE o.status = 'ACTIVE' AND NOT (o)-[:SUPERSEDES]->()
RETURN o ORDER BY o.timestamp DESC
```

---

## Economics Graph Schema (Fee Engine + Scale Coherence)

### Node Types

| Label | Description | Key Properties |
|---|---|---|
| `FeeRecord` | Fee charged on cross-platform ZUSDC settlement | `id`, `settlement_id`, `fee_amount_usdc`, `fee_basis_points`, `fee_type`, `source_platform`, `target_platform`, `entity_id`, `timestamp` |
| `ScaleMetric` | D7 Scale Coherence assessment snapshot | `id`, `platform`, `omega_rsf`, `omega_max`, `entropy_production`, `lyapunov_exponent`, `market_footprint`, `jurisdictional_coverage`, `assessment_status`, `timestamp` |

### Edge Types

| Type | Direction | Meaning | Key Properties |
|---|---|---|---|
| `FEE_ON` | FeeRecord → SettlementRecord | Fee charged on this settlement | `basis_points` |
| `ASSESSED_BY` | ScaleMetric → ObjectiveState | Metric assesses this objective's viability | `at` |

### Scale Coherence Formula
```
omega_max = market_footprint_ratio * jurisdictional_coverage_ratio * (1 - entropy_production_normalized)
```
Where:
- `market_footprint_ratio` = platform transaction volume / addressable market size
- `jurisdictional_coverage_ratio` = attested jurisdictions / required jurisdictions for objective
- `entropy_production_normalized` = system entropy / maximum stable entropy budget

A platform's omega_rsf must remain below omega_max. If omega_rsf > omega_max, the scale-breach causal rule fires and triggers Veyra reasoning.

---

## Causal Propagation Rules

These rules live in `config/causal-rules.ts`. The engine evaluates them after every
successful Neo4j write and calls the target platform's `POST /zwm/ingest` endpoint.

| Trigger | Source | Condition | Effect | Target |
|---|---|---|---|---|
| `COMPLIANCE_STATE_CHANGE` | civium | status === 'VIOLATION' | `RECALCULATE_FIT_IQ` (40% penalty) | aureon |
| `COMPLIANCE_STATE_CHANGE` | civium | status === 'VIOLATION' | `FLAG_SETTLEMENT` | zusdc |
| `RECONSTRUCTION_COMPLETE` | qal | confidence > 0.75 | `UPDATE_RISK_PRIORS` | aureon |
| `BIOLOGICAL_ANOMALY` | symbion | severity === 'HIGH' | `PRIORITIZE_COMPUTE` (CRITICAL) | podx |
| `BIOLOGICAL_ANOMALY` | symbion | severity === 'HIGH' | `TRIGGER_REASONING` | veyra |
| `MIGRATION_COMPLETE` | relian | semanticPreservation >= 0.95 | `WRITE_ATTESTATION` | zuup_hq |
| `COMPUTE_DEGRADATION` | podx | availability < 0.90 | `TRIGGER_REASONING` | veyra |
| `FITIQ_THRESHOLD` | aureon | fitiq < 50 | `FLAG_SETTLEMENT` | zusdc |
| `TREATY_ATTESTATION_NEW` | civium | always | `NOTIFY_SCOPE_EXPANSION` | governance |
| `SCALE_METRIC_UPDATE` | economics | omega_rsf > omega_max | `TRIGGER_REASONING` (SCALE_BREACH) | veyra |
| `OBJECTIVE_STATE_CHANGE` | governance | status === 'APPROVED' | `BROADCAST_OBJECTIVE` | all platforms |
| `SETTLEMENT_EVENT` | zusdc | amount > fee_threshold | `CALCULATE_FEE` | fee-engine |

---

## Platform Anchor Event Contracts

Each platform must emit these `#[event]` structs. Add `emit!()` in instruction handlers.
Do NOT restructure existing accounts or instructions.

### Civium → `ComplianceStateChange`
```rust
#[event]
pub struct ComplianceStateChange {
    pub entity_id: String,
    pub status: String,        // "COMPLIANT" | "VIOLATION" | "FLAGGED"
    pub score: u8,
    pub domain: String,        // "halal" | "esg" | "itar"
    pub evidence_hash: [u8; 32],
    pub timestamp: i64,
}
```

### Aureon → `ProcurementStateChange`
```rust
#[event]
pub struct ProcurementStateChange {
    pub entity_id: String,
    pub fitiq_score: u8,
    pub upd_score: u8,
    pub opportunity_count: u32,
    pub timestamp: i64,
}
```

### QAL → `ReconstructionComplete`
```rust
#[event]
pub struct ReconstructionComplete {
    pub entity_id: String,
    pub domain: String,
    pub confidence: f64,
    pub temporal_depth_years: u32,
    pub risk_level: String,    // "LOW" | "MEDIUM" | "HIGH"
    pub result_hash: [u8; 32],
    pub timestamp: i64,
}
```

### Symbion → `BiologicalReading`
```rust
#[event]
pub struct BiologicalReading {
    pub subject_id: String,
    pub serotonin_nm: f64,
    pub dopamine_nm: f64,
    pub cortisol_nm: f64,
    pub gaba_nm: f64,
    pub anomaly_flag: bool,
    pub severity: String,      // "NONE" | "LOW" | "MEDIUM" | "HIGH"
    pub timestamp: i64,
}
```

### Relian → `MigrationComplete`
```rust
#[event]
pub struct MigrationComplete {
    pub project_id: String,
    pub semantic_preservation: f64,  // 0.0–1.0
    pub test_coverage: f64,
    pub loc_migrated: u64,
    pub artifact_hash: [u8; 32],
    pub timestamp: i64,
}
```

### PodX → `ComputeStateUpdate`
```rust
#[event]
pub struct ComputeStateUpdate {
    pub node_id: String,
    pub xdop_score: u8,
    pub wcbi_score: u8,
    pub ddil_hours: f64,
    pub tops: u32,
    pub availability: f64,    // 0.0–1.0
    pub timestamp: i64,
}
```

### Veyra → `ReasoningComplete`
```rust
#[event]
pub struct ReasoningComplete {
    pub request_id: String,
    pub context: String,
    pub v_score: u8,
    pub latency_ms: u32,
    pub output_hash: [u8; 32],
    pub timestamp: i64,
}
```

### ZUSDC → `SettlementEvent`
```rust
#[event]
pub struct SettlementEvent {
    pub transaction_id: String,
    pub counterparty_id: String,
    pub amount_usdc: u64,       // in lamports (6 decimals)
    pub event_type: String,     // "MINT" | "BURN" | "FLAG" | "RELEASE"
    pub timestamp: i64,
}
```

---

## Platform Ingest Contract

Every platform's off-chain service adds ONE endpoint. Fixed contract, no exceptions.

```
POST /zwm/ingest
Content-Type: application/json

{
  "action": "RECALCULATE_FIT_IQ",       // platform-specific action string
  "params": { ... },                     // action-specific payload
  "triggerEventId": "event-abc123"       // SubstrateEvent id that caused this
}

Response 200:
{
  "eventId": "event-xyz789",            // new SubstrateEvent id this action produced
  "status": "ok"
}
```

### Actions per platform

**aureon:** `RECALCULATE_FIT_IQ`, `UPDATE_RISK_PRIORS`
**zusdc:** `FLAG_SETTLEMENT`, `RELEASE_HOLD`
**podx:** `PRIORITIZE_COMPUTE`, `REALLOCATE_WORKLOAD`
**veyra:** `TRIGGER_REASONING`
**zuup_hq:** `WRITE_ATTESTATION`

---

## Platform Benchmark Reference (for causal rule thresholds)

| Platform | Benchmark | Key Threshold |
|---|---|---|
| Aureon | APP-Bench / FitIQ | NDCG@20 ≥ 0.85 production; FitIQ < 50 → flag |
| Veyra | V-Score | > 75 production-ready; > 90 superhuman |
| PodX | XdoP / WCBI | 100/100 target; DDIL > 24hr; availability 99.99% |
| Symbion | Clinical | Sensitivity 92.5%; specificity 94.3%; anomaly = 3σ |
| QAL | QAWM Fidelity | Confidence > 0.75 triggers risk propagation |
| Civium | W3C VC 2.0 + EPCIS 2.0 | Any VIOLATION triggers Aureon + ZUSDC |
| Relian | Migration Quality | Semantic preservation ≥ 0.95 → auto-attest |
| ZUSDC | Collateral | 1:1 USDC backing; atomic mint/burn |
| ZuupHQ | Attestation | 100% coverage; SHA256 content-addressed |

---

## Build Sequence

### Phase 2A — Emit side (Rust, one week per platform)
1. **Civium** ← START HERE (binary state, easiest to trigger manually)
2. Aureon
3. QAL
4. Symbion
5. Relian
6. PodX
7. Veyra
8. ZUSDC

For each: add `#[event]` struct → add `emit!()` in instruction handler → `anchor build`
→ copy new IDL to `zuup-zwm-indexer/idl/` → confirm log appears in listener.

### Phase 2B — Ingest side (one endpoint per platform, parallel with 2A)
Add `POST /zwm/ingest` to each platform's existing off-chain service.
Action handlers are platform-internal — the contract is fixed above.

### Phase 2C — Neo4j init
Run constraint/index Cypher (above) once before indexer processes any events.
Use `src/db/init.ts` called at startup before listeners activate.

### Phase 3 — Veyra integration
Veyra queries `http://zwm-indexer:4000/graphql` for world state before each
inference call. Context injection layer: build after Phases 2A/B/C have data flowing.

### Phase 4 — Governance + Economics Foundation
Build the architectural layers that position ZWM for 100-year vertical scaling:

1. **Objective Register** — `src/governance/` module: persistent goal representation
   on Neo4j graph, queryable by Veyra for goal-directed reasoning
2. **Treaty Layer** — `src/governance/treaty-writer.ts`: bilateral jurisdictional
   compliance attestations extending Civium's GCP
3. **Fee Engine** — `src/economics/fee-engine.ts`: basis-point fees on cross-platform
   ZUSDC settlements (the SWIFT model)
4. **Scale Coherence** — `src/economics/scale-coherence.ts`: D7 omega_max envelope
   evaluator for OMEGA-VEB-1

See `docs/strategic/zwm-recursive-limitations.md` for the full limitations analysis
and 100-year positioning strategy.

---

## Green-Path Validation Test

Before wiring all eight platforms, validate the full pipe with Civium → Aureon only:

```
tests/civium-e2e.ts:
1. Call Civium instruction on devnet → triggers ComplianceStateChange emission
2. Listener picks up program log (confirm in console)
3. Parser deserializes event (confirm typed payload logged)
4. Neo4j writer creates WorldActor + ComplianceState + SubstrateEvent nodes
5. Causal engine evaluates rule → calls aureon/zwm/ingest
6. Aureon writes new ProcurementState with CAUSED_BY edge
7. Query Neo4j: confirm full causal chain is queryable
```

If Step 7 passes, the architecture is validated. Proceed to remaining platforms.

---

## Session Prompts for Claude Code

Use these in order. Each session has a single scope.

```
Session 1 — Scaffolding:
Create the zuup-zwm-indexer repo structure with tsconfig (strict),
package.json (deps: @coral-xyz/anchor @solana/web3.js neo4j-driver
@apollo/server axios dotenv; devDeps: typescript @types/node ts-node jest),
and the full directory layout defined in CLAUDE.md.

Session 2 — Neo4j init:
Create src/db/init.ts that runs the constraint and index Cypher
from CLAUDE.md on startup. Export an initDb() function. Call it
from index.ts before any listeners start.

Session 3 — Civium emit (Rust):
Read ./civium/programs/civium/src/lib.rs. Add the ComplianceStateChange
#[event] struct from CLAUDE.md. Add emit!() calls in the relevant
instruction handlers. Show me the diff before writing.

Session 4 — Civium parser (TypeScript):
Read ./civium/target/idl/civium.json. Create src/parsers/civium-parser.ts
using EventParser from @coral-xyz/anchor. Parse ComplianceStateChange
events from raw Solana logs. Return typed CiviumStatePayload objects.

Session 5 — Compliance writer (Neo4j):
Create src/writers/compliance-writer.ts implementing writeComplianceState().
Follow the append-only pattern: merge WorldActor, create ComplianceState,
wire SUPERSEDES to previous current state, attach HAS_STATE, create
SubstrateEvent. All inside a single executeWrite transaction.

Session 6 — Causal engine:
Create src/causal/propagation-engine.ts and config/causal-rules.ts with
the rules from CLAUDE.md. Engine evaluates matching rules after each write
and calls the target platform's POST /zwm/ingest endpoint. Errors per-effect
should not block other effects.

Session 7 — Aureon ingest endpoint:
Read ./aureon/src/ (identify the FastAPI or existing service entry point).
Add POST /zwm/ingest with RECALCULATE_FIT_IQ and UPDATE_RISK_PRIORS
action handlers. Return { eventId, status }.

Session 8 — GraphQL API:
Create src/api/graphql-server.ts with Apollo Server. Implement worldState,
entitiesByCompliance, causalChain, and compositeRisk queries against Neo4j.
Port 4000. Export startGraphQL().

Session 9 — Entry point + e2e test:
Create index.ts wiring Civium listener → parser → writer → causal engine.
Create tests/civium-e2e.ts following the green-path validation steps in
CLAUDE.md. Run it against devnet and show me the Neo4j query output.
```

### Frontend Sessions (target: khaaliswooden-max/zblackhole.io)

```
Session UI-1 — World Canvas (mock data):
Working in khaaliswooden-max/zblackhole.io.
Install react-force-graph-2d.
Create app/world/page.tsx. Render a force-directed graph
with mock ZWM state: 3 WorldActor nodes (teal #1D9E75),
6 state nodes (purple #7F77DD = compliance/procurement,
amber #EF9F27 = historical/biological), 4 SubstrateEvent
nodes (gray #888780). Edges: HAS_STATE (white 0.25 opacity),
CAUSED_BY (coral #D85A30 1.5px).
Canvas background #0a0a0a. Labels IBM Plex Mono 10px #888880.
Click a node → side panel shows id, substrate type, timestamp.
Full viewport width, 60vh height.

Session UI-2 — Homepage Integration:
Working in khaaliswooden-max/zblackhole.io.
Import the WorldCanvas component from app/world/page.tsx
into the homepage (app/page.tsx).
Replace the existing platform grid section with the canvas.
Below the canvas, add exactly three lines of copy:
  Line 1: 'The institutional world model.' (IBM Plex Sans bold 28px #f0ece4)
  Line 2: 'Nine substrates. One causal graph. Live on Solana.' (IBM Plex Mono 22px #888880)
  Line 3: 'Access the ZWM →' (IBM Plex Mono 22px #1A1A2E bold, links to /build)
Keep the chain bar (slot, TPS, program ID, pulsing dot) exactly
as-is — do not modify it.

Session UI-3 — Nav + /substrates + /build:
Working in khaaliswooden-max/zblackhole.io.
1. Update nav links: WORLD / SUBSTRATES / RESEARCH / BUILD
   (remove PLATFORMS, BENCHMARKS, SEED).
2. Create app/substrates/page.tsx. Nine substrate cards in existing
   grid layout. Each card: superpower name (large, primary), platform
   name (small, muted Courier New), benchmark signal (one number/claim),
   capability claim (one sentence), status badge (ACTIVE/DEVNET), PDF link.
   Use the nine superpower definitions from the UI/UX brief.
3. Create app/build/page.tsx. Three-column layout:
   API Access / Platform Partnership / Institutional Access.
   Each column: track name, audience description, what they get, CTA button.
   Single contact form below with track selector.

Session UI-4 — Wire Live GraphQL (post-indexer):
Working in khaaliswooden-max/zblackhole.io.
Install @apollo/client.
Replace mock data in WorldCanvas with a live useQuery hook
against http://zwm-indexer:4000/graphql.
Query: worldState for all entities, current states only
(WHERE NOT (state)-[:SUPERSEDES]->()).
Add WebSocket subscription for real-time SubstrateEvent
arrivals — pulse the relevant node on each new event.
Add error boundary: if GraphQL is unavailable, fall back
to seeded mock data silently (no error shown to visitor).
```

---

## Context Log

### 2026-04-06
**Session topic:** UI/UX direction + zblackhole.io site redesign
**Decisions made:**
- Frontend repo confirmed: `zblackhole.io` (khaaliswooden-max/zblackhole.io) — not zuup-web
- Site redesign: world model canvas replaces platform grid on homepage
- Nav updated: WORLD / SUBSTRATES / RESEARCH / BUILD
- Design tokens locked (see Section 09 of UI/UX brief)
- UI-1 through UI-3 can run immediately (mock data, no indexer dependency)
- UI-4 wires live GraphQL after zuup-zwm-indexer is deployed

**Files modified:**
- CLAUDE.md — added zblackhole.io to Repo Map, added UI session prompts

**Next action:** Initialize zblackhole.io Next.js repo, run UI-1 → UI-3.

---

### 2026-04-10
**Session topic:** ZWM recursive self-improvement limitations analysis + 100-year positioning
**Decisions made:**
- Five hard limitation classes identified and documented (volitional architecture, OMEGA-VEB-1 scale, governance scope, income mechanism, alignment ceiling)
- Five solutions designed and mapped to existing nine-platform architecture
- Core reframe established: infrastructure embedding (SWIFT/Visa model), not extraction
- Trust flywheel model: Trust → Adoption → Volume → Revenue → R&D → Capability → Trust
- Governance foundation layer built: Objective Register (ObjectiveState), Treaty Layer (TreatyAttestation)
- Economics foundation layer built: Fee Engine (FeeRecord), Scale Coherence (ScaleMetric)
- Graph schema extended: 4 new node types, 3 new edge types, 4 new causal rules
- Veyra context injection extended to include objectives, treaties, and scale metrics
- Phase 4 added to build sequence (Governance + Economics Foundation)

**Files created:**
- `docs/strategic/zwm-recursive-limitations.md` — full limitations analysis + solutions + 100-year roadmap
- `zuup-zwm-indexer/src/governance/types.ts` — governance TypeScript interfaces
- `zuup-zwm-indexer/src/governance/objective-writer.ts` — Objective Register Neo4j writer
- `zuup-zwm-indexer/src/governance/treaty-writer.ts` — Treaty attestation Neo4j writer
- `zuup-zwm-indexer/src/governance/objective-reader.ts` — Objective reader for Veyra
- `zuup-zwm-indexer/src/economics/types.ts` — economics TypeScript interfaces
- `zuup-zwm-indexer/src/economics/fee-engine.ts` — ZUSDC fee calculation engine
- `zuup-zwm-indexer/src/economics/fee-writer.ts` — fee record Neo4j writer
- `zuup-zwm-indexer/src/economics/scale-coherence.ts` — D7 Scale Coherence evaluator
- `zuup-zwm-indexer/config/scale-rules.ts` — scale coherence parameters

**Files modified:**
- CLAUDE.md — governance/economics graph schema, new causal rules, Phase 4, context log
- `zuup-zwm-indexer/src/db/init.ts` — 4 new constraints + 4 new indexes
- `zuup-zwm-indexer/config/causal-rules.ts` — 4 governance/economics rules
- `zuup-zwm-indexer/src/api/graphql-server.ts` — 4 new types + 5 new queries
- `veyra/service/src/zwm/context_client.py` — 3 new fetch functions
- `veyra/service/src/zwm/context_formatter.py` — 3 new formatter sections

**Epistemic status update:**
- Governance + Economics layers: ◐ Plausible (architecturally sound, not yet validated with live data)
- 100-year positioning: ◯ Speculative (requires jurisdictional expansion + network effects)

**Next action:** Complete Phase 2A remaining platforms, then validate governance/economics layers with test data.

---

### 2026-04-05
**Session topic:** ZWM architecture design + CLAUDE.md creation
**Decisions made:**
- Graph schema finalized: 10 node types, 5 edge types, append-only
- Causal rules defined: 8 cross-substrate propagation rules
- Anchor event contracts specified for all 8 platforms
- Ingest contract fixed: POST /zwm/ingest → { eventId, status }
- Build sequence confirmed: Civium first, then Aureon, validate pipe, then remaining 6
- CLAUDE.md is the persistent context file for all Claude Code sessions

**Open questions:**
- Actual program IDs for each platform repo (placeholder in .env.example)
- Whether Civium's existing instruction handlers use a single ix or multiple
- Neo4j hosting: local Docker vs AuraDB (decide before Session 2)

**Next action:** Create zuup-zwm-indexer repo, drop CLAUDE.md at workspace root,
run `claude` from parent directory, begin Session 1.

---

## Epistemic Standards (ZIL domain)

Per the Claude Project Standardization Framework:
- ✓ VERIFIED — grounded in implemented code or confirmed benchmark
- ◐ PLAUSIBLE — architecturally sound, not yet validated end-to-end
- ◯ SPECULATIVE — requires Phase 3+ work or external dependency

Current ZWM status: ◐ Plausible. Becomes ✓ Verified when green-path test passes.

---

*Zuup Innovation Lab · "Where Ideas Collapse Into Reality"*
*khaaliswooden@gmail.com · zuup.org · Huntsville, Alabama*
