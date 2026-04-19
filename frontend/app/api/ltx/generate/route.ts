import { NextResponse } from 'next/server';
import { checkRateLimits, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// Each generation triggers a paid fal.ai job, so cap spend via coarse
// per-IP and global sliding-window limits. In-memory and per-lambda-instance;
// upgrade to Redis/KV if stricter caps are needed.
const PER_IP_LIMIT = Number(process.env.LTX_RATE_LIMIT_PER_IP ?? 1);
const PER_IP_WINDOW_MS = Number(process.env.LTX_RATE_LIMIT_PER_IP_WINDOW_MS ?? 10 * 60 * 1000);
const GLOBAL_LIMIT = Number(process.env.LTX_RATE_LIMIT_GLOBAL ?? 20);
const GLOBAL_WINDOW_MS = Number(process.env.LTX_RATE_LIMIT_GLOBAL_WINDOW_MS ?? 60 * 60 * 1000);

export async function POST(request: Request) {
  const base = process.env.LTX_SERVICE_URL;
  if (!base) {
    return NextResponse.json(
      { detail: 'Generation service is not configured. Contact the site operator.' },
      { status: 503 },
    );
  }

  const ip = clientIp(request.headers);
  const rate = checkRateLimits([
    { key: `ltx:ip:${ip}`, limit: PER_IP_LIMIT, windowMs: PER_IP_WINDOW_MS },
    { key: 'ltx:global', limit: GLOBAL_LIMIT, windowMs: GLOBAL_WINDOW_MS },
  ]);
  if (!rate.ok) {
    const minutes = Math.ceil(rate.retryAfterSeconds / 60);
    const isGlobal = rate.scope === 'ltx:global';
    const detail = isGlobal
      ? `Generation capacity reached. Try again in ~${minutes} min.`
      : `One generation per IP per ${Math.round(PER_IP_WINDOW_MS / 60000)} min. Try again in ~${minutes} min.`;
    return NextResponse.json(
      { detail },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const body = await request.text();

  let resp: Response;
  try {
    resp = await fetch(`${base}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    return NextResponse.json(
      { detail: 'Generation service is unreachable. Try again in a minute.' },
      { status: 502 },
    );
  }

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') ?? 'application/json' },
  });
}
