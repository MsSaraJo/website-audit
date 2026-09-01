import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAudit } from '@/lib/repository';
import { productForTier } from '@/lib/products';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (token !== env.ADMIN_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const audit = await getAudit(id);
    return NextResponse.json({
      id: audit.id,
      status: audit.status,
      tier: audit.tier,
      product: productForTier(audit.tier).name,
      source: audit.source,
      score: audit.analysis?.overallScore ?? null,
      reportUrl: audit.report_url ?? null,
      reportDownloadUrl: audit.report_path ? `/api/audits/${audit.id}/report` : null,
      etsyReceiptId: audit.etsy_receipt_id ?? null,
      etsyTransactionId: audit.etsy_transaction_id ?? null,
      etsyUploadConfirmedAt: audit.etsy_upload_confirmed_at ?? null,
      error: audit.error_message ?? null,
      pipelineStage: audit.input_data?.pipelineStage ?? null,
      pipelineStageStartedAt: audit.input_data?.pipelineStageStartedAt ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
