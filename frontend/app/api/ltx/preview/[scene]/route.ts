import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scene: string }> },
) {
  const base = process.env.LTX_SERVICE_URL;
  if (!base) {
    return NextResponse.json(
      { error: 'LTX_SERVICE_URL not configured.' },
      { status: 503 },
    );
  }

  const { scene } = await params;

  let resp: Response;
  try {
    resp = await fetch(`${base}/preview/${encodeURIComponent(scene)}`);
  } catch {
    return NextResponse.json(
      { error: 'ltx-service unreachable.' },
      { status: 502 },
    );
  }

  if (!resp.ok) {
    const text = await resp.text();
    return new NextResponse(text, {
      status: resp.status,
      headers: { 'Content-Type': resp.headers.get('content-type') ?? 'application/json' },
    });
  }

  const buffer = await resp.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': resp.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
