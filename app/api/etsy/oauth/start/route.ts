import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { APP_BASE_PATH } from '@/lib/app-paths';
import {
  buildEtsyAuthorizeUrl,
  createEtsyPkce,
  ETSY_OAUTH_STATE_COOKIE,
  ETSY_OAUTH_VERIFIER_COOKIE,
} from '@/lib/etsy-oauth';

export const runtime = 'nodejs';

function authorized(req: Request) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') === env.ADMIN_TOKEN;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!env.ETSY_KEYSTRING || !env.ETSY_SHARED_SECRET) {
    return NextResponse.json({ error: 'Configure ETSY_KEYSTRING and ETSY_SHARED_SECRET before connecting Etsy.' }, { status: 400 });
  }

  try {
    const { verifier, challenge, state } = createEtsyPkce();
    const authorizeUrl = buildEtsyAuthorizeUrl({ challenge, state });
    const response = NextResponse.json({ authorizeUrl });
    const secure = new URL(env.NEXT_PUBLIC_APP_URL).protocol === 'https:';
    const common = { httpOnly: true, secure, sameSite: 'lax' as const, path: APP_BASE_PATH, maxAge: 10 * 60 };
    response.cookies.set(ETSY_OAUTH_STATE_COOKIE, state, common);
    response.cookies.set(ETSY_OAUTH_VERIFIER_COOKIE, verifier, common);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
