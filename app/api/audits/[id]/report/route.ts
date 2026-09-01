import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/lib/db';
import { getAudit } from '@/lib/repository';
import { productForTier } from '@/lib/products';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== env.ADMIN_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const audit = await getAudit(id);
  if (!audit.report_path) return NextResponse.json({ error: 'Report is not ready' }, { status: 404 });
  const { data, error } = await db.storage.from(env.SUPABASE_REPORT_BUCKET).download(audit.report_path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not download report' }, { status: 500 });
  const bytes = await data.arrayBuffer();
  const product = productForTier(audit.tier);
  const suffix = audit.etsy_receipt_id ? `-${audit.etsy_receipt_id}` : `-${audit.id.slice(0, 8)}`;
  const filename = `MsSaraJo-${product.clientFileLabel}${suffix}.pdf`;
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
