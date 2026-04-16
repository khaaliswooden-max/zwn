import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: 'Admin secret not configured.' }, { status: 503 });
  }

  let track = 'API_ACCESS';
  try {
    const body = (await request.json()) as { track?: string };
    if (body.track) track = body.track;
  } catch { /* use default */ }

  const backendUrl = process.env.NEXT_PUBLIC_ZWM_API_URL ?? 'http://localhost:3001';
  let resp: Response;
  try {
    resp = await fetch(`${backendUrl}/enterprise/api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret,
      },
      body: JSON.stringify({ track }),
    });
  } catch {
    return NextResponse.json({ error: 'Could not reach indexer backend.' }, { status: 502 });
  }

  if (!resp.ok) {
    return NextResponse.json({ error: 'Key generation failed.' }, { status: resp.status });
  }
  return NextResponse.json(await resp.json(), { status: 201 });
}
