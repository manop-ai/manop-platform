-- PHASE 10 — Deal Room: introduction register, acknowledgement, milestones.
-- Run once in the Supabase SQL editor, after phase9. Additive except for the
-- three policy corrections in section 4, which close real security gaps.
--
-- What already existed and is reused unchanged: developer_leads (the
-- introduction register — manop_lead_id is its stable reference, with stage and
-- fee_percentage / declared_txn_value / fee_amount / fee_status), lead_stage_log
-- (stage-change audit) and its RLS (leads_admin_all, leads_owner_read,
-- leads_agency_read, leads_owner_update, leads_service_all).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. developer_leads — acknowledgement, responsible party, attribution consent
-- ─────────────────────────────────────────────────────────────────────────
alter table developer_leads
  add column if not exists acknowledged_at            timestamptz,
  add column if not exists acknowledged_by_user_id    uuid references auth.users(id) on delete set null,
  add column if not exists acknowledged_by_role       text check (acknowledged_by_role in ('developer','agency')),
  -- Who the commercial relationship is with for THIS introduction. Left null
  -- until set; never both, so a fee claim is never raised against two parties.
  add column if not exists responsible_party          text check (responsible_party in ('developer','agency')),
  -- Which commercial-terms version was accepted on acknowledgement. Stays null
  -- until terms are approved and activated (lib/deal-room.ts).
  add column if not exists terms_version              text,
  add column if not exists terms_accepted_at          timestamptz,
  -- The buyer agreed MANOP may record this introduction and share their details.
  add column if not exists attribution_acknowledged_at timestamptz;

create index if not exists developer_leads_project_id_idx on developer_leads(project_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. my_introductions — what a buyer may see of their OWN introductions
--
-- The earlier policy "users can view own enquiries" (phase 9) let a buyer
-- SELECT * from their own developer_leads row, which includes MANOP's
-- fee_percentage, declared_txn_value, fee_amount and fee_status. A buyer
-- should see the progress of their introduction, not MANOP's commercial
-- terms with the developer. This view exposes only the safe columns and is
-- filtered to the caller, so the base-table policy can go.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "users can view own enquiries" on developer_leads;

create or replace view my_introductions as
  select id, manop_lead_id, project_id, unit_type_id, stage, source, is_diaspora,
         created_at, acknowledged_at, attribution_acknowledged_at
  from developer_leads
  where user_id = auth.uid();

revoke all on my_introductions from anon;
grant select on my_introductions to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. lead_milestones — append-only milestone / confirmation / dispute log
--
-- One row per thing someone said. Status is DERIVED from the rows
-- (lib/deal-room.ts deriveStates), never stored, so a correction is a new row
-- and history cannot be rewritten. Writes happen only through
-- /api/deal-room, which authorises the caller against the lead first; there is
-- deliberately no INSERT/UPDATE/DELETE policy for ordinary users.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists lead_milestones (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references developer_leads(id),
  manop_lead_id  text,
  milestone      text not null check (milestone in (
                   'introduction_created','introduction_acknowledged','information_supplied',
                   'viewing_arranged','viewing_completed','offer_submitted','agreement_executed',
                   'qualifying_payment_reported','outcome_confirmed','outcome_cancelled',
                   'repeat_enquiry_received')),
  action         text not null check (action in ('report','confirm','dispute','evidence','retract','request_confirmation')),
  party_role     text not null check (party_role in ('buyer','developer','agency','admin','system')),
  actor_user_id  uuid references auth.users(id) on delete set null,
  event_date     date,
  evidence_ref   text,          -- a reference/filename/URL the party will produce on request; not an upload
  note           text,
  target_id      uuid references lead_milestones(id),
  created_at     timestamptz not null default now()
);

create index if not exists lead_milestones_lead_idx on lead_milestones(lead_id, created_at);

alter table lead_milestones enable row level security;

-- Visible to anyone who can already see the lead (admin, owning developer,
-- submitting agency — via developer_leads' own policies, evaluated as the
-- caller) and to the buyer whose introduction it is (via my_introductions).
drop policy if exists "milestones visible with the lead" on lead_milestones;
create policy "milestones visible with the lead" on lead_milestones
  for select
  using (
    exists (select 1 from developer_leads l where l.id = lead_milestones.lead_id)
    or lead_id in (select id from my_introductions)
  );

drop policy if exists "milestones service role" on lead_milestones;
create policy "milestones service role" on lead_milestones
  for all to service_role using (true) with check (true);

-- Append-only, enforced in the database for every role including service_role.
create or replace function lead_milestones_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'lead_milestones is append-only: record a correction as a new row';
end $$;

drop trigger if exists lead_milestones_no_update on lead_milestones;
create trigger lead_milestones_no_update
  before update or delete on lead_milestones
  for each row execute function lead_milestones_append_only();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Security corrections to policies added in phases 8 and 9
--
-- Those admin policies checked auth.jwt() -> 'user_metadata' ->> 'user_role'.
-- user_metadata is editable by the signed-in user themselves
-- (supabase.auth.updateUser({ data: { user_role: 'admin' } })), so any
-- account could have granted itself write access to lender products and
-- exchange rates. The rest of the admin surface (developer_leads,
-- lib/admin-guard.ts) uses is_manop_admin(); these now do too.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "finance_products_admin_all" on finance_products;
create policy "finance_products_admin_all" on finance_products
  for all using (is_manop_admin()) with check (is_manop_admin());

drop policy if exists "admins manage rates" on currency_reference_rates;
create policy "admins manage rates" on currency_reference_rates
  for all using (is_manop_admin()) with check (is_manop_admin());
