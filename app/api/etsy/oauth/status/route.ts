import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getEtsyConnectionStatus } from '@/lib/etsy-oauth';

export const runtime = 'nodejs';

function authorized(req: Request) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === env.ADMIN_TOKEN;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getEtsyConnectionStatus());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
