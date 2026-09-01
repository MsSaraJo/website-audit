import { db } from './db';
import { env } from './env';
import { productForListingId } from './products';
import { extractCandidateUrls } from './url-security';
import type { AuditTier } from './types';

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

const isEtsyOwned = (candidate: string) => {
  try {
    const h = new URL(candidate).hostname.toLowerCase();
    return h === 'etsy.com' || h.endsWith('.etsy.com') || h.endsWith('.etsystatic.com');
  } catch {
    return true;
  }
};

function personalizationForTransaction(transaction: any) {
  return (transaction.variations ?? [])
    .filter((v: any) => Number(v.property_id) === 54)
    .map((v: any) => ({
      name: String(v.formatted_name ?? 'Personalization'),
      value: String(v.formatted_value ?? ''),
    }))
    .filter((v: { value: string }) => v.value.trim());
}

export type EtsyAuditOrderItem = {
  transactionId: string;
  listingId: string;
  listingTitle: string;
  tier: AuditTier;
  sku: string;
  quantity: number;
  url: string | null;
  competitorUrls: string[];
  buyerInputs: Record<string, string>;
  issue?: string;
  rawTransaction: unknown;
};

export async function getEtsyOrderContext(resourceUrl: string, shopId: number) {
  const receipt = await etsyGet(resourceUrl);
  const receiptId = receipt.receipt_id ?? resourceUrl.match(/receipts\/(\d+)/)?.[1];
  if (!receiptId) throw new Error('Could not determine Etsy receipt ID');
  const tx = await etsyGet(`https://openapi.etsy.com/v3/application/shops/${shopId}/receipts/${receiptId}/transactions`);
  const transactions = tx.results ?? [];
  const matchedTransactions = transactions.filter((t: any) => productForListingId(t.listing_id));
  const fallbackReceiptUrls = matchedTransactions.length === 1
    ? extractCandidateUrls(receipt.message_from_buyer ?? '').filter(u => !isEtsyOwned(u))
    : [];

  const items: EtsyAuditOrderItem[] = matchedTransactions.map((t: any) => {
    const product = productForListingId(t.listing_id)!;
    const personalization = personalizationForTransaction(t);
    const buyerInputs = Object.fromEntries(personalization.map((p: { name: string; value: string }) => [p.name, p.value]));
    let urls = extractCandidateUrls(personalization.map((p: { value: string }) => p.value)).filter(u => !isEtsyOwned(u));
    if (!urls.length && fallbackReceiptUrls.length) urls = fallbackReceiptUrls;
    const url = urls[0] ?? null;
    const quantity = Math.max(1, Number(t.quantity ?? 1));
    const issue = quantity > 1
      ? 'This transaction has quantity greater than 1. One personalization set cannot be safely mapped to multiple custom reports; handle this order manually.'
      : (url ? undefined : 'No website URL found in this Etsy transaction personalization.');
    return {
      transactionId: String(t.transaction_id ?? `${receiptId}:${t.listing_id}`),
      listingId: String(t.listing_id),
      listingTitle: String(t.title ?? product.name),
      tier: product.tier,
      sku: product.sku,
      quantity,
      url,
      competitorUrls: product.tier === 'competitor_conquest' ? urls.slice(1, 4) : [],
      buyerInputs,
      issue,
      rawTransaction: t,
    };
  });

  return {
    receiptId: String(receiptId),
    buyerEmail: receipt.buyer_email as string | undefined,
    buyerName: receipt.name as string | undefined,
    items,
    raw: { receipt, transactions },
  };
}
