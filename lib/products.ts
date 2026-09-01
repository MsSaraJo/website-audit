import { csvSet, env } from './env';
import type { AuditTier } from './types';

export type AuditProduct = {
  tier: AuditTier;
  name: string;
  shortName: string;
  sku: string;
  priceUsd: number;
  description: string;
};

export const AUDIT_PRODUCTS: Record<AuditTier, AuditProduct> = {
  quick_win: {
    tier: 'quick_win',
    name: 'Quick Win Website Audit',
    shortName: 'Quick Win',
    sku: 'MSJ-WEB-QW-001',
    priceUsd: 49,
    description: 'Homepage-focused SEO, UX, speed and conversion audit with the highest-value fixes.',
  },
  full_site: {
    tier: 'full_site',
    name: 'Full Website SEO & UX Audit',
    shortName: 'Full Site',
    sku: 'MSJ-WEB-FULL-001',
    priceUsd: 99,
    description: 'Multi-page SEO, UX, speed and conversion review with copy rewrites and prioritized recommendations.',
  },
  competitor_conquest: {
    tier: 'competitor_conquest',
    name: 'Website + Competitor Audit',
    shortName: 'Competitor Conquest',
    sku: 'MSJ-WEB-COMP-001',
    priceUsd: 179,
    description: 'Full website audit plus side-by-side competitor gap analysis and opportunities.',
  },
};

function configuredIds(tier: AuditTier): Set<string> {
  const current = {
    quick_win: env.ETSY_QUICK_WIN_LISTING_IDS,
    full_site: env.ETSY_FULL_SITE_LISTING_IDS,
    competitor_conquest: env.ETSY_COMPETITOR_LISTING_IDS,
  }[tier];
  const legacy = {
    quick_win: env.ETSY_TIER1_LISTING_IDS,
    full_site: env.ETSY_TIER2_LISTING_IDS,
    competitor_conquest: env.ETSY_TIER3_LISTING_IDS,
  }[tier];
  return new Set([...csvSet(current), ...csvSet(legacy)]);
}

export function productForListingId(listingId: string | number | null | undefined): AuditProduct | null {
  const id = String(listingId ?? '').trim();
  if (!id) return null;
  for (const tier of Object.keys(AUDIT_PRODUCTS) as AuditTier[]) {
    if (configuredIds(tier).has(id)) return AUDIT_PRODUCTS[tier];
  }
  return null;
}

export function productForTier(tier: AuditTier): AuditProduct {
  return AUDIT_PRODUCTS[tier];
}
