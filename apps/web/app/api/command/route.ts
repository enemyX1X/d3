import { NextRequest, NextResponse } from 'next/server';
import { parseCommand } from '@/lib/livia';

const hits = new Map<string, { count: number; stamp: number }>();

function isRateLimited(ip: string) {
  const now = Date.now();
  const existing = hits.get(ip);

  if (!existing || now - existing.stamp > 60_000) {
    hits.set(ip, { count: 1, stamp: now });
    return false;
  }

  existing.count += 1;
  return existing.count > 60;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local';

  if (isRateLimited(ip)) {
    return NextResponse.json({ ok: false, error: 'Rate limit reached. Try again shortly.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON.' }, { status: 400 });
  }

  const text = (body as { text?: unknown })?.text;
  if (typeof text !== 'string' || !text.trim() || text.length > 200) {
    return NextResponse.json({ ok: false, error: 'text must be a string between 1 and 200 characters.' }, { status: 400 });
  }

  const command = parseCommand(text);
  if (!command) {
    return NextResponse.json({ ok: false, error: 'Command not understood. Try: become a spaceship.' }, { status: 422 });
  }

  return NextResponse.json({ ok: true, command });
}
