# zuup-zwm-indexer

TypeScript service that forms the backbone of the Zuup World Model. It subscribes to
nine Solana programs via WebSocket, deserializes their Anchor events, writes append-only
state snapshots to Neo4j, evaluates causal propagation rules across substrates, and
exposes the resulting world graph via a GraphQL API and a REST API.

---

## Architecture

```
Solana Devnet (WebSocket)
        │
        ▼
   src/listeners/        one listener per platform, subscribes to program logs
        │
        ▼
   src/parsers/          Anchor EventParser deserialization → typed payload objects
        │
        ▼
   src/writers/          Neo4j Cypher writes (append-only, never mutate)
        │                WorldActor → StateNode (SUPERSEDES chain + HAS_STATE edge)
        │
        ▼
   src/causal/           propagation-engine.ts evaluates config/causal-rules.ts
        │                after every successful Neo4j write
        │
        ├──► POST /zwm/ingest   calls each target platform's ingest endpoint
        │
        ├──► GraphQL API        Apollo Server on port 4000
        │
        └──► Enterprise REST    Express on port 3001
```

---

## Prerequisites

- Node.js 18+
- Neo4j 5+ (local Docker or AuraDB)
- Solana CLI configured for devnet (for running e2e tests)

**Quick Neo4j via Docker:**

```bash
docker run --name neo4j-zwm \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password_here \
  neo4j:5
```

---

## Setup

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — at minimum set NEO4J_PASSWORD

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Initialize Neo4j (run ONCE before first startup)
npx ts-node src/db/init.ts

# 5. Start the indexer
npm start
# or for development:
npx ts-node index.ts
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SOLANA_RPC_WS` | `wss://api.devnet.solana.com` | Solana WebSocket RPC endpoint |
| `SOLANA_RPC_HTTP` | `https://api.devnet.solana.com` | Solana HTTP RPC endpoint |
| `CIVIUM_PROGRAM_ID` | `H1eSx6ij1Q296Tzss62AHuamn1rD4a9MkDapYu1CyvVM` | Civium Anchor program ID (devnet) |
| `AUREON_PROGRAM_ID` | `AurEoN5mBdZFvgFjSJGnmVZWe2FsBM3VN47L6PemxGWy` | Aureon Anchor program ID (devnet) |
| `QAL_PROGRAM_ID` | — | QAL program ID (placeholder until deployed) |
| `SYMBION_PROGRAM_ID` | — | Symbion program ID (placeholder) |
| `RELIAN_PROGRAM_ID` | — | Relian program ID (placeholder) |
| `PODX_PROGRAM_ID` | — | PodX program ID (placeholder) |
| `VEYRA_PROGRAM_ID` | — | Veyra program ID (placeholder) |
| `ZUSDC_PROGRAM_ID` | — | ZUSDC program ID (placeholder) |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j bolt connection URI |
| `NEO4J_USER` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | — | **Required.** Neo4j password |
| `AUREON_INGEST_URL` | `http://localhost:8001/zwm/ingest` | Aureon platform ingest endpoint |
| `ZUSDC_INGEST_URL` | `http://localhost:8002/zwm/ingest` | ZUSDC platform ingest endpoint |
| `PODX_INGEST_URL` | `http://localhost:8003/zwm/ingest` | PodX platform ingest endpoint |
| `VEYRA_INGEST_URL` | `http://localhost:8004/zwm/ingest` | Veyra platform ingest endpoint |
| `ZUUP_HQ_INGEST_URL` | `http://localhost:8005/zwm/ingest` | ZuupHQ platform ingest endpoint |
| `GRAPHQL_PORT` | `4000` | Apollo GraphQL server port |
| `ENTERPRISE_API_PORT` | `3001` | Enterprise REST API port |

---

## GraphQL API (port 4000)

Endpoint: `http://localhost:4000/graphql`

| Query | Description |
|---|---|
| `worldState(entityId: String)` | Current state across all substrates for one entity (or all) |
| `entitiesByCompliance(status: String)` | Entities filtered by Civium compliance status |
| `causalChain(eventId: String)` | Full CAUSED_BY chain from a SubstrateEvent |
| `compositeRisk(entityId: String)` | Aggregated risk metrics across substrates |

**Current-state Cypher pattern** (used internally):

```cypher
MATCH (actor:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
WHERE NOT (state)-[:SUPERSEDES]->()
RETURN actor, state, labels(state)[0] AS substrate
```

---

## Enterprise REST API (port 3001)

| Method | Path | Description |
|---|---|---|
| `GET` | `/enterprise/world-state/:entityId` | World state for one entity |
| `GET` | `/enterprise/risk/:entityId` | Composite risk metrics |
| `GET` | `/enterprise/causal-chain/:eventId` | Causal chain from an event |
| `POST` | `/enterprise/api-keys` | Generate an API key for a given track |

All endpoints except `POST /enterprise/api-keys` require the `X-ZWM-API-Key` header.

---

## TypeScript SDK

`@zuup/zwm-sdk` lives in `sdk/`. Build it:

```bash
cd sdk
npm install
npm run build    # outputs to sdk/dist/
```

Usage:

```typescript
import { ZwmClient } from '@zuup/zwm-sdk';

const client = new ZwmClient({
  apiUrl: 'http://localhost:3001',
  apiKey: 'your-api-key',
});

const state = await client.getWorldState('entity-id');
const risk  = await client.getCompositeRisk('entity-id');
const chain = await client.getCausalChain('event-id');
```

---

## Testing

```bash
# Unit + integration tests (Jest)
npm test

# Green-path e2e: Civium → Neo4j → causal engine → Aureon
# Requires: running Neo4j + devnet access + Civium program deployed
npx ts-node tests/civium-e2e.ts
```

The e2e test validates all 7 steps of the green-path pipe. It must pass before
adding additional platform listeners.

---

## Neo4j Graph Schema

See the **Graph Schema** section in [`../CLAUDE.md`](../CLAUDE.md) for the full
node type definitions (10 types), edge type definitions (5 types), and the
append-only write pattern.

Key principle: **never mutate nodes**. All state updates create a new node and
wire a `SUPERSEDES` edge from the new node to the previous current state.
