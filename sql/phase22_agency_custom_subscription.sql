-- phase22_agency_custom_subscription.sql  (UNAPPLIED: DEV first; requires phase20)
--
-- V1 agency commercial framework:
--   A. Success-fee route carries a recorded commitment (months come from the approved terms version, NULL = none decided).
--   B. Subscription has NO universal price. An agency REQUESTS a custom subscription; an admin assesses it and issues a PROPOSAL
--      (price, currency, duration, inclusions, development coverage, activation condition, expiry, terms). The agency accepts or declines.
--      Acceptance creates the existing agency_subscriptions row (payment, approval, activation stay separate admin steps).
--   C. Append-only commercial event log (audit trail).
-- IMPACT: additive. Existing rows are untouched. Browsers get NO table access to the new tables: the server routes read and write them
-- after authorisation (so admin notes and draft proposals can never leak through a policy). Safe to re-run.

-- A. commitment months on terms versions; guard re-created so the new column is frozen once approved
alter table public.commercial_terms_versions add column if not exists agency_success_fee_commitment_months integer
  check (agency_success_fee_commitment_months is null or agency_success_fee_commitment_months > 0);

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
        new.agency_success_fee_schedule, new.agency_fee_payer, new.agency_entitlements, new.agency_success_fee_commitment_months)
       is distinct from
       (old.version_label, old.effective_from, old.success_fee_schedule, old.fee_currency, old.fee_payer, old.qualifying_milestones,
        old.agency_subscription_price, old.agency_subscription_currency, old.agency_subscription_period_months,
        old.buyer_pack_price, old.buyer_pack_currency, old.buyer_pack_access_required, old.approved_by, old.approved_at,
        old.agency_success_fee_schedule, old.agency_fee_payer, old.agency_entitlements, old.agency_success_fee_commitment_months) then
      raise exception 'Approved commercial terms are immutable; create a new version';
    end if;
    if old.status = 'approved' and new.status = 'draft' then raise exception 'An approved version cannot return to draft'; end if;
    if old.status in ('superseded','withdrawn') and new.status <> old.status then raise exception 'A % version cannot change status', old.status; end if;
  end if;
  return new;
end $$;

alter table public.agency_commercial_elections
  add column if not exists commitment_months integer check (commitment_months is null or commitment_months > 0),
  add column if not exists commitment_start date,
  add column if not exists commitment_end date,
  add column if not exists early_transition_authorized_by uuid,
  add column if not exists early_transition_authorized_at timestamptz,
  add column if not exists early_transition_reason text;

-- A2. a custom subscription is governed by its accepted PROPOSAL, not a terms-version price, so its election need not reference a terms version.
alter table public.agency_commercial_elections alter column terms_version_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agency_elections_success_fee_needs_terms') then
    alter table public.agency_commercial_elections add constraint agency_elections_success_fee_needs_terms check (model <> 'success_fee' or terms_version_id is not null) not valid;
  end if;
end $$;
alter table public.agency_commercial_elections add column if not exists proposal_id uuid;

-- B. requests
create table if not exists public.agency_subscription_requests (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.data_partners(id) on delete cascade,
  status             text not null default 'requested'
                     check (status in ('requested','under_assessment','proposal_issued','accepted','declined','expired','withdrawn','closed')),
  portfolio_summary  text not null check (length(trim(portfolio_summary)) > 0),
  intended_usage     text not null check (length(trim(intended_usage)) > 0),
  service_requirements text,
  expected_coverage  text,
  manop_attributed_context text,     -- activity the agency says came through MANOP (to be checked against MANOP records)
  external_context   text,           -- voluntary disclosure of activity outside MANOP; context only, never a pricing basis
  requested_by       uuid not null,
  requested_at       timestamptz not null default now(),
  assessed_by        uuid,
  assessment_started_at timestamptz,
  admin_notes        text,           -- internal, never returned to the agency
  closed_reason      text,
  subscription_id    uuid references public.agency_subscriptions(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists agency_sub_requests_one_open_idx on public.agency_subscription_requests (agency_id)
  where status in ('requested','under_assessment','proposal_issued');
create index if not exists agency_sub_requests_agency_idx on public.agency_subscription_requests (agency_id, created_at desc);

-- proposals: versioned per request. A draft is editable; once issued the commercial content is frozen (a revision is a new version).
create table if not exists public.agency_subscription_proposals (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.agency_subscription_requests(id) on delete cascade,
  agency_id          uuid not null references public.data_partners(id) on delete cascade,
  version            integer not null default 1,
  status             text not null default 'draft' check (status in ('draft','issued','accepted','declined','expired','superseded','withdrawn')),
  price_amount       numeric not null check (price_amount > 0),
  price_currency     text not null default 'NGN',
  duration_months    integer not null check (duration_months > 0),
  inclusions         jsonb not null check (jsonb_typeof(inclusions) = 'array' and jsonb_array_length(inclusions) >= 1),
  exclusions         jsonb not null default '[]'::jsonb,
  coverage_scope     text not null check (coverage_scope in ('listed','all_current_and_future')),
  coverage_development_ids uuid[] not null default '{}',
  coverage_note      text,
  activation_condition text not null check (length(trim(activation_condition)) > 0),
  effective_date     date,
  expires_at         timestamptz,
  terms_text         text not null check (length(trim(terms_text)) > 0),
  basis_note         text,           -- internal reasoning for the price; never returned to the agency
  issued_by          uuid,
  issued_at          timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  acceptance_statement text,         -- the exact text the agency accepted
  decline_reason     text,
  created_by         uuid not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (request_id, version),
  check (coverage_scope <> 'listed' or cardinality(coverage_development_ids) >= 1),
  check (status in ('draft','withdrawn') or (issued_by is not null and issued_at is not null and expires_at is not null)),
  check (status <> 'accepted' or (decided_by is not null and decided_at is not null and acceptance_statement is not null))
);
create unique index if not exists agency_sub_proposals_one_issued_idx on public.agency_subscription_proposals (request_id) where status = 'issued';

create or replace function public.agency_subscription_proposals_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'An issued proposal cannot be deleted'; end if;
    return old;
  end if;
  if old.status <> 'draft' then
    if (new.request_id, new.agency_id, new.version, new.price_amount, new.price_currency, new.duration_months, new.inclusions, new.exclusions,
        new.coverage_scope, new.coverage_development_ids, new.coverage_note, new.activation_condition, new.effective_date, new.expires_at,
        new.terms_text, new.issued_by, new.issued_at)
       is distinct from
       (old.request_id, old.agency_id, old.version, old.price_amount, old.price_currency, old.duration_months, old.inclusions, old.exclusions,
        old.coverage_scope, old.coverage_development_ids, old.coverage_note, old.activation_condition, old.effective_date, old.expires_at,
        old.terms_text, old.issued_by, old.issued_at) then
      raise exception 'An issued proposal cannot be changed; issue a new version';
    end if;
    if old.status in ('accepted','declined','expired','superseded','withdrawn') and new.status <> old.status then
      raise exception 'A % proposal cannot change status', old.status;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists agency_subscription_proposals_guard on public.agency_subscription_proposals;
create trigger agency_subscription_proposals_guard before update or delete on public.agency_subscription_proposals
  for each row execute function public.agency_subscription_proposals_guard();

-- the subscription row records which accepted proposal created it, and what it covers
alter table public.agency_subscriptions
  add column if not exists proposal_id uuid references public.agency_subscription_proposals(id),
  add column if not exists coverage_scope text check (coverage_scope is null or coverage_scope in ('listed','all_current_and_future')),
  add column if not exists coverage_development_ids uuid[];

-- C. append-only audit log
create table if not exists public.agency_commercial_events (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.data_partners(id) on delete cascade,
  event_type  text not null,
  request_id  uuid,
  proposal_id uuid,
  election_id uuid,
  subscription_id uuid,
  actor_user_id uuid,
  actor_role  text not null check (actor_role in ('agency','admin','system')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists agency_commercial_events_agency_idx on public.agency_commercial_events (agency_id, created_at);
create or replace function public.agency_commercial_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'agency_commercial_events are append-only'; end $$;
drop trigger if exists agency_commercial_events_no_change on public.agency_commercial_events;
create trigger agency_commercial_events_no_change before update or delete on public.agency_commercial_events
  for each row execute function public.agency_commercial_events_immutable();

-- Access: server routes only (service role) plus admin read. No policy for agencies: they read through the route, which returns whitelisted columns.
do $$
declare t text;
begin
  foreach t in array array['agency_subscription_requests','agency_subscription_proposals','agency_commercial_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_manop_admin())', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ROLLBACK:
--   drop table public.agency_commercial_events; 
--   alter table public.agency_subscriptions drop column proposal_id, drop column coverage_scope, drop column coverage_development_ids;
--   drop table public.agency_subscription_proposals; drop table public.agency_subscription_requests;
--   alter table public.agency_commercial_elections drop column commitment_months, drop column commitment_start, drop column commitment_end,
--     drop column early_transition_authorized_by, drop column early_transition_authorized_at, drop column early_transition_reason;
--   (the guard function was extended; to revert re-create it from phase20 and drop agency_success_fee_commitment_months)
