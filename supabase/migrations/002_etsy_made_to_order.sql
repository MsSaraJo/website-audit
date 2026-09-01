-- Upgrade migration for databases that already ran the original 001_init.sql.
-- Safe to rerun: enum/columns/indexes use IF NOT EXISTS where supported.

alter type audit_status add value if not exists 'awaiting_etsy_upload';

alter table public.audits drop constraint if exists audits_etsy_receipt_id_key;
alter table public.audits alter column customer_email drop not null;

alter table public.audits add column if not exists etsy_transaction_id text;
alter table public.audits add column if not exists etsy_listing_id text;
alter table public.audits add column if not exists etsy_listing_title text;
alter table public.audits add column if not exists etsy_sku text;
alter table public.audits add column if not exists etsy_quantity integer not null default 1;
alter table public.audits add column if not exists email_delivered_at timestamptz;
alter table public.audits add column if not exists etsy_upload_confirmed_at timestamptz;

create unique index if not exists audits_etsy_transaction_id_uidx
  on public.audits(etsy_transaction_id)
  where etsy_transaction_id is not null;
create index if not exists audits_etsy_receipt_id_idx
  on public.audits(etsy_receipt_id)
  where etsy_receipt_id is not null;

alter table public.webhook_events add column if not exists audit_ids jsonb not null default '[]'::jsonb;

create or replace function public.claim_audit(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare claimed_id uuid;
begin
  update public.audits
     set status = 'scraping',
         attempt_count = attempt_count + 1,
         last_started_at = now(),
         updated_at = now(),
         error_message = null
   where id = p_id
     -- Cast to text so this migration can be executed in the same transaction
     -- that adds the new enum value above.
     and status::text not in ('completed','awaiting_etsy_upload')
     and attempt_count < 3
     and (status::text in ('pending','failed') or updated_at < now() - interval '15 minutes')
  returning id into claimed_id;
  return claimed_id is not null;
end;
$$;
