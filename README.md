# Website Audit SaaS + Etsy Fulfillment MVP

A production-oriented Next.js/TypeScript implementation of the automated audit loop:

**Etsy `order.paid` → signed webhook → Etsy receipt/personalization → secure crawl → PageSpeed → Gemini structured analysis → HTML/PDF → Supabase Storage → Resend email.**

It also includes a manual audit UI so you can validate the entire fulfillment path before connecting Etsy.

## What is implemented

- Etsy Open API v3 `order.paid` webhook ingestion with raw-body HMAC-SHA256 verification, `whsec_` base64 key decoding, replay-window validation, and webhook idempotency.
- Etsy OAuth refresh grant with token persistence in Supabase; receipt + receipt transaction retrieval using `transactions_r`.
- Listing-ID-to-tier mapping through environment variables, plus URL extraction from order/transaction text.
- SSRF-aware crawling with DNS/private-IP checks and browser request interception.
- Tiered crawl depth: Quick Win 1 page, Full Site 5 pages, Competitor Conquest 10 pages + up to 3 competitors.
- Google PageSpeed Insights v5, mobile and desktop, including Performance, Accessibility, Best Practices and SEO.
- Gemini structured JSON analysis using a strict JSON Schema; default model is `gemini-2.5-pro` and is configurable.
- GEO signals from `robots.txt`, sitemap directives, `llms.txt`, schema types, headings and crawlable page copy.
- Branded A4 PDF rendering with score cards, prioritized action cards, performance table, rewrites and competitor gap analysis.
- Private Supabase Storage upload and seven-day signed report links.
- Resend transactional email delivery.
- Recovery cron endpoint for pending/stale jobs.
- Exact Etsy trademark/API attribution notice in the UI footer.

## Important Etsy detail

Commercial apps using private transaction data need OAuth `transactions_r`. Etsy also notes that Commercial Access apps using that scope must request access to the `buyer_email` field separately. If `buyer_email` is unavailable, this MVP records the webhook as needing attention and acknowledges the event rather than entering a broken fulfillment loop.

## Setup

1. Create a Supabase project. Run `supabase/migrations/001_init.sql` in the SQL editor. If you change `SUPABASE_REPORT_BUCKET`, create a matching private Storage bucket.
2. Copy `.env.example` to `.env.local` and fill in credentials.
3. Create Google PageSpeed and Gemini API keys.
4. Verify a sending domain in Resend and set `REPORT_FROM_EMAIL`.
5. Create/authorize your Etsy app with at least `transactions_r`; obtain the initial refresh token. Configure the three Etsy listing-ID environment variables so purchased listings map to the correct audit tier.
6. Install and run:

```bash
npm install
npm run dev
```

For local PDF/browser work, install Chrome and set `CHROMIUM_EXECUTABLE_PATH` if it is not in a common location.

## Etsy webhook

Configure the Etsy Webhook Portal endpoint as:

```text
https://YOUR_DOMAIN/api/etsy-webhook
```

Subscribe it to `order.paid`, then put the endpoint signing secret in `ETSY_WEBHOOK_SECRET`.

The handler reads the body with `req.text()` before JSON parsing, which is required because Etsy signs the exact raw body.

## Manual test flow

Open `/`, enter `ADMIN_TOKEN`, a customer email, a website, and a tier. The UI starts an audit and polls `/api/audits/:id` until completion.

## Deployment note

The project uses Next.js `after()` so the webhook can acknowledge quickly while work continues, and `maxDuration = 800` for the long audit routes. On Vercel, 800-second functions require a plan that supports that maximum duration. The recovery cron in `vercel.json` runs every five minutes; that cadence is not supported on Vercel Hobby.

For stricter durability at scale, keep the same `processAudit()` pipeline but invoke it from a durable queue/worker such as SQS + Lambda/ECS, DBOS, Trigger.dev, or another job system. The API surface and database model can remain unchanged.

## Production hardening still recommended

- Add a customer-facing privacy policy, data retention policy, and deletion workflow for order/customer data.
- Add a buyer-contact fallback for invalid or missing URLs. I did not wire an automated per-order Etsy message because the current Open API documentation I verified exposes shop-level sale-message settings, not a clearly documented direct buyer-message send endpoint.
- Add rate limiting and per-shop/order observability.
- Add screenshot/Vision review as a separate optional pipeline step once the text/technical MVP is stable.
- Store generated reports for your intended retention period rather than relying only on the seven-day signed URL saved in `report_url`; signed URLs naturally expire.
- For large volumes, move crawl/PDF execution to a durable worker instead of relying on request-lifetime background execution.

## Security notes

The crawler rejects localhost, private IPv4/IPv6 ranges, and private DNS resolutions. It also intercepts browser subresource requests to reduce SSRF exposure. Keep this protection in place even if customers are expected to submit ordinary public websites.

### Etsy personalization compatibility (2026)

Etsy replaced the old single listing-personalization field with multi-question personalization. Buyer answers on purchased transactions still arrive in each transaction's `variations` array with `property_id: 54`; there can now be more than one such entry and `formatted_name` is not guaranteed to equal `Personalization`. The Etsy adapter therefore reads all `property_id: 54` values rather than matching the label text, and ignores Etsy-owned/file-host URLs when choosing the customer website.
