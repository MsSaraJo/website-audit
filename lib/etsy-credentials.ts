import { env } from './env';

export function getEtsyApiKeyHeader(): string {
  const keystring = env.ETSY_KEYSTRING?.trim();
  const sharedSecret = env.ETSY_SHARED_SECRET?.trim();

  if (!keystring || !sharedSecret) {
    throw new Error('Etsy API credentials are incomplete. Configure both ETSY_KEYSTRING and ETSY_SHARED_SECRET.');
  }

  if (keystring.includes(':')) {
    throw new Error('ETSY_KEYSTRING should contain only the Etsy keystring, not a combined keystring:shared_secret value.');
  }

  return `${keystring}:${sharedSecret}`;
}

export function getEtsyClientId(): string {
  const keystring = env.ETSY_KEYSTRING?.trim();
  if (!keystring) throw new Error('ETSY_KEYSTRING is not configured');
  return keystring;
}
