import dns from 'node:dns/promises';
import net from 'node:net';

const blockedHosts = new Set(['localhost', 'localhost.localdomain']);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
      p[0] === 0 || p[0] >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
  }
  return true;
}

export function normalizeHttpUrl(input: string): string {
  const raw = input.trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
  url.hash = '';
  return url.toString();
}

export async function assertPublicUrl(input: string): Promise<string> {
  const normalized = normalizeHttpUrl(input);
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase();
  if (blockedHosts.has(host) || host.endsWith('.local')) throw new Error('Private/local targets are not allowed');
  if (net.isIP(host) && isPrivateIp(host)) throw new Error('Private IP targets are not allowed');
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(r => isPrivateIp(r.address))) throw new Error('Target resolves to a private or invalid address');
  return normalized;
}

export function extractCandidateUrls(value: unknown): string[] {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(value);
  const found = new Set<string>();
  const re = /(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s,;]*)?/gi;
  for (const s of strings) {
    for (const m of s.match(re) ?? []) {
      try { found.add(normalizeHttpUrl(m.replace(/[)\]}>.,!?]+$/g, ''))); } catch { /* ignore */ }
    }
  }
  return [...found];
}
