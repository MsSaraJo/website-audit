export type AuditSummary = {
  id: string;
  source: string;
  status: string;
  tier: string;
  product: string;
  targetUrl: string;
  createdAt: string;
  updatedAt?: string;
  etsyReceiptId?: string | null;
  etsySku?: string | null;
  score?: number | null;
  error?: string | null;
  hasReport: boolean;
  pipelineStage?: string | null;
  pipelineStageStartedAt?: string | null;
};

export type AuditResult = {
  id: string;
  status: string;
  tier?: string;
  product?: string;
  source?: string;
  score?: number | null;
  reportUrl?: string | null;
  reportDownloadUrl?: string | null;
  etsyReceiptId?: string | null;
  error?: string | null;
  pipelineStage?: string | null;
  pipelineStageStartedAt?: string | null;
};
