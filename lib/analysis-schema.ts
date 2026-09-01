export const auditJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    reportTitle: { type: 'string' },
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    executiveSummary: { type: 'string' },
    scores: {
      type: 'object', additionalProperties: false,
      properties: {
        seo: { type: 'integer', minimum: 0, maximum: 100 },
        performance: { type: 'integer', minimum: 0, maximum: 100 },
        ux: { type: 'integer', minimum: 0, maximum: 100 },
        accessibility: { type: 'integer', minimum: 0, maximum: 100 },
        geo: { type: 'integer', minimum: 0, maximum: 100 },
      }, required: ['seo', 'performance', 'ux', 'accessibility', 'geo'],
    },
    quickWins: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
    actionItems: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['critical', 'warning', 'good'] },
          category: { type: 'string', enum: ['SEO', 'Performance', 'UX', 'Accessibility', 'GEO'] },
          title: { type: 'string' }, why: { type: 'string' }, how: { type: 'string' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['small', 'medium', 'large'] },
          pageUrl: { type: 'string' },
        }, required: ['severity', 'category', 'title', 'why', 'how', 'impact', 'effort'],
      }, minItems: 6, maxItems: 24,
    },
    rewrites: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          pageUrl: { type: 'string' }, title: { type: 'string' }, metaDescription: { type: 'string' }, primaryH1: { type: 'string' }, cta: { type: 'string' },
        }, required: ['pageUrl', 'title', 'metaDescription', 'primaryH1', 'cta'],
      }, maxItems: 10,
    },
    competitorGap: {
      type: 'object', additionalProperties: false,
      properties: {
        summary: { type: 'string' }, wins: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } }, opportunities: { type: 'array', items: { type: 'string' } },
      }, required: ['summary', 'wins', 'gaps', 'opportunities'],
    },
  }, required: ['reportTitle', 'overallScore', 'executiveSummary', 'scores', 'quickWins', 'actionItems', 'rewrites'],
} as const;
