import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const VALID_TRACKS = ['API Access', 'Platform Partnership', 'Institutional Access'];

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const org = typeof body.org === 'string' ? body.org.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const track = typeof body.track === 'string' ? body.track.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  if (!VALID_TRACKS.includes(track)) {
    return NextResponse.json({ error: 'Invalid access track.' }, { status: 400 });
  }

  const notificationEmail = process.env.NOTIFICATION_EMAIL ?? 'khaaliswooden@gmail.com';
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('[access-request] RESEND_API_KEY not configured');
    return NextResponse.json(
      { error: 'Service temporarily unavailable.' },
      { status: 503 }
    );
  }

  const resend = new Resend(apiKey);
  const timestamp = new Date().toISOString();
  const refId = `ZWM-${Date.now()}`;

  try {
    await resend.emails.send({
      from: 'ZWM Access Requests <onboarding@resend.dev>',
      to: notificationEmail,
      subject: `[ZWM] New ${track} request from ${name}`,
      text: [
        `New ZWM access request received`,
        ``,
        `Reference:    ${refId}`,
        `Track:        ${track}`,
        `Name:         ${name}`,
        `Email:        ${email}`,
        `Organization: ${org || '(not provided)'}`,
        `Message:      ${message || '(not provided)'}`,
        `Submitted:    ${timestamp}`,
        `IP:           ${ip}`,
        ``,
        `---`,
        `Reply directly to ${email} to follow up.`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[access-request] Failed to send admin notification:', err);
    return NextResponse.json(
      { error: 'Failed to submit request. Please try again.' },
      { status: 500 }
    );
  }

  try {
    await resend.emails.send({
      from: 'ZWM Access <onboarding@resend.dev>',
      to: email,
      subject: `[ZWM] Request received — ${track}`,
      text: [
        `Hi ${name},`,
        ``,
        `We received your ZWM access request. Here are the details:`,
        ``,
        `  Reference: ${refId}`,
        `  Track:     ${track}`,
        `  Submitted: ${timestamp}`,
        ``,
        `We review requests manually and typically follow up within 2–3 business days.`,
        ``,
        `Questions? Reply to this email or reach us at khaaliswooden@gmail.com`,
        ``,
        `— Zuup Innovation Lab`,
      ].join('\n'),
    });
  } catch (err) {
    // Acknowledgment failure is non-fatal — the admin was already notified.
    console.error('[access-request] Failed to send applicant acknowledgment:', err);
  }

  return NextResponse.json({ success: true, timestamp, refId });
}
