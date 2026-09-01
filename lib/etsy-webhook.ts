import crypto from 'node:crypto';

function extractSignatures(header: string): string[] {
  return header
    .split(/\s+/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(entry => {
      if (entry.includes(',')) return entry.split(',').at(-1)!.trim();
      if (entry.startsWith('v1=')) return entry.slice(3).trim();
      return entry;
    })
    .filter(Boolean);
}

export function verifyEtsyWebhook(args: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
  toleranceSeconds?: number;
  nowSeconds?: number;
}) {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } = args;
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts)) return false;
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (args.toleranceSeconds ?? 300)) return false;
  if (!secret.startsWith('whsec_')) return false;

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  if (!key.length) return false;
  const signed = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signed).digest();

  return extractSignatures(webhookSignature).some(sig => {
    try {
      const actual = Buffer.from(sig, 'base64');
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    } catch { return false; }
  });
}
