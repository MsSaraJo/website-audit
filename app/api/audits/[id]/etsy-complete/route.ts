import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAudit, updateAudit } from '@/lib/repository';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== env.ADMIN_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const audit = await getAudit(id);
    if (audit.source !== 'etsy') return NextResponse.json({ error: 'This is not an Etsy audit' }, { status: 400 });
    if (audit.status === 'completed') return NextResponse.json({ ok: true, alreadyCompleted: true });
    if (audit.status !== 'awaiting_etsy_upload') return NextResponse.json({ error: `Audit is ${audit.status}, not awaiting Etsy upload` }, { status: 409 });
    const now = new Date().toISOString();
    await updateAudit(id, 'completed', { etsy_upload_confirmed_at: now, completed_at: now });
    return NextResponse.json({ ok: true, status: 'completed' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not complete audit' }, { status: 500 });
  }
}
