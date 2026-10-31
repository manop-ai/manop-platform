-- PHASE 17 — Lender Products register: fuller criteria, evidence classification, follow-up, audit trail.
-- NOT APPLIED. Purely additive: new nullable columns, one new table. No existing column, constraint, policy or row is changed.
-- Written against the columns lib/finance-products.ts and the phase 8 routes already use. BEFORE applying, run
-- sql/phase16_verify.sql blocks 2 (finance_products columns, constraints, policies) and confirm nothing below collides.
-- Apply in the DEVELOPMENT project first.
--
-- The existing `status` ('active' | 'withdrawn') is deliberately left alone: its CHECK constraint was not inspected, and
-- "awaiting confirmation" is a different question (what MANOP knows) from active/withdrawn (whether MANOP offers it),
-- so it lives in the new verification_status column instead.

alter table public.finance_products
  add column if not exists currency_code         text,
  add column if not exists description           text,
  add column if not exists application_channel   text,
  add column if not exists coverage_scope        text,
  add column if not exists min_loan_amount_ngn   numeric,
  add column if not exists max_loan_amount_ngn   numeric,
  add column if not exists rate_type             text,
  add column if not exists min_deposit_pct       numeric,
  add column if not exists fees_notes            text,
  add column if not exists repayment_structure   text,
  add column if not exists allowed_residency     text[],
  add column if not exists allowed_employment    text[],
  add column if not exists income_currencies     text[],
  add column if not exists employment_notes      text,
  add column if not exists property_eligibility  text,
  add column if not exists required_documents    text,
  add column if not exists source_date           date,
  add column if not exists verification_status   text,
  add column if not exists internal_notes        text,
  add column if not exists follow_up_owner       text,
  add column if not exists next_follow_up_at     date;

-- Named constraints so they can be dropped cleanly; NULL stays allowed (= not recorded).
alter table public.finance_products drop constraint if exists finance_products_coverage_scope_chk;
alter table public.finance_products add  constraint finance_products_coverage_scope_chk
  check (coverage_scope is null or coverage_scope in ('nationwide', 'cities', 'unknown'));
alter table public.finance_products drop constraint if exists finance_products_rate_type_chk;
alter table public.finance_products add  constraint finance_products_rate_type_chk
  check (rate_type is null or rate_type in ('fixed', 'variable', 'unknown'));
alter table public.finance_products drop constraint if exists finance_products_verification_status_chk;
alter table public.finance_products add  constraint finance_products_verification_status_chk
  check (verification_status is null or verification_status in ('researched_public', 'third_party', 'provider_confirmed', 'awaiting_confirmation'));

-- Append-only record of what was verified, when, by whom and how. product_id is text so this does not depend on the
-- id column type (inspect with phase16_verify block 2); the app writes String(product.id).
create table if not exists public.finance_product_events (
  id                  uuid primary key default gen_random_uuid(),
  product_id          text not null,
  event_type          text not null check (event_type in ('created', 'reverified', 'updated', 'withdrawn', 'reactivated', 'verification_status_changed')),
  verification_status text,
  verified_at         timestamptz,
  source_name         text,
  source_url          text,
  note                text,
  actor_user_id       uuid,
  created_at          timestamptz not null default now()
);
create index if not exists finance_product_events_product_idx on public.finance_product_events (product_id, created_at desc);

alter table public.finance_product_events enable row level security;

drop policy if exists finance_product_events_admin_all on public.finance_product_events;
create policy finance_product_events_admin_all on public.finance_product_events
  for all to public using (is_manop_admin()) with check (is_manop_admin());

drop policy if exists finance_product_events_service_all on public.finance_product_events;
create policy finance_product_events_service_all on public.finance_product_events
  for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';

-- ROLLBACK (data in the new columns / table is lost):
-- drop table if exists public.finance_product_events;
-- alter table public.finance_products drop column if exists currency_code, drop column if exists description, ... (each column above)

-- Supabase stops auto-granting Data API access to NEW public tables from 2026-10-30. Explicit grants for the new
-- table (RLS policies above still decide what each role can actually see):
grant select, insert, update, delete on public.finance_product_events to authenticated;
grant select, insert, update, delete on public.finance_product_events to service_role;
