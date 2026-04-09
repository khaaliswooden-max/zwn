import http, { IncomingMessage, ServerResponse } from 'http';
import { Driver } from 'neo4j-driver';
import { generateKey, validateKey, AccessTrack } from './api-key-store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
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
       WHERE NOT (state)-[:SUPERSEDES]->()
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
       WHERE NOT (state)-[:SUPERSEDES]->()
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
       AND NOT (cs)-[:SUPERSEDES]->()
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

// ─── Server ───────────────────────────────────────────────────────────────────

export async function startEnterpriseApi(driver: Driver): Promise<void> {
  const port = parseInt(process.env['ENTERPRISE_API_PORT'] ?? '3001', 10);

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'X-ZWM-API-Key, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      });
      res.end();
      return;
    }

    try {
      // POST /enterprise/api-keys — no auth required (bootstrap endpoint)
      if (method === 'POST' && url === '/enterprise/api-keys') {
        await handleGenerateKey(req, res);
        return;
      }

      // All other enterprise routes require a valid API key
      if (!requireApiKey(req, res)) return;

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
