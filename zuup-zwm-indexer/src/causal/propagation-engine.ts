import axios from 'axios';
import { CAUSAL_RULES } from '../../config/causal-rules';

export async function evaluateAndPropagate(
  eventType: string,
  source: string,
  payload: Record<string, unknown>,
  substrateEventId: string
): Promise<void> {
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

      const body = {
        action: rule.effect,
        params: rule.effectParams(payload, substrateEventId),
        triggerEventId: substrateEventId,
      };

      try {
        const response = await axios.post<{ eventId: string; status: string }>(targetUrl, body, {
          timeout: 10_000,
          headers: { 'Content-Type': 'application/json' },
        });
        console.log(`[causal] Rule ${rule.id} fired → ${rule.effect} @ ${targetUrl} — responseEventId: ${response.data.eventId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[causal] Rule ${rule.id} failed (${rule.effect} @ ${targetUrl}): ${msg}`);
      }
    })
  );
}
