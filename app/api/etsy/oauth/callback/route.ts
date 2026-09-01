import { NextRequest, NextResponse } from 'next/server';
import { APP_BASE_PATH } from '@/lib/app-paths';
import { env } from '@/lib/env';
import {
  exchangeEtsyAuthorizationCode,
  ETSY_OAUTH_STATE_COOKIE,
  ETSY_OAUTH_VERIFIER_COOKIE,
} from '@/lib/etsy-oauth';

export const runtime = 'nodejs';

function settingsRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL(`${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/settings`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(ETSY_OAUTH_STATE_COOKIE, '', { httpOnly: true, path: APP_BASE_PATH, maxAge: 0 });
  response.cookies.set(ETSY_OAUTH_VERIFIER_COOKIE, '', { httpOnly: true, path: APP_BASE_PATH, maxAge: 0 });
}

export async function GET(req: NextRequest) {
  const oauthError = req.nextUrl.searchParams.get('error');
  if (oauthError) {
    const description = req.nextUrl.searchParams.get('error_description') || oauthError;
    const response = NextResponse.redirect(settingsRedirect(req, { etsy: 'error', message: description.slice(0, 180) }));
    clearOAuthCookies(response);
    return response;
  }

  const code = req.nextUrl.searchParams.get('code');
  const returnedState = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get(ETSY_OAUTH_STATE_COOKIE)?.value;
  const verifier = req.cookies.get(ETSY_OAUTH_VERIFIER_COOKIE)?.value;

  if (!code || !returnedState || !expectedState || !verifier || returnedState !== expectedState) {
    const response = NextResponse.redirect(settingsRedirect(req, { etsy: 'error', message: 'Etsy authorization could not be verified. Please try Connect Etsy again.' }));
    clearOAuthCookies(response);
    return response;
  }

  try {
    await exchangeEtsyAuthorizationCode(code, verifier);
    const response = NextResponse.redirect(settingsRedirect(req, { etsy: 'connected' }));
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const response = NextResponse.redirect(settingsRedirect(req, { etsy: 'error', message: message.slice(0, 180) }));
    clearOAuthCookies(response);
    return response;
  }
}
