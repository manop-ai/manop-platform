-- PHASE 14 — Unit-specific requests (Get Financed / Enquire). NOT YET APPLIED to Supabase.
--
-- Run each numbered block on its own (the editor shows only the last result).
-- Purely additive: new nullable columns on developer_leads, CHECKs, and one trigger.
-- It does not touch my_introductions, lead_milestones, the Phase 11 migration, or any
-- Commercial/Documents table. It does not depend on Phase 11 and can be applied before or after it.
--
-- WHY: a request about one unit of a development used to store only unit_type_id (filled in
-- automatically with the first listed unit) and a UUID in unit_interest. Nothing recorded the unit's
-- name, the price the buyer was shown, what the request was for, or where it was routed.
--
-- The intake route (app/api/developer-leads) keeps working BEFORE this is applied: a request that
-- selects a unit then falls back to writing a readable line into `note`, and says so in its response.

-- 1. The request snapshot. Every column is nullable: enquiries that name no unit leave them empty,
--    and existing rows are not rewritten.
alter table public.developer_leads
  add column if not exists unit_type_label        text,
  add column if not exists unit_price_ngn         numeric,
  add column if not exists unit_price_usd         numeric,
  add column if not exists unit_price_currency    text,
  add column if not exists unit_price_status      text,
  add column if not exists unit_price_verified_at timestamptz,
  add column if not exists unit_available_count   integer,
  add column if not exists unit_snapshot_at       timestamptz,
  add column if not exists request_purpose        text,
  add column if not exists financing_type         text,
  add column if not exists routing_status         text;

-- 2. Value checks. NOT VALID: existing rows are not rechecked; new and updated rows are.
alter table public.developer_leads drop constraint if exists developer_leads_unit_price_status_check;
alter table public.developer_leads add constraint developer_leads_unit_price_status_check
  check (unit_price_status is null or unit_price_status in
    ('not_supplied','currency_unconfirmed','no_confirmation_date','not_recently_confirmed','recently_confirmed')) not valid;

alter table public.developer_leads drop constraint if exists developer_leads_request_purpose_check;
alter table public.developer_leads add constraint developer_leads_request_purpose_check
  check (request_purpose is null or request_purpose in
    ('explore_financing','confirm_price_availability','financing_and_price')) not valid;

alter table public.developer_leads drop constraint if exists developer_leads_financing_type_check;
alter table public.developer_leads add constraint developer_leads_financing_type_check
  check (financing_type is null or financing_type in
    ('mortgage','nhf','developer_plan','diaspora_remittance')) not valid;

alter table public.developer_leads drop constraint if exists developer_leads_routing_status_check;
alter table public.developer_leads add constraint developer_leads_routing_status_check
  check (routing_status is null or routing_status in
    ('developer_account','agency_mandate','manop_operator')) not valid;

-- A price, if recorded, is positive. Zero is not a price.
alter table public.developer_leads drop constraint if exists developer_leads_unit_price_positive_check;
alter table public.developer_leads add constraint developer_leads_unit_price_positive_check
  check ((unit_price_ngn is null or unit_price_ngn > 0) and (unit_price_usd is null or unit_price_usd > 0)) not valid;

-- 3. The recorded request is history. Once written it cannot be edited by a signed-in user
--    (developer, agency, buyer or admin): a later price change or a developer's edit must not
--    make an old request look as if it were made at a different price or for a different unit.
--    The service role and the SQL editor have no auth.uid() and can still correct a genuine error.
--    unit_type_id is deliberately NOT guarded: a foreign key may null it when a unit row is deleted,
--    and that must not be blocked by this trigger. The label and price snapshot survive regardless.
create or replace function public.developer_leads_request_snapshot_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if (new.unit_type_label, new.unit_price_ngn, new.unit_price_usd, new.unit_price_currency,
        new.unit_price_status, new.unit_price_verified_at, new.unit_available_count,
        new.unit_snapshot_at, new.request_purpose, new.financing_type, new.routing_status)
       is distinct from
       (old.unit_type_label, old.unit_price_ngn, old.unit_price_usd, old.unit_price_currency,
        old.unit_price_status, old.unit_price_verified_at, old.unit_available_count,
        old.unit_snapshot_at, old.request_purpose, old.financing_type, old.routing_status) then
      raise exception 'The recorded unit request on an introduction cannot be changed.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists developer_leads_request_snapshot_guard on public.developer_leads;
create trigger developer_leads_request_snapshot_guard
  before update on public.developer_leads
  for each row execute function public.developer_leads_request_snapshot_guard();

-- 4. Make the new columns visible to the API immediately.
notify pgrst, 'reload schema';
