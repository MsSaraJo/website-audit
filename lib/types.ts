export type AuditTier = 'quick_win' | 'full_site' | 'competitor_conquest';
export type AuditStatus = 'pending' | 'scraping' | 'analyzing' | 'generating_pdf' | 'awaiting_etsy_upload' | 'completed' | 'failed';

export type PageAudit = {
  url: string;
  title: string;
  metaDescription: string;
  canonical: string | null;
  robotsMeta: string | null;
  viewport: string | null;
  h1: string[];
  h2: string[];
  textSample: string;
  internalLinks: string[];
  externalLinks: string[];
  imageCount: number;
  imagesMissingAlt: number;
  buttons: string[];
  forms: number;
  jsonLdTypes: string[];
  wordCount: number;
  lang: string | null;
};

export type SiteScrape = {
  startUrl: string;
  pages: PageAudit[];
  robotsTxt: string | null;
  llmsTxt: string | null;
  hasSitemap: boolean;
};

export type PageSpeedSummary = {
  url: string;
  strategy: 'mobile' | 'desktop';
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  metrics: Record<string, string | number | null>;
  opportunities: Array<{ id: string; title: string; displayValue?: string; score?: number | null }>;
};

export type AuditAnalysis = {
  reportTitle: string;
  overallScore: number;
  executiveSummary: string;
  scores: { seo: number; performance: number; ux: number; accessibility: number; geo: number };
  quickWins: string[];
  actionItems: Array<{
    severity: 'critical' | 'warning' | 'good';
    category: 'SEO' | 'Performance' | 'UX' | 'Accessibility' | 'GEO';
    title: string;
    why: string;
    how: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'small' | 'medium' | 'large';
    pageUrl?: string;
  }>;
  rewrites: Array<{
    pageUrl: string;
    title: string;
    metaDescription: string;
    primaryH1: string;
    cta: string;
  }>;
  competitorGap?: {
    summary: string;
    wins: string[];
    gaps: string[];
    opportunities: string[];
  };
};
