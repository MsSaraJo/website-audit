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

    pageInsights: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          pageUrl: { type: 'string' }, pageLabel: { type: 'string' }, role: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100 }, strength: { type: 'string' }, opportunity: { type: 'string' },
        }, required: ['pageUrl', 'pageLabel', 'role', 'score', 'strength', 'opportunity'],
      }, maxItems: 5,
    },
    crossPageInsights: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' }, finding: { type: 'string' }, why: { type: 'string' },
          pageUrls: { type: 'array', items: { type: 'string' } },
        }, required: ['title', 'finding', 'why', 'pageUrls'],
      }, maxItems: 4,
    },
    competitorGap: {
      type: 'object', additionalProperties: false,
      properties: {
        summary: { type: 'string' }, wins: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } }, opportunities: { type: 'array', items: { type: 'string' } },
      }, required: ['summary', 'wins', 'gaps', 'opportunities'],
    },
    competitorIntelligence: {
      type: 'object', additionalProperties: false,
      properties: {
        marketPositionScore: { type: 'integer', minimum: 0, maximum: 100 },
        executiveSummary: { type: 'string' },
        biggestAdvantage: { type: 'string' },
        biggestOpportunity: { type: 'string' },
        dimensions: { type: 'array', maxItems: 6, items: {
          type: 'object', additionalProperties: false,
          properties: {
            label: { type: 'string' }, yourScore: { type: 'integer', minimum: 0, maximum: 100 },
            competitors: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, score: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['name', 'score'] } },
          }, required: ['label', 'yourScore', 'competitors'],
        } },
        leadAreas: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
        competitorLeadAreas: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
        competitorProfiles: { type: 'array', maxItems: 3, items: {
          type: 'object', additionalProperties: false,
          properties: {
            name: { type: 'string' }, url: { type: 'string' }, positioning: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' }, maxItems: 4 },
            averageAreas: { type: 'array', items: { type: 'string' }, maxItems: 4 },
            exposedAreas: { type: 'array', items: { type: 'string' }, maxItems: 4 },
            doNotCopy: { type: 'array', items: { type: 'string' }, maxItems: 4 },
          }, required: ['name', 'url', 'positioning', 'strengths', 'averageAreas', 'exposedAreas', 'doNotCopy'],
        } },
        messagingGaps: { type: 'array', maxItems: 4, items: {
          type: 'object', additionalProperties: false,
          properties: { area: { type: 'string' }, yourSite: { type: 'array', items: { type: 'string' }, maxItems: 4 }, marketPattern: { type: 'array', items: { type: 'string' }, maxItems: 4 }, opportunity: { type: 'string' } },
          required: ['area', 'yourSite', 'marketPattern', 'opportunity'],
        } },
        seoOpportunities: { type: 'array', maxItems: 5, items: {
          type: 'object', additionalProperties: false,
          properties: { title: { type: 'string' }, rationale: { type: 'string' }, actions: { type: 'array', items: { type: 'string' }, maxItems: 4 }, impact: { type: 'string', enum: ['high', 'medium', 'low'] } },
          required: ['title', 'rationale', 'actions', 'impact'],
        } },
        whiteSpace: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, finding: { type: 'string' }, opportunity: { type: 'string' } }, required: ['title', 'finding', 'opportunity'] } },
        winStrategy: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, description: { type: 'string' }, impact: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['title', 'description', 'impact'] } },
        advantagePlan: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { phase: { type: 'string' }, title: { type: 'string' }, items: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, required: ['phase', 'title', 'items'] } },
        doThis: { type: 'array', items: { type: 'string' }, maxItems: 6 },
        dontChase: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      }, required: ['marketPositionScore', 'executiveSummary', 'biggestAdvantage', 'biggestOpportunity', 'dimensions', 'leadAreas', 'competitorLeadAreas', 'competitorProfiles', 'messagingGaps', 'seoOpportunities', 'whiteSpace', 'winStrategy', 'advantagePlan', 'doThis', 'dontChase'],
    },
  }, required: ['reportTitle', 'overallScore', 'executiveSummary', 'scores', 'quickWins', 'actionItems', 'rewrites'],
} as const;
