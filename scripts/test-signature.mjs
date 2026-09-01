import crypto from 'node:crypto';

function verify({rawBody, webhookId, webhookTimestamp, webhookSignature, secret, nowSeconds}) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${webhookId}.${webhookTimestamp}.${rawBody}`).digest();
  if (Math.abs(nowSeconds - Number(webhookTimestamp)) > 300) return false;
  const signatures = webhookSignature.split(/\s+/).map(x=>x.trim()).filter(Boolean).map(entry=>entry.includes(',') ? entry.split(',').at(-1).trim() : entry.startsWith('v1=') ? entry.slice(3).trim() : entry);
  return signatures.some(sig => { const actual = Buffer.from(sig,'base64'); return actual.length === expected.length && crypto.timingSafeEqual(actual, expected); });
}

const rawBody = JSON.stringify({ event_type:'order.paid', resource_url:'https://example.com/receipt/123', shop_id:1 });
const webhookId = 'msg_test_123';
const now = Math.floor(Date.now()/1000);
const webhookTimestamp = String(now);
const secretBytes = crypto.randomBytes(32);
const secret = `whsec_${secretBytes.toString('base64')}`;
const signed = `${webhookId}.${webhookTimestamp}.${rawBody}`;
const signature = crypto.createHmac('sha256', secretBytes).update(signed).digest('base64');
for (const header of [signature, `v1,${signature}`, `v1=${signature}`]) {
  if (!verify({rawBody,webhookId,webhookTimestamp,webhookSignature:header,secret,nowSeconds:now})) throw new Error(`Signature verification failed for ${header.slice(0,8)}...`);
}
if (verify({rawBody,webhookId,webhookTimestamp:String(now-301),webhookSignature:signature,secret,nowSeconds:now})) throw new Error('Replay window test failed');
console.log('Etsy signature fixtures: OK');
