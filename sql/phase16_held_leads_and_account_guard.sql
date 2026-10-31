-- PHASE 16 — (A) hide MANOP-held introductions from a developer who has claimed the account,
--            (B) stop a developer from setting their own verification flag.
-- NOT APPLIED. Written from the live policy list returned by sql/phase15_verify.sql block 4 (dev Supabase).
-- Apply in the DEVELOPMENT project first, run sql/phase16_verify.sql, then decide about production.
--
-- Rollback for (A) is at the bottom of this file (the original policy definitions, copied from that output).
--
-- ── (A) developer_leads ──────────────────────────────────────────────────────────────────────────────
-- Existing: leads_owner_read   SELECT  using (developer_id = my_developer_account_id())
--           leads_owner_update UPDATE  using / with check (developer_id = my_developer_account_id())
-- Problem: a developer who claims an account MANOP created could read (and update) every lead on it,
--          including introductions MANOP received while the account was unclaimed and has not referred.
-- Rule:    an introduction routed to 'manop_operator' is the developer's only after an admin referral
--          (referred_to_developer_at is set). Leads with no routing_status (created before phase 14) keep their
--          earlier behaviour. Admin (leads_admin_all), service role (leads_service_all) and the agency read
--          policy are untouched. lead_milestones is gated through developer_leads by its existing policy.

begin;

drop policy if exists leads_owner_read on public.developer_leads;
create policy leads_owner_read on public.developer_leads
  for select to public
  using (
    developer_id = my_developer_account_id()
    and (routing_status is distinct from 'manop_operator' or referred_to_developer_at is not null)
  );

drop policy if exists leads_owner_update on public.developer_leads;
create policy leads_owner_update on public.developer_leads
  for update to public
  using (
    developer_id = my_developer_account_id()
    and (routing_status is distinct from 'manop_operator' or referred_to_developer_at is not null)
  )
  with check (
    developer_id = my_developer_account_id()
    and (routing_status is distinct from 'manop_operator' or referred_to_developer_at is not null)
  );

-- ── (B) developer_accounts ───────────────────────────────────────────────────────────────────────────
-- Existing policies dev_accounts_owner_update and dev_accounts_claim_unclaimed restrict ROWS but not COLUMNS,
-- so a signed-in developer could set verified = true on their own row through the REST API.
-- This guard (same pattern as the phase 14 / 15 guards) lets only MANOP admins and the service role change it.
-- It also stops a signed-in user from re-pointing auth_user_id / account_status, except the one legitimate
-- transition the claim policy allows: an unclaimed, login-less row becoming theirs.

create or replace function public.developer_accounts_privileged_guard()
returns trigger language plpgsql as $$
begin
  -- service role and the SQL editor have no auth.uid(); admins are trusted
  if auth.uid() is null or public.is_manop_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a self-created account is never born verified
    new.verified := false;
    return new;
  end if;

  if new.verified is distinct from old.verified then
    raise exception 'Verification can only be set by MANOP.' using errcode = '42501';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id
     and not (old.auth_user_id is null and new.auth_user_id = auth.uid()) then
    raise exception 'The login on a developer account can only be changed by MANOP.' using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status
     and not (old.account_status = 'unclaimed' and new.account_status = 'claimed' and new.auth_user_id = auth.uid()) then
    raise exception 'The account status can only be changed by MANOP.' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists developer_accounts_privileged_guard on public.developer_accounts;
create trigger developer_accounts_privileged_guard
  before insert or update on public.developer_accounts
  for each row execute function public.developer_accounts_privileged_guard();

commit;

notify pgrst, 'reload schema';

-- ── ROLLBACK (A): restores the policies exactly as they were before this file ────────────────────────
-- drop policy if exists leads_owner_read on public.developer_leads;
-- create policy leads_owner_read on public.developer_leads for select to public
--   using (developer_id = my_developer_account_id());
-- drop policy if exists leads_owner_update on public.developer_leads;
-- create policy leads_owner_update on public.developer_leads for update to public
--   using (developer_id = my_developer_account_id()) with check (developer_id = my_developer_account_id());
-- ROLLBACK (B): drop trigger if exists developer_accounts_privileged_guard on public.developer_accounts;
