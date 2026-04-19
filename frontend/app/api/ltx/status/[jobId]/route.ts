import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const base = process.env.LTX_SERVICE_URL;
  if (!base) {
    return NextResponse.json(
      { error: 'LTX_SERVICE_URL not configured.' },
      { status: 503 },
    );
  }

  const { jobId } = await params;

  let resp: Response;
  try {
    resp = await fetch(`${base}/status/${encodeURIComponent(jobId)}`);
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
