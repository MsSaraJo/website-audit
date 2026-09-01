import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { assertPublicUrl } from '@/lib/url-security';
import { createAudit } from '@/lib/repository';
import { processAudit } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 800;

const inputSchema = z.object({
  email: z.string().email(),
  url: z.string().min(4),
  tier: z.enum(['quick_win', 'full_site', 'competitor_conquest']),
  competitorUrls: z.array(z.string()).max(3).default([]),
});

export async function POST(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== env.ADMIN_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = inputSchema.parse(await req.json());
    const url = await assertPublicUrl(input.url);
    const competitorUrls = [];
    for (const c of input.competitorUrls) competitorUrls.push(await assertPublicUrl(c));
    const audit = await createAudit({ source: 'manual', email: input.email, url, tier: input.tier, competitorUrls });
    after(() => processAudit(audit.id).catch(console.error));
    return NextResponse.json({ id: audit.id, status: audit.status }, { status: 202 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Invalid request' }, { status: 400 });
  }
}
