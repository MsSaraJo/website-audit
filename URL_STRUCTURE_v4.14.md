# MsSaraJo Website Insight Studio — URL Structure

## Human-facing internal workspace

| Route | Purpose |
| --- | --- |
| `/` | Redirects to the branded dashboard. |
| `/dashboard` | Studio overview: latest result, recent reports, Etsy queue count, average score, and quick operational actions. |
| `/audits/new` | Branded manual audit launcher with Homepage, Comprehensive, and Competitive Edge tier selection. Competitor URLs appear only for Competitive Edge. |
| `/reports` | Searchable/filterable report library using live audit records. |
| `/reports/[id]` | Single report record with status, score, source, PDF download, and hosted-report link when available. |
| `/queue` | Etsy made-to-order delivery queue: download PDF and mark order uploaded. |
| `/settings` | Internal browser-local admin token and brand-system reference. |

## Existing API routes preserved

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/audits` | `GET` | Fetch up to 100 audits; supports `?status=` filtering. |
| `/api/audits` | `POST` | Start a manual audit. |
| `/api/audits/[id]` | `GET` | Read a single audit's live status and report metadata. |
| `/api/audits/[id]/report` | `GET` | Download the generated PDF. |
| `/api/audits/[id]/etsy-complete` | `POST` | Confirm the PDF was attached to the Etsy order. |
| `/api/etsy-webhook` | webhook | Receive Etsy made-to-order events. |
| `/api/cron/process` | cron | Existing audit processing endpoint. |

## Navigation philosophy

The web workspace intentionally exposes only routes that correspond to real current product capabilities. It does not create fake `Clients`, `Opportunities`, or `Insights` databases solely to mirror a concept image. Those can be added later if they become true first-class data objects.

## Recommended production URL

If deployed on a dedicated internal subdomain:

- `studio.mssarajo.com/dashboard`
- `studio.mssarajo.com/audits/new`
- `studio.mssarajo.com/reports`
- `studio.mssarajo.com/queue`

Alternative if you prefer an app-style subdomain:

- `app.mssarajo.com/dashboard`

I prefer **`studio.mssarajo.com`** because it reinforces *Website Insight Studio* and makes the internal environment feel like a branded workspace rather than a generic SaaS console.
