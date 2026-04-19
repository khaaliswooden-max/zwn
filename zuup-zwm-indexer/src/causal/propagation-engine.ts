import { EventEmitter } from 'events';
import axios from 'axios';
import { CausalRule, CAUSAL_RULES } from '../../config/causal-rules';
import { metrics } from '../lib/metrics';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;   // 1s, 4s, 16s (quadratic backoff)

// ─── Live event bus ─────────────────────────────────────────────────────────
// Downstream consumers (SSE endpoint, internal tooling) subscribe to receive
// causal events as they happen. Kept in-process: consumers must re-subscribe
// after indexer restart; no durable delivery guarantees here.

export type CausalBusEvent =
  | {
      kind: 'SUBSTRATE_EVENT';
      substrateEventId: string;
      eventType: string;
      source: string;
      payload: Record<string, unknown>;
      timestamp: number;
    }
  | {
      kind: 'CAUSAL_PROPAGATION';
      substrateEventId: string;
      ruleId: string;
      source: string;
      target: string;
      effect: string;
      params: Record<string, unknown>;
      timestamp: number;
    };

const bus = new EventEmitter();
bus.setMaxListeners(100); // room for SSE clients + internal subscribers

/**
 * Subscribe to causal bus events. Returns an unsubscribe function.
 * Listeners are invoked synchronously after each emit — keep them cheap.
 */
export function subscribeToCausalEvents(
  listener: (event: CausalBusEvent) => void,
): () => void {
  bus.on('event', listener);
  return () => {
    bus.off('event', listener);
  };
}

/** 'AUREON_INGEST_URL' → 'aureon'. Returns lowercase platform name. */
function targetPlatformFromEnvKey(envKey: string): string {
  return envKey.replace(/_INGEST_URL$/, '').toLowerCase();
}

function publish(event: CausalBusEvent): void {
  try {
    bus.emit('event', event);
  } catch (err) {
    // A misbehaving listener should never break the causal engine.
    console.error('[causal] event bus listener threw:', err);
  }
}

// Dead-letter queue for failed propagations after all retries exhausted
interface DeadLetterEntry {
  ruleId: string;
  effect: string;
  targetUrl: string;
  body: Record<string, unknown>;
  lastError: string;
  failedAt: number;
  attempts: number;
}

const deadLetterQueue: DeadLetterEntry[] = [];

/** Returns the dead-letter queue contents (for health checks / debugging). */
export function getDeadLetterQueue(): readonly DeadLetterEntry[] {
  return deadLetterQueue;
}

/** Clears the dead-letter queue (e.g., after manual review). */
export function clearDeadLetterQueue(): number {
  const count = deadLetterQueue.length;
  deadLetterQueue.length = 0;
  return count;
}

/**
 * Executes a single rule's HTTP POST with retry + exponential backoff.
 * Returns true if the POST succeeded on any attempt, false if all retries exhausted.
 */
async function fireRuleWithRetry(
  rule: CausalRule,
  targetUrl: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const maxRetries = rule.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeoutMs = rule.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startMs = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    metrics.propagationAttempts.inc({ rule: rule.id });
    try {
      const response = await axios.post<{ eventId: string; status: string }>(
        targetUrl, body, {
          timeout: timeoutMs,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      metrics.propagationLatencyMs.observe({ rule: rule.id }, Date.now() - startMs);
      console.log(
        `[causal] Rule ${rule.id} fired → ${rule.effect} @ ${targetUrl}` +
        (attempt > 0 ? ` (retry ${attempt})` : '') +
        ` — responseEventId: ${response.data.eventId}`
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (attempt < maxRetries) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(4, attempt); // 1s, 4s, 16s
        console.warn(
          `[causal] Rule ${rule.id} attempt ${attempt + 1}/${maxRetries + 1} failed ` +
          `(${rule.effect} @ ${targetUrl}): ${msg} — retrying in ${delayMs}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        // All retries exhausted — send to dead-letter queue
        metrics.propagationDeadLettered.inc({ rule: rule.id });
        metrics.propagationLatencyMs.observe({ rule: rule.id }, Date.now() - startMs);
        console.error(
          `[causal] Rule ${rule.id} DEAD-LETTERED after ${maxRetries + 1} attempts ` +
          `(${rule.effect} @ ${targetUrl}): ${msg}`
        );
        deadLetterQueue.push({
          ruleId: rule.id,
          effect: rule.effect,
          targetUrl,
          body,
          lastError: msg,
          failedAt: Date.now(),
          attempts: maxRetries + 1,
        });
        return false;
      }
    }
  }

  return false;
}

/**
 * Evaluates matching causal rules and propagates effects to target platforms.
 * Rules fire in parallel. Each rule retries independently with exponential backoff.
 * Failed rules after all retries go to a dead-letter queue.
 */
export async function evaluateAndPropagate(
  eventType: string,
  source: string,
  payload: Record<string, unknown>,
  substrateEventId: string
): Promise<void> {
  publish({
    kind: 'SUBSTRATE_EVENT',
    substrateEventId,
    eventType,
    source,
    payload,
    timestamp: Date.now(),
  });

  const matchingRules = CAUSAL_RULES.filter(
    (rule) =>
      rule.trigger === eventType &&
      rule.source === source &&
      rule.condition(payload)
  );

  if (matchingRules.length === 0) return;

  await Promise.allSettled(
    matchingRules.map(async (rule) => {
      const targetUrl = process.env[rule.targetEnvKey];
      if (!targetUrl) {
        console.warn(`[causal] No URL configured for ${rule.targetEnvKey} (rule ${rule.id})`);
        return;
      }

      const params = rule.effectParams(payload, substrateEventId);
      const body = {
        action: rule.effect,
        params,
        triggerEventId: substrateEventId,
      };

      const ok = await fireRuleWithRetry(rule, targetUrl, body);
      if (ok) {
        publish({
          kind: 'CAUSAL_PROPAGATION',
          substrateEventId,
          ruleId: rule.id,
          source,
          target: targetPlatformFromEnvKey(rule.targetEnvKey),
          effect: rule.effect,
          params,
          timestamp: Date.now(),
        });
      }
    })
  );
}
