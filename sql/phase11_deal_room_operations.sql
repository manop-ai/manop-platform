-- PHASE 11 — Deal Room operations. NOT YET APPLIED to Supabase. Run after phase10.
-- Run each numbered block on its own (the editor shows only the last result).
-- Nothing here renames existing columns or touches the Commercial/Documents
-- workstream's tables (agreement_requests and related).

-- ── 1. One register for every intake source ──────────────────────────────
-- project_id and developer_id are already nullable (confirmed). Land, JV,
-- redevelopment and Site Intelligence introductions point at a site; general
-- enquiries to MANOP point at neither. site_id takes the SAME TYPE as sites.id
-- (read from the catalogue, not assumed).
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.sites'::regclass and a.attname = 'id' and not a.attisdropped;
  if t is null then raise exception 'sites.id not found'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'developer_leads' and column_name = 'site_id') then
    execute format('alter table public.developer_leads add column site_id %s references public.sites(id) on delete set null', t);
  end if;
end $$;

-- 2.
alter table developer_leads
  add column if not exists source_kind text check (source_kind in ('development','site','general'));
create index if not exists developer_leads_site_id_idx on developer_leads(site_id);

-- 3. A lead belongs to a development OR a site, never both.
alter table developer_leads drop constraint if exists developer_leads_one_subject;
alter table developer_leads add constraint developer_leads_one_subject
  check (project_id is null or site_id is null) not valid;   -- not valid: existing rows are not rechecked

-- 4. Landowners can be a party; admin can record a responsible-party decision.
--    Rewrites only the two CHECK constraints that phase 10 created.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.lead_milestones'::regclass and contype = 'c'
       and (pg_get_constraintdef(oid) ilike '%introduction_created%' or pg_get_constraintdef(oid) ilike '%party_role%')
  loop
    execute format('alter table public.lead_milestones drop constraint %I', c.conname);
  end loop;
end $$;

alter table lead_milestones add constraint lead_milestones_milestone_check check (milestone in (
  'introduction_created','introduction_acknowledged','information_supplied','viewing_arranged',
  'viewing_completed','offer_submitted','agreement_executed','qualifying_payment_reported',
  'outcome_confirmed','outcome_cancelled','repeat_enquiry_received','responsible_party_recorded',
  'agency_representation_requested','agency_representation_accepted','agency_representation_rejected','agency_representation_ended'));
alter table lead_milestones add constraint lead_milestones_party_role_check check (
  party_role in ('buyer','developer','agency','landowner','buyer_agent','admin','system'));

alter table developer_leads drop constraint if exists developer_leads_acknowledged_by_role_check;
alter table developer_leads add constraint developer_leads_acknowledged_by_role_check
  check (acknowledged_by_role in ('developer','agency','landowner'));
-- responsible_party stays developer|agency: taking part is not being the payer.

-- 5. Buyer-safe view gains the two new identifiers (appended: CREATE OR REPLACE may only add at the end).
create or replace view my_introductions as
  select id, manop_lead_id, project_id, unit_type_id, stage, source, is_diaspora,
         created_at, acknowledged_at, attribution_acknowledged_at, site_id, source_kind
  from developer_leads
  where user_id = auth.uid();
revoke all on my_introductions from anon;
grant select on my_introductions to authenticated;

-- 6. Database-side protection for sensitive columns.
-- leads_owner_update lets an owning developer UPDATE their lead rows but cannot
-- limit WHICH columns. This trigger refuses changes to the sensitive ones from
-- ordinary signed-in users. MANOP admin and the service role (the server routes
-- that authorise first) are unaffected, as is the SQL editor.
create or replace function developer_leads_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true), '') <> 'authenticated' then
    return new;
  end if;
  if is_manop_admin() then return new; end if;
  foreach k in array array[
    'stage','user_id','developer_id','project_id','site_id','source_kind','manop_lead_id',
    'fee_percentage','declared_txn_value','fee_amount','fee_status','fee_model','fee_type',
    'responsible_party','terms_version','terms_accepted_at',
    'acknowledged_at','acknowledged_by_user_id','acknowledged_by_role','attribution_acknowledged_at',
    'closed_at','relayed_to_developer_at','manop_routing_required'
  ] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'The "%" of an introduction cannot be changed directly. Use the Deal Room.', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists developer_leads_guard on developer_leads;
create trigger developer_leads_guard before update on developer_leads
  for each row execute function developer_leads_guard();

-- 7. REVIEW (read-only): responsible_party values written by phase-10 code simply
-- because that party acknowledged. They carry no agreement behind them.
select manop_lead_id, acknowledged_by_role, responsible_party, terms_version
  from developer_leads
 where responsible_party is not null and terms_version is null
   and responsible_party = acknowledged_by_role;
-- Decide with Joel whether to clear them; this migration does not.
