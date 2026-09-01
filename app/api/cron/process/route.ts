import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { dispatchAudit } from '@/lib/audit-dispatch';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const retryable = ['pending', 'failed', 'scraping', 'analyzing', 'generating_pdf'];
  const { data, error } = await db.from('audits').select('id,status,updated_at,attempt_count').in('status', retryable).lt('attempt_count', 3).order('created_at').limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const cutoff = Date.now() - 15 * 60 * 1000;
  const eligible = (data ?? []).filter((row: any) => row.status === 'pending' || row.status === 'failed' || new Date(row.updated_at).getTime() < cutoff).slice(0, 2);
  const results = [];
  for (const row of eligible) {
    try {
      const dispatchMode = await dispatchAudit(row.id, req.url);
      results.push({ id: row.id, ok: true, dispatchMode });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ dispatched: results });
}
