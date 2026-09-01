import { z } from 'zod';

// Next.js loads .env values as strings. A line such as GEMINI_API_KEY= therefore
// becomes an empty string rather than an absent value. Treat blank optional/defaulted
// settings as undefined so they do not fail validation during module import.
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = (inner = z.string()) => z.preprocess(blankToUndefined, inner.optional());
const defaultedString = (fallback: string) => z.preprocess(blankToUndefined, z.string().default(fallback));

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(blankToUndefined, z.string().url().default('http://localhost:3000')),
  ADMIN_TOKEN: z.string().min(8),
  CRON_SECRET: z.string().min(8),
  REPORT_BRAND_NAME: defaultedString('MsSaraJo'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_REPORT_BUCKET: defaultedString('audit-reports'),
  PAGESPEED_API_KEY: optionalString(),
  AI_PRIMARY_PROVIDER: z.preprocess(blankToUndefined, z.enum(['openai', 'gemini']).default('openai')),
  OPENAI_API_KEY: optionalString(z.string().min(10)),
  OPENAI_QUICK_WIN_MODEL: defaultedString('gpt-5.6-luna'),
  OPENAI_FULL_SITE_MODEL: defaultedString('gpt-5.6-terra'),
  OPENAI_COMPETITOR_MODEL: defaultedString('gpt-5.6-terra'),
  GEMINI_API_KEY: optionalString(z.string().min(10)),
  GEMINI_MODEL: defaultedString('gemini-2.5-pro'),
  ADMIN_NOTIFICATION_EMAIL: optionalString(z.string().email()),
  SMTP_HOST: optionalString(z.string().min(1)),
  SMTP_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(587)),
  SMTP_SECURE: z.preprocess(blankToUndefined, z.enum(['true', 'false']).default('false')).transform(value => value === 'true'),
  SMTP_USER: optionalString(z.string().email()),
  SMTP_PASSWORD: optionalString(z.string().min(1)),
  ETSY_KEYSTRING: optionalString(),
  ETSY_SHARED_SECRET: optionalString(),
  ETSY_WEBHOOK_SECRET: optionalString(),
  ETSY_REFRESH_TOKEN: optionalString(),
  ETSY_QUICK_WIN_LISTING_IDS: defaultedString(''),
  ETSY_FULL_SITE_LISTING_IDS: defaultedString(''),
  ETSY_COMPETITOR_LISTING_IDS: defaultedString(''),
  // Legacy aliases retained so existing deployments do not break during migration.
  ETSY_TIER1_LISTING_IDS: defaultedString(''),
  ETSY_TIER2_LISTING_IDS: defaultedString(''),
  ETSY_TIER3_LISTING_IDS: defaultedString(''),
  CHROMIUM_EXECUTABLE_PATH: optionalString(),
});

export const env = schema.parse(process.env);
export const csvSet = (value: string) => new Set(value.split(',').map(v => v.trim()).filter(Boolean));
