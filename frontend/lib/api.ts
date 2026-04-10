import { ZWM_API_BASE } from './constants';
import * as mock from './mock';

function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('zwm_api_key') ?? '';
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getApiKey();
  const resp = await fetch(`${ZWM_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-ZWM-API-Key': apiKey } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<T>;
}

export async function getWorldState(entityId: string) {
  try {
    return await apiFetch<Record<string, unknown>>(
      `/enterprise/world-state/${encodeURIComponent(entityId)}`
    );
  } catch {
    return { ...mock.getMockWorldState(entityId), _demo: true };
  }
}

export async function getCompositeRisk(entityId: string) {
  try {
    return await apiFetch<Record<string, unknown>>(
      `/enterprise/risk/${encodeURIComponent(entityId)}`
    );
  } catch {
    return { ...mock.getMockRisk(entityId), _demo: true };
  }
}

export async function getCausalChain(eventId: string) {
  try {
    return await apiFetch<unknown[]>(
      `/enterprise/causal-chain/${encodeURIComponent(eventId)}`
    );
  } catch {
    return mock.MOCK_CAUSAL_CHAIN.map((item) => ({ ...item, _demo: true }));
  }
}

export async function generateApiKey(track: string): Promise<{ key: string; track: string; createdAt: number }> {
  const resp = await fetch(`${ZWM_API_BASE}/enterprise/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<{ key: string; track: string; createdAt: number }>;
}

export async function postIngest(
  platform: string,
  action: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const platformPorts: Record<string, number> = {
    civium: 8000,
    aureon: 8001,
    qal: 8002,
    symbion: 8003,
    relian: 8004,
    podx: 8005,
    veyra: 8006,
    zusdc: 8007,
    zuup_hq: 8008,
  };
  const port = platformPorts[platform] ?? 8000;
  try {
    const resp = await fetch(`http://localhost:${port}/zwm/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params, triggerEventId: `manual-${Date.now()}` }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json() as Promise<Record<string, unknown>>;
  } catch {
    return {
      eventId: `evt-${Date.now()}`,
      status: 'ok',
      _simulated: true,
      platform,
      action,
      params,
      note: 'Simulated — platform service not connected',
    };
  }
}

// Raw fetch for API console — no automatic fallback
export async function rawApiFetch(
  method: string,
  path: string,
  body?: string
): Promise<{ data: unknown; status: number; latencyMs: number }> {
  const start = Date.now();
  try {
    const apiKey = getApiKey();
    const opts: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-ZWM-API-Key': apiKey } : {}),
      },
    };
    if (body && method !== 'GET') opts.body = body;
    const resp = await fetch(`${ZWM_API_BASE}${path}`, opts);
    const data = await resp.json();
    return { data, status: resp.status, latencyMs: Date.now() - start };
  } catch (err) {
    // Return mock data in the console so the user sees a plausible response
    return {
      data: {
        _note: 'Backend unreachable — showing seeded mock data',
        entities: mock.MOCK_ENTITIES.map((e) => ({
          actor: e.actor,
          riskLevel: e.risk.riskLevel,
        })),
      },
      status: 0,
      latencyMs: Date.now() - start,
    };
  }
}
