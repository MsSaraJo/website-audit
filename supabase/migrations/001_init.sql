create extension if not exists pgcrypto;

do $$ begin
  create type audit_status as enum ('pending','scraping','analyzing','generating_pdf','completed','failed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type audit_tier as enum ('quick_win','full_site','competitor_conquest');
exception when duplicate_object then null; end $$;

create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('manual','etsy')),
  etsy_receipt_id text unique,
  customer_email text not null,
  target_url text not null,
  competitor_urls jsonb not null default '[]'::jsonb,
  tier audit_tier not null,
  status audit_status not null default 'pending',
  attempt_count integer not null default 0,
  last_started_at timestamptz,
  input_data jsonb not null default '{}'::jsonb,
  scrape_data jsonb,
  pagespeed_data jsonb,
  competitor_data jsonb,
  analysis jsonb,
  report_path text,
  report_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists audits_status_created_idx on public.audits(status, created_at);

create table if not exists public.webhook_events (
  webhook_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  audit_id uuid references public.audits(id),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_tokens (
  provider text primary key,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

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
     and status <> 'completed'
     and attempt_count < 3
     and (status in ('pending','failed') or updated_at < now() - interval '15 minutes')
  returning id into claimed_id;
  return claimed_id is not null;
end;
$$;

alter table public.audits enable row level security;
alter table public.webhook_events enable row level security;
alter table public.integration_tokens enable row level security;

insert into storage.buckets (id, name, public)
values ('audit-reports', 'audit-reports', false)
on conflict (id) do nothing;
