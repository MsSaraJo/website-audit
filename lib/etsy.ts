import { db } from './db';
import { csvSet, env } from './env';
import { extractCandidateUrls } from './url-security';
import type { AuditTier } from './types';

const tier1 = csvSet(env.ETSY_TIER1_LISTING_IDS);
const tier2 = csvSet(env.ETSY_TIER2_LISTING_IDS);
const tier3 = csvSet(env.ETSY_TIER3_LISTING_IDS);

async function refreshAccessToken() {
  if (!env.ETSY_KEYSTRING) throw new Error('ETSY_KEYSTRING is not configured');
  const { data } = await db.from('integration_tokens').select('*').eq('provider', 'etsy').maybeSingle();
  if (data?.access_token && data?.expires_at && new Date(data.expires_at).getTime() > Date.now() + 120000) return data.access_token as string;
  const refreshToken = (data?.refresh_token as string | undefined) || env.ETSY_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('No Etsy refresh token is configured');
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: env.ETSY_KEYSTRING, refresh_token: refreshToken });
  const res = await fetch('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Etsy OAuth refresh failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  const token = await res.json();
  await db.from('integration_tokens').upsert({ provider: 'etsy', access_token: token.access_token, refresh_token: token.refresh_token || refreshToken, expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() });
  return token.access_token as string;
}

async function etsyGet(url: string) {
  if (!env.ETSY_KEYSTRING || !env.ETSY_SHARED_SECRET) throw new Error('Etsy API credentials are not configured');
  const parsed = new URL(url);
  if (!['api.etsy.com', 'openapi.etsy.com'].includes(parsed.hostname) || !parsed.pathname.startsWith('/v3/')) {
    throw new Error('Refusing non-Etsy API resource URL');
  }
  const access = await refreshAccessToken();
  const res = await fetch(url, { headers: { 'x-api-key': `${env.ETSY_KEYSTRING}:${env.ETSY_SHARED_SECRET}`, authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`Etsy API ${res.status}: ${(await res.text()).slice(0, 600)}`);
  return res.json();
}

function tierForTransactions(transactions: any[]): AuditTier {
  const ids = transactions.map(t => String(t.listing_id ?? '')).filter(Boolean);
  if (ids.some(id => tier3.has(id))) return 'competitor_conquest';
  if (ids.some(id => tier2.has(id))) return 'full_site';
  if (ids.some(id => tier1.has(id))) return 'quick_win';
  const joined = JSON.stringify(transactions).toLowerCase();
  if (joined.includes('competitor conquest')) return 'competitor_conquest';
  if (joined.includes('full site') || joined.includes('ux breakdown')) return 'full_site';
  return 'quick_win';
}

export async function getEtsyOrderContext(resourceUrl: string, shopId: number) {
  const receipt = await etsyGet(resourceUrl);
  const receiptId = receipt.receipt_id ?? resourceUrl.match(/receipts\/(\d+)/)?.[1];
  if (!receiptId) throw new Error('Could not determine Etsy receipt ID');
  const tx = await etsyGet(`https://openapi.etsy.com/v3/application/shops/${shopId}/receipts/${receiptId}/transactions`);
  const transactions = tx.results ?? [];
  // Etsy's 2026 personalization model still returns buyer answers in transaction.variations.
  // property_id 54 is the personalization property; there may now be multiple entries/questions.
  const personalizationValues = transactions.flatMap((t: any) =>
    (t.variations ?? []).filter((v: any) => Number(v.property_id) === 54).map((v: any) => v.formatted_value)
  );
  const isEtsyOwned = (candidate: string) => {
    try { const h = new URL(candidate).hostname.toLowerCase(); return h === 'etsy.com' || h.endsWith('.etsy.com') || h.endsWith('.etsystatic.com'); } catch { return true; }
  };
  let urls = extractCandidateUrls(personalizationValues).filter(u => !isEtsyOwned(u));
  if (!urls.length) urls = extractCandidateUrls({ receipt: { message_from_buyer: receipt.message_from_buyer }, transactions }).filter(u => !isEtsyOwned(u));
  if (!urls.length) throw new Error('No website URL found in Etsy order personalization');
  return {
    receiptId: String(receiptId),
    buyerEmail: receipt.buyer_email as string | undefined,
    buyerName: receipt.name as string | undefined,
    url: urls[0],
    competitorUrls: urls.slice(1, 4),
    tier: tierForTransactions(transactions),
    raw: { receipt, transactions },
  };
}
