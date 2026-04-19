import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const base = process.env.LTX_SERVICE_URL;
  if (!base) {
    return NextResponse.json(
      { error: 'LTX_SERVICE_URL not configured.' },
      { status: 503 },
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
      { error: 'ltx-service unreachable.' },
      { status: 502 },
    );
  }

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: { 'Content-Type': resp.headers.get('content-type') ?? 'application/json' },
  });
}
