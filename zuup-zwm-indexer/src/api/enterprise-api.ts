import http, { IncomingMessage, ServerResponse } from 'http';
import axios, { AxiosError } from 'axios';
import { Driver } from 'neo4j-driver';
import { generateKey, validateKey, revokeKey, listKeys, getKeyRecord, AccessTrack } from './api-key-store';
import { queryCache } from './query-cache';
import {
  getDeadLetterQueue,
  clearDeadLetterQueue,
  subscribeToCausalEvents,
} from '../causal/propagation-engine';
import { metrics } from '../lib/metrics';

// nn-service (VAE anomaly + Karpathy sequence detection). Reached via
// server-to-server only — browsers go through these authenticated proxies.
const NN_SERVICE_URL = process.env['NN_SERVICE_URL'] || 'http://localhost:5100';
const NN_TIMEOUT_MS = Number(process.env['NN_TIMEOUT_MS'] || '5000');

// ─── CORS ───────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = (process.env['CORS_ALLOWED_ORIGINS'] ?? '*')
  .split(',')
  .map((o) => o.trim());

function corsOrigin(req: IncomingMessage): string {
  const origin = req.headers['origin'] ?? '';
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  return '';
}

// ─── Rate limiter (in-memory token bucket, per API key) ─────────────────────

const TRACK_RATE_LIMITS: Record<string, number> = {
  API_ACCESS:           parseInt(process.env['RATE_LIMIT_API']          ?? '100',  10),
  PLATFORM_PARTNERSHIP: parseInt(process.env['RATE_LIMIT_PARTNER']      ?? '300',  10),
  INSTITUTIONAL:        parseInt(process.env['RATE_LIMIT_INSTITUTIONAL'] ?? '1000', 10),
};
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateBuckets = new Map<string, { tokens: number; lastRefill: number }>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket) {
    bucket = { tokens: limit, lastRefill: now };
    rateBuckets.set(key, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    bucket.tokens = limit;
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens--;
  return true;
}

// Clean stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 5;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.lastRefill < cutoff) rateBuckets.delete(key);
  }
}, 5 * 60_000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown, req?: IncomingMessage): void {
  const body = JSON.stringify(data);
  const origin = req ? corsOrigin(req) : '*';
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'X-ZWM-API-Key, Content-Type',
  });
  res.end(body);
}

function requireApiKey(req: IncomingMessage, res: ServerResponse): boolean {
  const key = req.headers['x-zwm-api-key'];
  if (typeof key !== 'string' || !validateKey(key)) {
    sendJson(res, 401, { error: 'Invalid or missing X-ZWM-API-Key header.' });
    return false;
  }
  return true;
}

function requireAdminKey(req: IncomingMessage, res: ServerResponse): boolean {
  const adminSecret = process.env['ADMIN_SECRET'];
  if (!adminSecret) {
    sendJson(res, 503, { error: 'Admin secret not configured on this server.' });
    return false;
  }
  const provided = req.headers['x-admin-secret'];
  if (typeof provided !== 'string' || provided !== adminSecret) {
    sendJson(res, 401, { error: 'Invalid or missing X-Admin-Secret header.' });
    return false;
  }
  return true;
}

/**
 * Extract the path segment after a fixed prefix.
 * Returns null if the URL does not start with the prefix or the segment is empty.
 */
function pathParam(url: string, prefix: string): string | null {
  if (!url.startsWith(prefix)) return null;
  const raw = url.slice(prefix.length).split('?')[0] ?? '';
  if (!raw) return null;
  return decodeURIComponent(raw);
}

function queryParam(url: string, key: string): string | undefined {
  const idx = url.indexOf('?');
  if (idx === -1) return undefined;
  return new URLSearchParams(url.slice(idx + 1)).get(key) ?? undefined;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
  });
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleGenerateKey(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  let track: AccessTrack = 'API_ACCESS';
  try {
    const parsed = JSON.parse(body || '{}') as { track?: AccessTrack };
    if (parsed.track && ['API_ACCESS', 'PLATFORM_PARTNERSHIP', 'INSTITUTIONAL'].includes(parsed.track)) {
      track = parsed.track;
    }
  } catch (_) { /* use default */ }
  sendJson(res, 201, generateKey(track));
}

async function handleWorldState(
  entityId: string,
  driver: Driver,
  res: ServerResponse
): Promise<void> {
  const session = driver.session();
  try {
    const actorResult = await session.run(
      'MATCH (a:WorldActor {id: $entityId}) RETURN a',
      { entityId }
    );
    if (actorResult.records.length === 0) {
      sendJson(res, 404, { error: `Entity '${entityId}' not found.` });
      return;
    }
    const actor = actorResult.records[0].get('a').properties as Record<string, unknown>;

    const stateResult = await session.run(
      `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
       WHERE state.is_current = true
       RETURN labels(state)[0] AS substrate, state`,
      { entityId }
    );

    const substrateKey: Record<string, string> = {
      ComplianceState: 'compliance',
      ProcurementState: 'procurement',
      BiologicalState: 'biological',
      HistoricalRecon: 'historical',
      MigrationState: 'migration',
      ComputeState: 'compute',
    };

    const result: Record<string, unknown> = { actor };
    for (const record of stateResult.records) {
      const substrate = record.get('substrate') as string;
      const key = substrateKey[substrate];
      if (key) result[key] = record.get('state').properties;
    }
    sendJson(res, 200, result);
  } finally {
    await session.close();
  }
}

async function handleCompositeRisk(
  entityId: string,
  driver: Driver,
  res: ServerResponse
): Promise<void> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (a:WorldActor {id: $entityId})-[:HAS_STATE]->(state)
       WHERE state.is_current = true
       RETURN labels(state)[0] AS substrate, state`,
      { entityId }
    );
    const risk: Record<string, unknown> = { entityId };
    let score = 0;

    for (const record of result.records) {
      const substrate = record.get('substrate') as string;
      const props = record.get('state').properties as Record<string, unknown>;
      if (substrate === 'ComplianceState') {
        risk['complianceStatus'] = props['status'];
        risk['complianceScore'] = props['score'];
        if (props['status'] === 'VIOLATION') score += 3;
        else if (props['status'] === 'FLAGGED') score += 1;
      } else if (substrate === 'ProcurementState') {
        risk['fitiq'] = props['fitiq'];
        if (Number(props['fitiq']) < 50) score += 2;
      } else if (substrate === 'ComputeState') {
        risk['availability'] = props['availability'];
        if (Number(props['availability']) < 0.9) score += 2;
      } else if (substrate === 'BiologicalState') {
        risk['anomalyFlag'] = props['anomaly_flag'];
        if (props['anomaly_flag']) score += 2;
      }
    }

    risk['riskLevel'] = score >= 5 ? 'CRITICAL' : score >= 3 ? 'HIGH' : score >= 1 ? 'MEDIUM' : 'LOW';
    sendJson(res, 200, risk);
  } finally {
    await session.close();
  }
}

async function handleEntitiesByCompliance(
  status: string,
  url: string,
  driver: Driver,
  res: ServerResponse
): Promise<void> {
  const domain = queryParam(url, 'domain');
  const session = driver.session();
  try {
    const domainFilter = domain ? 'AND cs.domain = $domain' : '';
    const result = await session.run(
      `MATCH (a:WorldActor)-[:HAS_STATE]->(cs:ComplianceState)
       WHERE cs.status = $status ${domainFilter}
       AND cs.is_current = true
       RETURN DISTINCT a`,
      { status, domain }
    );
    sendJson(res, 200, result.records.map((r) => r.get('a').properties));
  } finally {
    await session.close();
  }
}

async function handleCausalChain(
  eventId: string,
  driver: Driver,
  res: ServerResponse
): Promise<void> {
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (e:SubstrateEvent {id: $eventId})<-[:CAUSED_BY]-(effect)
       RETURN e, effect`,
      { eventId }
    );
    sendJson(res, 200, result.records.map((r) => ({
      event: r.get('e').properties,
      effect: r.get('effect').properties,
    })));
  } finally {
    await session.close();
  }
}

// ─── Build page HTML ─────────────────────────────────────────────────────────

const BUILD_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ZWM Build — Zuup World Model</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #0a0a0a;
    --surface: #111111;
    --border:  #222222;
    --text:    #f0ece4;
    --muted:   #888880;
    --teal:    #1D9E75;
    --purple:  #7F77DD;
    --amber:   #EF9F27;
    --coral:   #D85A30;
    --mono: 'IBM Plex Mono', monospace;
    --sans: 'IBM Plex Sans', sans-serif;
  }
  body { background: var(--bg); color: var(--text); font-family: var(--mono); min-height: 100vh; }

  /* ── Header ── */
  header { border-bottom: 1px solid var(--border); padding: 24px 48px; display: flex; align-items: center; justify-content: space-between; }
  .logo { font-family: var(--sans); font-weight: 700; font-size: 15px; letter-spacing: 0.08em; color: var(--teal); }
  .header-meta { font-size: 11px; color: var(--muted); }

  /* ── Hero ── */
  .hero { padding: 72px 48px 48px; max-width: 720px; }
  .hero h1 { font-family: var(--sans); font-size: 36px; font-weight: 700; line-height: 1.15; margin-bottom: 16px; }
  .hero p { font-size: 14px; color: var(--muted); line-height: 1.7; }

  /* ── Tracks ── */
  .tracks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border); margin: 0 0 0 0; }
  .track { background: var(--bg); padding: 40px 40px 48px; display: flex; flex-direction: column; }
  .track-badge { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 20px; }
  .track-badge.api      { color: var(--teal); }
  .track-badge.partner  { color: var(--purple); }
  .track-badge.inst     { color: var(--amber); }
  .track h2 { font-family: var(--sans); font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  .track .audience { font-size: 12px; color: var(--muted); line-height: 1.6; margin-bottom: 24px; }
  .track ul { list-style: none; flex: 1; margin-bottom: 32px; }
  .track ul li { font-size: 12px; color: var(--muted); padding: 6px 0; border-bottom: 1px solid var(--border); }
  .track ul li::before { content: '→ '; color: var(--teal); }
  .btn { display: inline-block; font-family: var(--mono); font-size: 12px; font-weight: 600; padding: 10px 20px; border: 1px solid; cursor: pointer; text-align: center; transition: opacity 0.15s; background: transparent; }
  .btn:hover { opacity: 0.75; }
  .btn-teal   { color: var(--teal);   border-color: var(--teal); }
  .btn-purple { color: var(--purple); border-color: var(--purple); }
  .btn-amber  { color: var(--amber);  border-color: var(--amber); }

  /* ── API Key Generator ── */
  .key-section { border-top: 1px solid var(--border); padding: 48px; }
  .key-section h2 { font-family: var(--sans); font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  .key-section p  { font-size: 12px; color: var(--muted); margin-bottom: 24px; }
  .key-form { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
  select { background: var(--surface); color: var(--text); border: 1px solid var(--border); font-family: var(--mono); font-size: 12px; padding: 9px 14px; }
  .key-output { font-size: 13px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 2px; display: none; }
  .key-output .key-value { color: var(--teal); word-break: break-all; }
  .key-output .key-meta  { font-size: 11px; color: var(--muted); margin-top: 8px; }
  .copy-btn { font-size: 10px; color: var(--muted); background: none; border: none; cursor: pointer; font-family: var(--mono); margin-left: 8px; }
  .copy-btn:hover { color: var(--text); }

  /* ── SDK Quickstart ── */
  .quickstart { border-top: 1px solid var(--border); padding: 48px; }
  .quickstart h2 { font-family: var(--sans); font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  .quickstart .sub { font-size: 12px; color: var(--muted); margin-bottom: 32px; }
  .steps { display: flex; flex-direction: column; gap: 32px; }
  .step-label { font-size: 10px; letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; }
  pre { background: var(--surface); border: 1px solid var(--border); padding: 20px 24px; overflow-x: auto; font-family: var(--mono); font-size: 12px; line-height: 1.7; position: relative; }
  .copy-pre { position: absolute; top: 10px; right: 12px; font-size: 10px; color: var(--muted); background: none; border: none; cursor: pointer; font-family: var(--mono); }
  .copy-pre:hover { color: var(--text); }
  .kw  { color: var(--purple); }
  .str { color: var(--teal); }
  .cmt { color: var(--muted); }
  .fn  { color: var(--amber); }

  /* ── API Reference ── */
  .api-ref { border-top: 1px solid var(--border); padding: 48px; }
  .api-ref h2 { font-family: var(--sans); font-size: 18px; font-weight: 700; margin-bottom: 8px; }
  .api-ref .sub { font-size: 12px; color: var(--muted); margin-bottom: 32px; }
  .endpoint { border: 1px solid var(--border); margin-bottom: 12px; }
  .endpoint-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px; background: var(--surface); cursor: pointer; user-select: none; }
  .method { font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 2px; }
  .method.get  { background: #1a3a2a; color: var(--teal); }
  .method.post { background: #2a2030; color: var(--purple); }
  .endpoint-path { font-size: 13px; flex: 1; }
  .endpoint-desc { font-size: 11px; color: var(--muted); }
  .endpoint-body { padding: 20px 18px; display: none; border-top: 1px solid var(--border); }
  .endpoint-body.open { display: block; }
  .param-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .param-table th { text-align: left; color: var(--muted); font-weight: 400; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  .param-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .param-table td:first-child { color: var(--teal); font-weight: 600; white-space: nowrap; }
  .param-table td:last-child  { color: var(--muted); }
  .required { color: var(--coral); font-size: 9px; margin-left: 4px; }

  /* ── Footer ── */
  footer { border-top: 1px solid var(--border); padding: 24px 48px; display: flex; justify-content: space-between; align-items: center; }
  footer span { font-size: 11px; color: var(--muted); }
</style>
</head>
<body>

<header>
  <span class="logo">ZUUP / BUILD</span>
  <span class="header-meta">Enterprise REST API &nbsp;:&nbsp; port 3001 &nbsp;|&nbsp; GraphQL &nbsp;:&nbsp; port 4000</span>
</header>

<div class="hero">
  <h1>Three ways to access the ZWM.</h1>
  <p>The Zuup World Model is a live Neo4j causal graph fed by nine Solana-deployed substrates. Choose the access track that fits your use case — then generate an API key and start querying in minutes.</p>
</div>

<div class="tracks">
  <div class="track">
    <div class="track-badge api">API Access</div>
    <h2>Developers</h2>
    <p class="audience">Technical teams that want to query world state, run compliance filters, and pull causal chains directly via REST or GraphQL.</p>
    <ul>
      <li>API key + REST endpoints (port 3001)</li>
      <li>GraphQL schema (port 4000)</li>
      <li><code>@zuup/zwm-sdk</code> TypeScript client</li>
      <li>worldState, compositeRisk, causalChain queries</li>
      <li>Full read access, devnet data</li>
    </ul>
    <button class="btn btn-teal" onclick="scrollToKey('API_ACCESS')">Generate API Key →</button>
  </div>

  <div class="track">
    <div class="track-badge partner">Platform Partnership</div>
    <h2>Integrators</h2>
    <p class="audience">Organizations running Solana programs that want to join the ZWM graph as a substrate — emitting events and receiving causal triggers.</p>
    <ul>
      <li>Substrate onboarding spec</li>
      <li><code>#[event]</code> Anchor contract template</li>
      <li><code>POST /zwm/ingest</code> action contract</li>
      <li>Causal rule co-authoring</li>
      <li>Dedicated listener + parser build</li>
    </ul>
    <button class="btn btn-purple" onclick="scrollToKey('PLATFORM_PARTNERSHIP')">Partner Request →</button>
  </div>

  <div class="track">
    <div class="track-badge inst">Institutional Access</div>
    <h2>Enterprise Buyers</h2>
    <p class="audience">Institutions that need live composite risk scores, full causal audit trails, on-chain attestations, and Veyra reasoning output for procurement and compliance decisions.</p>
    <ul>
      <li>Full FullWorldState read access</li>
      <li>Veyra reasoning triggers (POST /zwm/ingest)</li>
      <li>ZuupHQ on-chain attestations</li>
      <li>ZUSDC settlement flag visibility</li>
      <li>Dedicated SLA + support</li>
    </ul>
    <button class="btn btn-amber" onclick="scrollToKey('INSTITUTIONAL')">Contact Sales →</button>
  </div>
</div>

<!-- ── API Key Generator ───────────────────────────────────────────────────── -->
<div class="key-section" id="key-generator">
  <h2>Generate an API Key</h2>
  <p>Keys are provisioned instantly. Store the key — it is shown once. All data endpoints require the <code>X-ZWM-API-Key</code> header.</p>
  <div class="key-form">
    <select id="track-select">
      <option value="API_ACCESS">API Access</option>
      <option value="PLATFORM_PARTNERSHIP">Platform Partnership</option>
      <option value="INSTITUTIONAL">Institutional</option>
    </select>
    <button class="btn btn-teal" onclick="generateKey()">Generate Key</button>
  </div>
  <div class="key-output" id="key-output">
    <div>
      <span id="key-value" class="key-value"></span>
      <button class="copy-btn" onclick="copyKey()">[ copy ]</button>
    </div>
    <div class="key-meta" id="key-meta"></div>
  </div>
</div>

<!-- ── SDK Quickstart ─────────────────────────────────────────────────────── -->
<div class="quickstart">
  <h2>SDK Quickstart</h2>
  <p class="sub">From zero to a live ZWM query in three steps. Replace <code>YOUR_KEY</code> with the key generated above.</p>

  <div class="steps">
    <div>
      <div class="step-label">Step 1 &mdash; Install</div>
      <pre id="pre-install"><button class="copy-pre" onclick="copyPre('pre-install')">copy</button><span class="cmt"># Clone the repo and build the SDK locally (npm publish coming post-audit)</span>
git clone https://github.com/khaaliswooden-max/zwn
cd zwn/zuup-zwm-indexer/sdk
npm install
npx tsc</pre>
    </div>

    <div>
      <div class="step-label">Step 2 &mdash; Instantiate</div>
      <pre id="pre-init"><button class="copy-pre" onclick="copyPre('pre-init')">copy</button><span class="kw">import</span> { <span class="fn">ZWMClient</span> } <span class="kw">from</span> <span class="str">'./sdk'</span>;

<span class="kw">const</span> client = <span class="kw">new</span> <span class="fn">ZWMClient</span>(
  <span class="str">'YOUR_KEY'</span>,
  <span class="str">'http://localhost:3001'</span>  <span class="cmt">// default; omit if running locally</span>
);</pre>
    </div>

    <div>
      <div class="step-label">Step 3 &mdash; Query</div>
      <pre id="pre-query"><button class="copy-pre" onclick="copyPre('pre-query')">copy</button><span class="cmt">// Full world state across all substrates</span>
<span class="kw">const</span> state = <span class="kw">await</span> client.<span class="fn">getWorldState</span>(<span class="str">'supplier-abc'</span>);
console.<span class="fn">log</span>(state.compliance?.status);   <span class="cmt">// "COMPLIANT" | "VIOLATION" | "FLAGGED"</span>
console.<span class="fn">log</span>(state.procurement?.fitiq);   <span class="cmt">// 0-100</span>

<span class="cmt">// Composite risk (single-field risk score)</span>
<span class="kw">const</span> risk = <span class="kw">await</span> client.<span class="fn">getCompositeRisk</span>(<span class="str">'supplier-abc'</span>);
console.<span class="fn">log</span>(risk.riskLevel);  <span class="cmt">// "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"</span>

<span class="cmt">// Entities in violation across a compliance domain</span>
<span class="kw">const</span> flagged = <span class="kw">await</span> client.<span class="fn">getEntitiesByCompliance</span>(<span class="str">'VIOLATION'</span>, <span class="str">'halal'</span>);

<span class="cmt">// Full causal chain for a SubstrateEvent</span>
<span class="kw">const</span> chain = <span class="kw">await</span> client.<span class="fn">getCausalChain</span>(<span class="str">'event-id'</span>);</pre>
    </div>

    <div>
      <div class="step-label">Direct REST (no SDK)</div>
      <pre id="pre-curl"><button class="copy-pre" onclick="copyPre('pre-curl')">copy</button><span class="cmt"># World state</span>
curl -H <span class="str">"X-ZWM-API-Key: YOUR_KEY"</span> \\
  http://localhost:3001/enterprise/world-state/supplier-abc

<span class="cmt"># Composite risk</span>
curl -H <span class="str">"X-ZWM-API-Key: YOUR_KEY"</span> \\
  http://localhost:3001/enterprise/risk/supplier-abc

<span class="cmt"># Entities in violation, halal domain</span>
curl -H <span class="str">"X-ZWM-API-Key: YOUR_KEY"</span> \\
  "http://localhost:3001/enterprise/compliance/VIOLATION?domain=halal"

<span class="cmt"># Causal chain for an event</span>
curl -H <span class="str">"X-ZWM-API-Key: YOUR_KEY"</span> \\
  http://localhost:3001/enterprise/causal-chain/EVENT_ID

<span class="cmt"># GraphQL (no key required — direct Neo4j queries)</span>
curl -X POST http://localhost:4000/graphql \\
  -H <span class="str">"Content-Type: application/json"</span> \\
  -d <span class="str">'{"query":"{ compositeRisk(entityId:\\"supplier-abc\\") { riskLevel fitiq } }"}'</span></pre>
    </div>
  </div>
</div>

<!-- ── API Reference ───────────────────────────────────────────────────────── -->
<div class="api-ref">
  <h2>API Reference</h2>
  <p class="sub">All endpoints except <code>POST /enterprise/api-keys</code> require the <code>X-ZWM-API-Key</code> header. CORS is open for browser usage.</p>

  <div class="endpoint">
    <div class="endpoint-header" onclick="toggleEndpoint(this)">
      <span class="method post">POST</span>
      <span class="endpoint-path">/enterprise/api-keys</span>
      <span class="endpoint-desc">Generate a new API key — no auth required</span>
    </div>
    <div class="endpoint-body">
      <table class="param-table">
        <tr><th>Field</th><th>Type</th><th>Description</th></tr>
        <tr><td>track</td><td>string</td><td><code>API_ACCESS</code> | <code>PLATFORM_PARTNERSHIP</code> | <code>INSTITUTIONAL</code> (default: API_ACCESS)</td></tr>
      </table>
      <pre style="margin-top:12px"><span class="cmt">// Response 201</span>
{ <span class="str">"key"</span>: <span class="str">"zwm_abc123..."</span>, <span class="str">"track"</span>: <span class="str">"API_ACCESS"</span>, <span class="str">"createdAt"</span>: 1712345678000 }</pre>
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-header" onclick="toggleEndpoint(this)">
      <span class="method get">GET</span>
      <span class="endpoint-path">/enterprise/world-state/:entityId</span>
      <span class="endpoint-desc">Full current state across all substrates</span>
    </div>
    <div class="endpoint-body">
      <table class="param-table">
        <tr><th>Param</th><th>Type</th><th>Description</th></tr>
        <tr><td>entityId<span class="required">required</span></td><td>path</td><td>WorldActor id (URL-encoded)</td></tr>
      </table>
      <pre style="margin-top:12px"><span class="cmt">// Response 200 — FullWorldState</span>
{
  <span class="str">"actor"</span>: { <span class="str">"id"</span>: <span class="str">"supplier-abc"</span>, <span class="str">"created_at"</span>: 1712000000 },
  <span class="str">"compliance"</span>:  { <span class="str">"status"</span>: <span class="str">"COMPLIANT"</span>, <span class="str">"score"</span>: 92, <span class="str">"domain"</span>: <span class="str">"halal"</span> },
  <span class="str">"procurement"</span>: { <span class="str">"fitiq"</span>: 78, <span class="str">"upd"</span>: 81 },
  <span class="str">"compute"</span>:     { <span class="str">"xdop_score"</span>: 95, <span class="str">"availability"</span>: 0.9999 }
}</pre>
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-header" onclick="toggleEndpoint(this)">
      <span class="method get">GET</span>
      <span class="endpoint-path">/enterprise/risk/:entityId</span>
      <span class="endpoint-desc">Composite risk score aggregated across substrates</span>
    </div>
    <div class="endpoint-body">
      <table class="param-table">
        <tr><th>Param</th><th>Type</th><th>Description</th></tr>
        <tr><td>entityId<span class="required">required</span></td><td>path</td><td>WorldActor id</td></tr>
      </table>
      <pre style="margin-top:12px"><span class="cmt">// Response 200 — CompositeRisk</span>
{
  <span class="str">"entityId"</span>: <span class="str">"supplier-abc"</span>,
  <span class="str">"complianceStatus"</span>: <span class="str">"COMPLIANT"</span>,
  <span class="str">"complianceScore"</span>: 92,
  <span class="str">"fitiq"</span>: 78,
  <span class="str">"availability"</span>: 0.9999,
  <span class="str">"anomalyFlag"</span>: <span class="kw">false</span>,
  <span class="str">"riskLevel"</span>: <span class="str">"LOW"</span>  <span class="cmt">// LOW | MEDIUM | HIGH | CRITICAL</span>
}</pre>
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-header" onclick="toggleEndpoint(this)">
      <span class="method get">GET</span>
      <span class="endpoint-path">/enterprise/compliance/:status</span>
      <span class="endpoint-desc">All entities at the given compliance status</span>
    </div>
    <div class="endpoint-body">
      <table class="param-table">
        <tr><th>Param</th><th>Type</th><th>Description</th></tr>
        <tr><td>status<span class="required">required</span></td><td>path</td><td><code>COMPLIANT</code> | <code>VIOLATION</code> | <code>FLAGGED</code></td></tr>
        <tr><td>domain</td><td>query</td><td>Filter by domain: <code>halal</code> | <code>esg</code> | <code>itar</code></td></tr>
      </table>
      <pre style="margin-top:12px"><span class="cmt">// Response 200 — WorldActor[]</span>
[{ <span class="str">"id"</span>: <span class="str">"supplier-abc"</span> }, { <span class="str">"id"</span>: <span class="str">"supplier-xyz"</span> }]</pre>
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-header" onclick="toggleEndpoint(this)">
      <span class="method get">GET</span>
      <span class="endpoint-path">/enterprise/causal-chain/:eventId</span>
      <span class="endpoint-desc">All effect nodes caused by a SubstrateEvent</span>
    </div>
    <div class="endpoint-body">
      <table class="param-table">
        <tr><th>Param</th><th>Type</th><th>Description</th></tr>
        <tr><td>eventId<span class="required">required</span></td><td>path</td><td>SubstrateEvent id (UUID)</td></tr>
      </table>
      <pre style="margin-top:12px"><span class="cmt">// Response 200 — CausalLink[]</span>
[{
  <span class="str">"event"</span>: { <span class="str">"id"</span>: <span class="str">"event-abc"</span>, <span class="str">"type"</span>: <span class="str">"COMPLIANCE_STATE_CHANGE"</span>, <span class="str">"source"</span>: <span class="str">"civium"</span> },
  <span class="str">"effect"</span>: { <span class="str">"id"</span>: <span class="str">"proc-xyz"</span>, <span class="str">"fitiq"</span>: 47, <span class="str">"entity_id"</span>: <span class="str">"supplier-abc"</span> }
}]</pre>
    </div>
  </div>
</div>

<footer>
  <span>Zuup Innovation Lab &nbsp;·&nbsp; Huntsville, Alabama &nbsp;·&nbsp; zuup.org</span>
  <span>ZWM Enterprise API v0.1.0 &nbsp;·&nbsp; Solana Devnet</span>
</footer>

<script>
  function scrollToKey(track) {
    document.getElementById('track-select').value = track;
    document.getElementById('key-generator').scrollIntoView({ behavior: 'smooth' });
    setTimeout(generateKey, 400);
  }

  async function generateKey() {
    const track = document.getElementById('track-select').value;
    const out   = document.getElementById('key-output');
    const kv    = document.getElementById('key-value');
    const km    = document.getElementById('key-meta');
    try {
      const res  = await fetch('/enterprise/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track })
      });
      const data = await res.json();
      kv.textContent = data.key;
      km.textContent = 'Track: ' + data.track + '  ·  Created: ' + new Date(data.createdAt).toISOString();
      out.style.display = 'block';
    } catch (e) {
      kv.textContent = 'Error generating key. Is the server running?';
      out.style.display = 'block';
    }
  }

  function copyKey() {
    navigator.clipboard.writeText(document.getElementById('key-value').textContent);
  }

  function copyPre(id) {
    const pre  = document.getElementById(id);
    const text = pre.innerText.replace(/^copy\\n/, '');
    navigator.clipboard.writeText(text);
  }

  function toggleEndpoint(header) {
    const body = header.nextElementSibling;
    body.classList.toggle('open');
  }
</script>
</body>
</html>`;

// ─── nn-service proxy ───────────────────────────────────────────────────────
// Thin pass-through to the Python neural-net service. Keeps the API key
// boundary intact (the browser never talks to :5100 directly) and lets us
// enforce rate limits per track via the same bucket as the rest of the API.

async function proxyToNnService(
  req: IncomingMessage,
  res: ServerResponse,
  upstreamPath: string,
): Promise<void> {
  try {
    const body = await readBody(req);
    let payload: unknown;
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON body.' }, req);
      return;
    }

    const response = await axios.post(`${NN_SERVICE_URL}${upstreamPath}`, payload, {
      timeout: NN_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
      // Forward upstream errors rather than retrying — the browser sees them.
      validateStatus: () => true,
    });

    sendJson(res, response.status, response.data, req);
  } catch (err) {
    const axErr = err as AxiosError;
    const status = axErr.code === 'ECONNABORTED' ? 504 : 502;
    const message =
      axErr.code === 'ECONNREFUSED'
        ? 'nn-service unreachable.'
        : axErr.message || 'nn-service proxy error.';
    sendJson(res, status, { error: message, upstream: upstreamPath }, req);
  }
}

// ─── SSE stream ──────────────────────────────────────────────────────────────
// Live causal-event push for browser clients. EventSource can't send custom
// headers, so we accept the API key as either `X-ZWM-API-Key` or `?apiKey=…`.

const SSE_HEARTBEAT_MS = 15_000;

function handleEventStream(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '';
  const headerKey = req.headers['x-zwm-api-key'];
  const queryKey = queryParam(url, 'apiKey');
  const apiKey = typeof headerKey === 'string' ? headerKey : queryKey;

  if (!apiKey || !validateKey(apiKey)) {
    sendJson(res, 401, { error: 'Invalid or missing API key.' }, req);
    return;
  }

  const keyRecord = getKeyRecord(apiKey);
  const rateLimit = TRACK_RATE_LIMITS[keyRecord?.track ?? 'API_ACCESS'] ?? 100;
  if (!checkRateLimit(apiKey, rateLimit)) {
    sendJson(res, 429, { error: 'Rate limit exceeded.' }, req);
    return;
  }

  const origin = corsOrigin(req);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  });

  // Initial comment flushes headers and opens the stream on the client.
  res.write(`: connected ${Date.now()}\n\n`);

  const unsubscribe = subscribeToCausalEvents((event) => {
    // Writable check prevents EPIPE after client disconnect.
    if (!res.writable) return;
    res.write(`event: ${event.kind}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    if (!res.writable) return;
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
}

// ─── Server ───────────────────────────────────────────────────────────────────

export async function startEnterpriseApi(driver: Driver): Promise<void> {
  const port = parseInt(process.env['ENTERPRISE_API_PORT'] ?? '3001', 10);

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // CORS preflight
    if (method === 'OPTIONS') {
      const origin = corsOrigin(req);
      res.writeHead(204, {
        ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
        'Access-Control-Allow-Headers': 'X-ZWM-API-Key, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    try {
      // GET / — serve the /build page
      if (method === 'GET' && (url === '/' || url === '/build')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(BUILD_PAGE_HTML);
        return;
      }

      // GET /health — public health check (no auth)
      if (method === 'GET' && url === '/health') {
        const dlq = getDeadLetterQueue();
        sendJson(res, 200, {
          status: 'ok',
          uptime: process.uptime(),
          cache: queryCache.stats(),
          metrics: metrics.toJSON(),
          deadLetterQueue: { size: dlq.length, entries: dlq.slice(-10) },
          timestamp: Date.now(),
        });
        return;
      }

      // GET /metrics — Prometheus text exposition format (no auth, scraped by monitoring)
      if (method === 'GET' && url === '/metrics') {
        res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        res.end(metrics.toPrometheus());
        return;
      }

      // POST /enterprise/clear-dead-letters — admin only
      if (method === 'POST' && url === '/enterprise/clear-dead-letters') {
        if (!requireAdminKey(req, res)) return;
        const cleared = clearDeadLetterQueue();
        sendJson(res, 200, { cleared, status: 'ok' });
        return;
      }

      // POST /enterprise/api-keys — admin only
      if (method === 'POST' && url === '/enterprise/api-keys') {
        if (!requireAdminKey(req, res)) return;
        await handleGenerateKey(req, res);
        return;
      }

      // GET /enterprise/api-keys — list all keys (admin only)
      if (method === 'GET' && url === '/enterprise/api-keys') {
        if (!requireAdminKey(req, res)) return;
        sendJson(res, 200, listKeys());
        return;
      }

      // DELETE /enterprise/api-keys/:key — revoke a key (admin only)
      const revokeTarget = pathParam(url, '/enterprise/api-keys/');
      if (method === 'DELETE' && revokeTarget !== null) {
        if (!requireAdminKey(req, res)) return;
        const ok = revokeKey(revokeTarget);
        sendJson(res, ok ? 200 : 404, { revoked: ok });
        return;
      }

      // GET /enterprise/events/stream — SSE live feed of causal events.
      // Handles its own auth (supports ?apiKey= for browser EventSource).
      if (method === 'GET' && (url === '/enterprise/events/stream' || url.startsWith('/enterprise/events/stream?'))) {
        handleEventStream(req, res);
        return;
      }

      // All other enterprise routes require a valid API key
      if (!requireApiKey(req, res)) return;

      // Rate limiting (per API key, track-based limits)
      const apiKey = req.headers['x-zwm-api-key'] as string;
      const keyRecord = getKeyRecord(apiKey);
      const rateLimit = TRACK_RATE_LIMITS[keyRecord?.track ?? 'API_ACCESS'] ?? 100;
      if (!checkRateLimit(apiKey, rateLimit)) {
        sendJson(res, 429, { error: 'Rate limit exceeded. Try again in 60 seconds.' }, req);
        return;
      }

      // GET /enterprise/world-state/:entityId
      const entityId = pathParam(url, '/enterprise/world-state/');
      if (method === 'GET' && entityId !== null) {
        await handleWorldState(entityId, driver, res);
        return;
      }

      // GET /enterprise/risk/:entityId
      const riskId = pathParam(url, '/enterprise/risk/');
      if (method === 'GET' && riskId !== null) {
        await handleCompositeRisk(riskId, driver, res);
        return;
      }

      // GET /enterprise/compliance/:status[?domain=halal]
      const compStatus = pathParam(url, '/enterprise/compliance/');
      if (method === 'GET' && compStatus !== null) {
        await handleEntitiesByCompliance(compStatus, url, driver, res);
        return;
      }

      // GET /enterprise/causal-chain/:eventId
      const eventId = pathParam(url, '/enterprise/causal-chain/');
      if (method === 'GET' && eventId !== null) {
        await handleCausalChain(eventId, driver, res);
        return;
      }

      // POST /enterprise/nn/anomaly/batch — VAE batch anomaly detection proxy
      if (method === 'POST' && url === '/enterprise/nn/anomaly/batch') {
        await proxyToNnService(req, res, '/detect/anomaly/batch');
        return;
      }

      // POST /enterprise/nn/karpathy/detect — Karpathy sequence anomaly proxy
      if (method === 'POST' && url === '/enterprise/nn/karpathy/detect') {
        await proxyToNnService(req, res, '/karpathy/detect');
        return;
      }

      sendJson(res, 404, { error: 'Not found.' });
    } catch (err) {
      console.error('[enterprise-api] Unhandled error:', err);
      sendJson(res, 500, { error: 'Internal server error.' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, resolve);
  });

  console.log(`[enterprise-api] ZWM Enterprise REST API running on port ${port}`);
}
