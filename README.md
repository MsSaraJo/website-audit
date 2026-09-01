# MsSaraJo Website Audit SaaS + Etsy Fulfillment MVP

A production-oriented Next.js/TypeScript implementation for three separate Etsy made-to-order digital audit products:

| Offering | Tier key | Suggested Etsy price | SKU |
| --- | --- | ---: | --- |
| Quick Win Website Audit | `quick_win` | $49 | `MSJ-WEB-QW-001` |
| Full Website SEO & UX Audit | `full_site` | $99 | `MSJ-WEB-FULL-001` |
| Website + Competitor Audit | `competitor_conquest` | $179 | `MSJ-WEB-COMP-001` |

The automated path is:

**Etsy `order.paid` → signed webhook → map the purchased listing → read transaction personalization → secure crawl → PageSpeed → OpenAI structured analysis (Gemini fallback) → PDF → Supabase Storage → ready-for-Etsy-upload queue.**

A manual audit mode remains available for testing and direct/non-Etsy work.

## Important Etsy made-to-order behavior

Etsy digital listings do not support listing variations, so the three audit tiers are separate listings with separate listing IDs.

Made-to-order digital listings are created without the finished file. When the custom report is ready, Etsy currently expects the seller to open the specific order in Shop Manager, choose **Complete order**, upload the finished PDF (up to Etsy's current file limits), and complete the order. Etsy then notifies the buyer and makes the file available through their purchase history.

The public Etsy Open API exposes file upload endpoints for **listing files**, but it does not currently expose an equivalent endpoint for attaching a unique finished file to a specific made-to-order receipt/order. Because of that, this app deliberately does **not** mark an Etsy audit `completed` when the PDF is generated.

Instead:

1. The audit automatically reaches `awaiting_etsy_upload`.
2. The admin dashboard shows it in **Etsy reports ready for upload**.
3. Download the generated PDF from the dashboard.
4. In Etsy Shop Manager → Orders, complete that buyer's order and upload the PDF.
5. Click **I uploaded it to Etsy** in this app.
6. The audit becomes `completed` and records `etsy_upload_confirmed_at`.

This keeps the internal fulfillment state truthful while Etsy lacks a public per-order custom-file upload endpoint.

## Three-offering mapping

Set each Etsy listing ID in `.env.local`:

```text
ETSY_QUICK_WIN_LISTING_IDS=111111111
ETSY_FULL_SITE_LISTING_IDS=222222222
ETSY_COMPETITOR_LISTING_IDS=333333333
```

The webhook maps by exact listing ID. It no longer guesses a tier from listing title text, so unrelated Etsy orders cannot accidentally start a website audit.

The older `ETSY_TIER1_LISTING_IDS`, `ETSY_TIER2_LISTING_IDS`, and `ETSY_TIER3_LISTING_IDS` names are still accepted temporarily for backward compatibility.

## Transaction-level order handling

One Etsy receipt can contain more than one listing. The original MVP used `etsy_receipt_id` as the unique audit key; that would incorrectly collapse multiple purchased audit products into one report.

The updated version creates one audit for each configured Etsy transaction and deduplicates on `etsy_transaction_id`. The receipt ID remains stored for order lookup and can appear on multiple audits.

If the order contains unrelated Etsy products, they are ignored by this service.

If Etsy sends a transaction with quantity greater than 1, the app flags it for manual attention rather than silently producing one report for multiple purchased units. Custom personalization is attached to the transaction, so automatically guessing how multiple units map to multiple websites could under-deliver the order.

## Personalization fields

Etsy's current personalization model supports multiple typed questions. Purchased answers continue to arrive in each transaction's `variations` array with `property_id: 54`, and there may be multiple entries.

Recommended fields for **Quick Win** and **Full Site**:

1. **Website URL** — required text input.
2. **Website Platform** — optional dropdown: Shopify, WordPress, Wix, Squarespace, Other / Not Sure.
3. **Main Goal** — optional dropdown: Get more traffic, Increase sales, Improve SEO, Improve my website, Not sure / Overall review.

Recommended fields for **Competitor Conquest** (uses all five available personalization questions):

1. **Website URL** — required text input.
2. **Competitor URL 1** — required or optional text input.
3. **Competitor URL 2** — optional text input.
4. **Competitor URL 3** — optional text input.
5. **Main Goal** — optional dropdown.

The competitor listing omits the platform question because the audit can infer common platform signals from the site. The adapter extracts URLs from that transaction only and treats the first URL as the customer's site and up to the next three as competitors.

The named personalization answers are also passed to the AI analysis provider as `customerContext` so a stated platform or goal can influence prioritization without being treated as factual audit evidence.

## Admin email notifications (no paid email service)

Customer email delivery has been removed. Etsy remains the authoritative delivery channel for paid Etsy orders: when the report is ready, upload the generated PDF to the buyer's made-to-order digital order and complete it in Etsy.

The app can optionally send **you** an email notification through your own Gmail or Google Workspace mailbox when an audit finishes. This uses Gmail SMTP and does not require Resend or another transactional-email service.

Configure:

```text
ADMIN_NOTIFICATION_EMAIL=you@example.com
SMTP_HOST=smtp.fatcow.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASSWORD=YOUR_MAILBOX_PASSWORD
```

`ADMIN_NOTIFICATION_EMAIL` is where you want the ready notification delivered. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD` configure the authenticated outgoing mailbox. For legacy FatCow/Network Solutions hosting, `smtp.fatcow.com` on port `587` with TLS is the normal starting point. Use the full mailbox address as the SMTP username.

The notification includes the audit product, target website, score, Etsy receipt/listing/SKU when available, and a private 7-day PDF link. Email notification errors are logged but never change a completed report to `failed`.

Manual tests no longer require a customer email address.

## Database migration if you already ran the original schema

Because the original schema has already been used in Supabase, do **not** rerun the whole database from scratch. Run this upgrade migration in the Supabase SQL Editor:

```text
supabase/migrations/002_etsy_made_to_order.sql
```

It adds the `awaiting_etsy_upload` state, changes receipt uniqueness, makes buyer email optional for Etsy, adds transaction/listing/SKU fields, adds fulfillment timestamps, and updates the atomic audit-claim function.

For a brand-new database, `001_init.sql` already contains the final schema and no follow-up migration is needed.

## What is implemented

- Etsy Open API v3 `order.paid` webhook ingestion with raw-body HMAC-SHA256 verification, `whsec_` base64 key decoding, replay-window validation, and webhook idempotency.
- Exact listing-ID mapping for three separate Etsy products.
- Transaction-level audit creation and retry deduplication.
- Multi-question Etsy personalization parsing (`property_id: 54`).
- Optional buyer email rather than blocking fulfillment when it is unavailable.
- SSRF-aware crawling with DNS/private-IP checks and browser request interception.
- Tiered crawl depth: Quick Win 1 page, Full Site 5 pages, Competitor Conquest 10 pages + up to 3 competitors.
- Google PageSpeed Insights v5, mobile and desktop.
- OpenAI structured JSON analysis with customer-goal/platform context, transient retries, and optional Gemini fallback.
- Branded PDF generation and private Supabase Storage.
- Free admin-only ready notifications through Gmail SMTP; no customer email service required.
- Etsy `awaiting_etsy_upload` fulfillment state and admin queue.
- Authenticated PDF download endpoint so the report remains retrievable even after a temporary signed URL expires.
- Etsy 20 MB per-file guard so an oversized generated report does not enter the ready-to-upload queue.
- Manual confirmation endpoint after the seller completes the made-to-order Etsy order.
- Recovery cron that does not accidentally rerun reports already waiting for Etsy upload.
- Exact Etsy trademark/API attribution notice in the UI footer.

## Setup

1. Create a Supabase project.
2. If new, run `supabase/migrations/001_init.sql`. If upgrading the original MVP, run `supabase/migrations/002_etsy_made_to_order.sql`.
3. Copy `.env.example` to `.env.local` and fill in credentials.
4. Create a Google PageSpeed API key and an OpenAI API key. A Gemini key is optional as a fallback provider.
5. Optional: configure authenticated SMTP admin notifications with `ADMIN_NOTIFICATION_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`.
6. Create three separate **made-to-order digital** Etsy listings and put each listing ID in the matching environment variable.
7. Authorize the Etsy app with the required transaction-read access and save the refresh token.
8. Configure Etsy's `order.paid` webhook endpoint as `https://YOUR_DOMAIN/api/etsy-webhook`.
9. Install and run:

```bash
npm install
npm run dev
```

## Admin workflow

Open `/` and enter `ADMIN_TOKEN`.

The page supports:

- manual test audits for all three products;
- an **Etsy reports ready for upload** queue;
- authenticated PDF downloads;
- a confirmation button after the PDF has been attached to the Etsy made-to-order order.

## Deployment note

The project uses Next.js `after()` so webhooks can acknowledge quickly while the audit begins, plus a recovery cron for stalled jobs. For larger order volume, invoke the same `processAudit()` function from a durable queue/worker rather than relying on request-lifetime background work.

## Security notes

The crawler rejects localhost, private IPv4/IPv6 ranges, and private DNS resolutions. It also intercepts browser subresource requests to reduce SSRF exposure. Keep this protection enabled even when buyers are expected to submit ordinary public websites.

Generated reports are private in Supabase Storage. The admin PDF endpoint requires `ADMIN_TOKEN` and streams the stored report rather than relying on a long-lived public URL.

## Troubleshooting: manual audit returns `/api/audits` 400/500

The manual audit route validates the request and target URL before inserting a row into Supabase. Updated builds return the actual validation or Supabase error in the UI instead of collapsing non-`Error` objects into `Invalid request`.

If an existing Supabase project was created from the original schema, run `supabase/migrations/002_etsy_made_to_order.sql` before testing the updated app. The updated pipeline expects the added Etsy fulfillment columns (including `etsy_transaction_id`, `etsy_listing_id`, `etsy_quantity`, `email_delivered_at`, and `etsy_upload_confirmed_at`) and the `awaiting_etsy_upload` audit status.
