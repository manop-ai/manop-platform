-- phase20_agency_commercial_elections.sql  (UNAPPLIED: DEV first; review the impact notes below)
--
-- Adds the agency's explicit choice between the two alternative routes, without touching existing agreements, subscriptions or fees.
--   1. commercial_terms_versions gets three NULLABLE columns: the AGENCY success-fee schedule (separate from the developer schedule),
--      who pays it, and the per-route entitlements text. NULL means "not decided": the app refuses to let an agency accept that route.
--   2. The immutability trigger is re-created so these three columns are ALSO frozen once a version is approved (otherwise they could
--      be edited after approval). Approved rows are unaffected: nothing is written to them here.
--   3. agency_commercial_elections: one row per selection, with the acceptance evidence and a snapshot of the terms accepted.
--      History is never overwritten: a change creates a new row; the old one is ended with an end date.
-- IMPACT: existing rows, agreements, subscriptions and policies are unchanged. No data is written. Safe to re-run.
-- Requires phase "commercial layer v2" (commercial_terms_versions, agency_subscriptions) to be present, which it is in your dev database.

alter table public.commercial_terms_versions
  add column if not exists agency_success_fee_schedule jsonb,
  add column if not exists agency_fee_payer text not null default 'agency',
  add column if not exists agency_entitlements jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'commercial_terms_agency_schedule_check') then
    alter table public.commercial_terms_versions add constraint commercial_terms_agency_schedule_check
      check (agency_success_fee_schedule is null or (jsonb_typeof(agency_success_fee_schedule) = 'array' and jsonb_array_length(agency_success_fee_schedule) >= 1));
  end if;
end $$;

create or replace function public.commercial_terms_versions_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'An approved terms version cannot be deleted (create a new version instead)'; end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if (new.version_label, new.effective_from, new.success_fee_schedule, new.fee_currency, new.fee_payer, new.qualifying_milestones,
        new.agency_subscription_price, new.agency_subscription_currency, new.agency_subscription_period_months,
        new.buyer_pack_price, new.buyer_pack_currency, new.buyer_pack_access_required, new.approved_by, new.approved_at,
        new.agency_success_fee_schedule, new.agency_fee_payer, new.agency_entitlements)
       is distinct from
       (old.version_label, old.effective_from, old.success_fee_schedule, old.fee_currency, old.fee_payer, old.qualifying_milestones,
        old.agency_subscription_price, old.agency_subscription_currency, old.agency_subscription_period_months,
        old.buyer_pack_price, old.buyer_pack_currency, old.buyer_pack_access_required, old.approved_by, old.approved_at,
        old.agency_success_fee_schedule, old.agency_fee_payer, old.agency_entitlements) then
      raise exception 'Approved commercial terms are immutable; create a new version';
    end if;
    if old.status = 'approved' and new.status = 'draft' then raise exception 'An approved version cannot return to draft'; end if;
    if old.status in ('superseded','withdrawn') and new.status <> old.status then raise exception 'A % version cannot change status', old.status; end if;
  end if;
  return new;
end $$;

create table if not exists public.agency_commercial_elections (
  id                   uuid primary key default gen_random_uuid(),
  agency_id            uuid not null references public.data_partners(id) on delete cascade,
  model                text not null check (model in ('subscription','success_fee')),
  status               text not null default 'proposed' check (status in ('proposed','active','ended','withdrawn')),
  terms_version_id     uuid not null references public.commercial_terms_versions(id),
  terms_snapshot       jsonb not null,                                   -- price/schedule/payer/entitlements exactly as shown and accepted
  acceptance_statement text not null check (length(trim(acceptance_statement)) > 0),   -- the exact text the agency accepted
  accepted_by          uuid not null,
  accepted_at          timestamptz not null default now(),
  subscription_id      uuid references public.agency_subscriptions(id),  -- for model = subscription
  effective_from       date,
  effective_to         date,
  supersedes_id        uuid references public.agency_commercial_elections(id),
  activated_by         uuid,
  ended_reason         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (status <> 'active' or effective_from is not null),
  check (effective_to is null or (effective_from is not null and effective_to >= effective_from)),
  check (status <> 'ended' or (effective_to is not null and ended_reason is not null))
);
create unique index if not exists agency_elections_one_active_idx on public.agency_commercial_elections (agency_id) where status = 'active';
create unique index if not exists agency_elections_one_proposed_idx on public.agency_commercial_elections (agency_id) where status = 'proposed';
create index if not exists agency_elections_agency_idx on public.agency_commercial_elections (agency_id, created_at desc);

alter table public.agency_commercial_elections enable row level security;
drop policy if exists agency_commercial_elections_admin_all on public.agency_commercial_elections;
create policy agency_commercial_elections_admin_all on public.agency_commercial_elections for all using (is_manop_admin()) with check (is_manop_admin());
drop policy if exists agency_commercial_elections_service_all on public.agency_commercial_elections;
create policy agency_commercial_elections_service_all on public.agency_commercial_elections for all to service_role using (true) with check (true);
drop policy if exists agency_commercial_elections_owner_select on public.agency_commercial_elections;
create policy agency_commercial_elections_owner_select on public.agency_commercial_elections for select
  using (agency_id in (select id from public.data_partners where auth_user_id = auth.uid()));

-- Supabase stops auto-granting Data API access to new public tables from 2026-10-30:
grant select, insert, update, delete on public.agency_commercial_elections to authenticated;
grant select, insert, update, delete on public.agency_commercial_elections to service_role;

-- ROLLBACK:
--   drop table public.agency_commercial_elections;
--   alter table public.commercial_terms_versions drop constraint commercial_terms_agency_schedule_check,
--     drop column agency_success_fee_schedule, drop column agency_fee_payer, drop column agency_entitlements;
--   -- then re-create commercial_terms_versions_guard() from the "commercial layer v2" migration.
