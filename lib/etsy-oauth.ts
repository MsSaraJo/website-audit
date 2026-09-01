import { createHash, randomBytes } from 'node:crypto';
import { db } from './db';
import { env } from './env';

export const ETSY_OAUTH_SCOPES = ['transactions_r'] as const;
export const ETSY_OAUTH_STATE_COOKIE = 'mssarajo_etsy_oauth_state';
export const ETSY_OAUTH_VERIFIER_COOKIE = 'mssarajo_etsy_oauth_verifier';

export function etsyOAuthCallbackUrl() {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  return `${base}/api/etsy/oauth/callback`;
}

export function createEtsyPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(24).toString('base64url');
  return { verifier, challenge, state };
}

export function buildEtsyAuthorizeUrl(input: { challenge: string; state: string }) {
  if (!env.ETSY_KEYSTRING) throw new Error('ETSY_KEYSTRING is not configured');
  const redirectUri = etsyOAuthCallbackUrl();
  if (!redirectUri.startsWith('https://')) {
    throw new Error('Etsy OAuth requires NEXT_PUBLIC_APP_URL to use HTTPS in production');
  }

  const url = new URL('https://www.etsy.com/oauth/connect');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', ETSY_OAUTH_SCOPES.join(' '));
  url.searchParams.set('client_id', env.ETSY_KEYSTRING);
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', input.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeEtsyAuthorizationCode(code: string, verifier: string) {
  if (!env.ETSY_KEYSTRING) throw new Error('ETSY_KEYSTRING is not configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.ETSY_KEYSTRING,
    redirect_uri: etsyOAuthCallbackUrl(),
    code,
    code_verifier: verifier,
  });

  const response = await fetch('https://api.etsy.com/v3/public/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Etsy OAuth token exchange failed: ${response.status} ${(await response.text()).slice(0, 500)}`);
  }

  const token = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  if (!token.access_token || !token.refresh_token) throw new Error('Etsy did not return the expected OAuth tokens');

  const expiresAt = new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString();
  const now = new Date().toISOString();
  const { error } = await db.from('integration_tokens').upsert({
    provider: 'etsy',
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: expiresAt,
    updated_at: now,
  });
  if (error) throw new Error(`Could not save Etsy OAuth tokens: ${error.message}`);

  return {
    expiresAt,
    scope: token.scope || ETSY_OAUTH_SCOPES.join(' '),
    userId: token.access_token.split('.')[0] || null,
  };
}

export async function getEtsyConnectionStatus() {
  const { data, error } = await db.from('integration_tokens').select('access_token,refresh_token,expires_at,updated_at').eq('provider', 'etsy').maybeSingle();
  if (error) throw new Error(`Could not read Etsy connection status: ${error.message}`);

  const databaseRefresh = data?.refresh_token as string | null | undefined;
  const fallbackRefresh = env.ETSY_REFRESH_TOKEN;
  const connected = Boolean(databaseRefresh || fallbackRefresh);
  const accessToken = data?.access_token as string | null | undefined;

  return {
    appConfigured: Boolean(env.ETSY_KEYSTRING && env.ETSY_SHARED_SECRET),
    connected,
    connectionSource: databaseRefresh ? 'oauth' : fallbackRefresh ? 'environment' : null,
    userId: accessToken?.split('.')[0] || null,
    accessExpiresAt: (data?.expires_at as string | null | undefined) || null,
    updatedAt: (data?.updated_at as string | null | undefined) || null,
    callbackUrl: etsyOAuthCallbackUrl(),
    scopes: [...ETSY_OAUTH_SCOPES],
  };
}
