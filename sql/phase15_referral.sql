-- PHASE 15 — Referral of MANOP-held introductions to the developer. NOT YET APPLIED to Supabase.
-- Apply TOGETHER WITH (and after) phase14_unit_request.sql. Phase 14 records routing_status = 'manop_operator'
-- for introductions received while the developer account was unclaimed; this adds the admin referral that
-- releases one to the developer. Apply phase 14 alone and those introductions stay with MANOP until this is applied.
--
-- Additive: two nullable columns and a trigger. Nothing is rewritten and no policy is changed here.

alter table public.developer_leads
  add column if not exists referred_to_developer_at timestamptz,
  add column if not exists referred_by_user_id      uuid;

-- A referral is a MANOP decision: once made it cannot be edited by a signed-in user (the service role,
-- which the referral route uses, and the SQL editor have no auth.uid()).
create or replace function public.developer_leads_referral_guard()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.referred_to_developer_at, new.referred_by_user_id) is distinct from (old.referred_to_developer_at, old.referred_by_user_id) then
    raise exception 'The referral of an introduction can only be recorded by MANOP.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists developer_leads_referral_guard on public.developer_leads;
create trigger developer_leads_referral_guard
  before update on public.developer_leads
  for each row execute function public.developer_leads_referral_guard();

notify pgrst, 'reload schema';
