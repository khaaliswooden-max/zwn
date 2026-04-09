import axios, { AxiosInstance } from 'axios';
import type {
  WorldActor,
  FullWorldState,
  CompositeRisk,
  CausalLink,
} from './types';

export * from './types';

/**
 * ZWMClient — TypeScript client for the ZWM Enterprise REST API.
 *
 * Usage:
 *   import { ZWMClient } from '@zuup/zwm-sdk';
 *   const client = new ZWMClient('zwm_yourApiKey');
 *
 *   const state = await client.getWorldState('supplier-abc');
 *   const risk  = await client.getCompositeRisk('supplier-abc');
 */
export class ZWMClient {
  private http: AxiosInstance;

  /**
   * @param apiKey  - API key obtained from POST /enterprise/api-keys
   * @param baseUrl - Enterprise API base URL (default: http://localhost:3001)
   */
  constructor(apiKey: string, baseUrl = 'http://localhost:3001') {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ''),
      headers: { 'X-ZWM-API-Key': apiKey },
      timeout: 10_000,
    });
  }

  /**
   * Full current world state for an entity across all substrates.
   * Returns the current (non-superseded) node for each substrate.
   */
  async getWorldState(entityId: string): Promise<FullWorldState> {
    const { data } = await this.http.get<FullWorldState>(
      `/enterprise/world-state/${encodeURIComponent(entityId)}`
    );
    return data;
  }

  /**
   * Composite risk score for an entity.
   * Aggregates compliance status, FitIQ, compute availability, and biological anomalies
   * into a single riskLevel: LOW | MEDIUM | HIGH | CRITICAL.
   */
  async getCompositeRisk(entityId: string): Promise<CompositeRisk> {
    const { data } = await this.http.get<CompositeRisk>(
      `/enterprise/risk/${encodeURIComponent(entityId)}`
    );
    return data;
  }

  /**
   * All entities currently in the given compliance status.
   * @param status - "COMPLIANT" | "VIOLATION" | "FLAGGED"
   * @param domain - Optional domain filter: "halal" | "esg" | "itar"
   */
  async getEntitiesByCompliance(status: string, domain?: string): Promise<WorldActor[]> {
    const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
    const { data } = await this.http.get<WorldActor[]>(
      `/enterprise/compliance/${encodeURIComponent(status)}${params}`
    );
    return data;
  }

  /**
   * Full causal chain for a SubstrateEvent.
   * Returns all effect nodes that were CAUSED_BY this event.
   */
  async getCausalChain(substrateEventId: string): Promise<CausalLink[]> {
    const { data } = await this.http.get<CausalLink[]>(
      `/enterprise/causal-chain/${encodeURIComponent(substrateEventId)}`
    );
    return data;
  }
}
