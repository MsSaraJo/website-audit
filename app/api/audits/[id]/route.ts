import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAudit } from '@/lib/repository';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== env.ADMIN_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const audit = await getAudit(id);
    return NextResponse.json({ id: audit.id, status: audit.status, score: audit.analysis?.overallScore ?? null, reportUrl: audit.report_url ?? null, error: audit.error_message ?? null });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
