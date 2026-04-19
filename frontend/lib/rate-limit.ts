// Best-effort in-memory sliding-window rate limiter. Scoped per Node.js
// instance — on serverless (Vercel), each lambda has its own bucket, so the
// effective limit is per-instance. For strict global caps, upgrade to Redis /
// Vercel KV. The goal here is to prevent obvious abuse without external deps.

type Bucket = number[];

const buckets = new Map<string, Bucket>();

function hit(key: string, limit: number, windowMs: number, now: number):
  | { ok: true }
  | { ok: false; retryAfterSeconds: number } {
  const cutoff = now - windowMs;
  const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (bucket.length >= limit) {
    const retryAfterMs = bucket[0] + windowMs - now;
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { ok: true };
}

export interface RateLimitRule {
  key: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimits(rules: RateLimitRule[]):
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; scope: string } {
  const now = Date.now();
  for (const rule of rules) {
    const result = hit(rule.key, rule.limit, rule.windowMs, now);
    if (!result.ok) {
      return { ok: false, retryAfterSeconds: result.retryAfterSeconds, scope: rule.key };
    }
  }
  return { ok: true };
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
