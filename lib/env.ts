import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_TOKEN: z.string().min(8),
  CRON_SECRET: z.string().min(8),
  REPORT_BRAND_NAME: z.string().default('MsSaraJo'),
  REPORT_FROM_EMAIL: z.string().min(3),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_REPORT_BUCKET: z.string().default('audit-reports'),
  PAGESPEED_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default('gemini-2.5-pro'),
  RESEND_API_KEY: z.string().optional(),
  ETSY_EMAIL_COPY_ENABLED: z.enum(['true', 'false']).default('false'),
  ETSY_KEYSTRING: z.string().optional(),
  ETSY_SHARED_SECRET: z.string().optional(),
  ETSY_WEBHOOK_SECRET: z.string().optional(),
  ETSY_REFRESH_TOKEN: z.string().optional(),
  ETSY_QUICK_WIN_LISTING_IDS: z.string().default(''),
  ETSY_FULL_SITE_LISTING_IDS: z.string().default(''),
  ETSY_COMPETITOR_LISTING_IDS: z.string().default(''),
  // Legacy aliases retained so existing deployments do not break during migration.
  ETSY_TIER1_LISTING_IDS: z.string().default(''),
  ETSY_TIER2_LISTING_IDS: z.string().default(''),
  ETSY_TIER3_LISTING_IDS: z.string().default(''),
  CHROMIUM_EXECUTABLE_PATH: z.string().optional(),
});

export const env = schema.parse(process.env);
export const csvSet = (value: string) => new Set(value.split(',').map(v => v.trim()).filter(Boolean));
