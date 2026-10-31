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
