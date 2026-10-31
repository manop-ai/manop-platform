-- phase28_routing_suspend_usage.sql  (idempotent; apply after phase27)
--
-- 1. ROUTING: every new development/site enquiry is held by MANOP until an admin routes it to the partner in charge.
--      developer_leads.manop_routing_required   set by the intake route on new development/site enquiries
--      developer_leads.referred_to_developer_at / referred_by_user_id   (phase15 names, kept) = when and by whom MANOP routed it
--      developer_leads.routing_note
--    A RESTRICTIVE select policy means no browser session (developer, agency, landowner) can read a held lead even through the dashboards that
--    read the table directly; the buyer and MANOP admins always can; the service role (server routes) is not affected.
-- 2. PUBLICATION GATE: a partner-submitted development/site cannot be published until a COMPLETED agreement covers it. MANOP-created
--    developments are never gated. Rows that are already published are untouched (the trigger only fires on the change to 'published').
--      developer_projects.partner_submitted    true for agency submissions (backfilled) and developments a partner creates (set by the route)
--      sites: gated when entry_source is 'agency_submission' or 'developer_self'. Landowner-submitted sites are NOT gated here: that gate
--      waits for MANOP's ownership/authority verification policy.
-- 3. SUSPEND: developer_projects.suspended_at/reason/by. A suspended development is set back to 'draft' (so every public page that only shows
--    'published' stops showing it and enquiries are refused) and cannot be published again until an admin reinstates it.
-- 4. USAGE: usage_events (anonymous page visits) and usage_by_month() for the admin Usage page.
-- Nothing here deletes or rewrites an existing record.

-- 1 ------------------------------------------------------------------------------------------------------------------------------------
alter table public.developer_leads add column if not exists manop_routing_required boolean not null default false;
alter table public.developer_leads add column if not exists referred_to_developer_at timestamptz;
alter table public.developer_leads add column if not exists referred_by_user_id uuid;
alter table public.developer_leads add column if not exists routing_note text;

drop policy if exists developer_leads_held_until_routed on public.developer_leads;
create policy developer_leads_held_until_routed on public.developer_leads
  as restrictive for select to authenticated
  using (not manop_routing_required or referred_to_developer_at is not null or user_id = auth.uid() or public.is_manop_admin());

-- 2 + 3 ------------------------------------------------------------------------------------------------------------------------------
alter table public.developer_projects add column if not exists partner_submitted boolean not null default false;
alter table public.developer_projects add column if not exists suspended_at timestamptz;
alter table public.developer_projects add column if not exists suspended_reason text;
alter table public.developer_projects add column if not exists suspended_by uuid;

update public.developer_projects set partner_submitted = true where submitting_agency_id is not null and partner_submitted = false;

create or replace function public.developer_projects_publish_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.submitting_agency_id is not null then new.partner_submitted := true; end if;
  if new.publish_status = 'published' and (tg_op = 'INSERT' or old.publish_status is distinct from 'published') then
    if new.suspended_at is not null then
      raise exception 'This development is suspended. Reinstate it before publishing.';
    end if;
    if new.partner_submitted and not exists (select 1 from public.covering_agreement(new.id)) then
      raise exception 'A completed agreement that names this development is required before MANOP publishes a partner-submitted development.';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.suspended_at is not null and old.suspended_at is null and new.publish_status = 'published' then
    new.publish_status := 'draft';          -- suspending always takes it off the public site
  end if;
  return new;
end $$;
drop trigger if exists developer_projects_publish_guard_t on public.developer_projects;
create trigger developer_projects_publish_guard_t before insert or update on public.developer_projects
  for each row execute function public.developer_projects_publish_guard();

create or replace function public.sites_publish_guard() returns trigger language plpgsql as $$
begin
  if new.site_status = 'published' and (tg_op = 'INSERT' or old.site_status is distinct from 'published')
     and new.entry_source in ('agency_submission','developer_self')
     and not exists (select 1 from public.covering_agreement(null, new.id)) then
    raise exception 'A completed agreement that names this opportunity is required before MANOP publishes a partner-submitted site.';
  end if;
  return new;
end $$;
drop trigger if exists sites_publish_guard_t on public.sites;
create trigger sites_publish_guard_t before insert or update on public.sites
  for each row execute function public.sites_publish_guard();

-- 4 ---------------------------------------------------------------------------------------------------------------------------------------
create table if not exists public.usage_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  visitor_id   text not null check (length(visitor_id) between 8 and 64),   -- random id kept in the visitor's own browser; no IP address is stored
  user_id      uuid,                                                          -- only when the visitor was signed in
  path         text not null check (length(path) <= 300),
  referrer_host text
);
create index if not exists usage_events_time_idx on public.usage_events (occurred_at);
create index if not exists usage_events_visitor_idx on public.usage_events (visitor_id, occurred_at);
alter table public.usage_events enable row level security;
drop policy if exists usage_events_admin_select on public.usage_events;
create policy usage_events_admin_select on public.usage_events for select to authenticated using (public.is_manop_admin());
drop policy if exists usage_events_service_all on public.usage_events;
create policy usage_events_service_all on public.usage_events for all to service_role using (true) with check (true);
revoke all on public.usage_events from anon, authenticated;
grant select on public.usage_events to authenticated;
grant select, insert, delete on public.usage_events to service_role;

create or replace function public.usage_by_month(p_months integer default 12)
returns table(month date, visitors bigint, page_views bigint, signed_in_users bigint, new_signups bigint, enquiries bigint, routed_enquiries bigint)
language sql stable security definer set search_path = public as $$
  with months as (
    select (date_trunc('month', now()) - (g || ' month')::interval)::date as m from generate_series(0, greatest(p_months,1) - 1) g
  )
  select m.m,
    (select count(distinct e.visitor_id) from usage_events e where e.occurred_at >= m.m and e.occurred_at < m.m + interval '1 month'),
    (select count(*) from usage_events e where e.occurred_at >= m.m and e.occurred_at < m.m + interval '1 month'),
    (select count(distinct e.user_id) from usage_events e where e.user_id is not null and e.occurred_at >= m.m and e.occurred_at < m.m + interval '1 month'),
    (select count(*) from auth.users u where u.created_at >= m.m and u.created_at < m.m + interval '1 month'),
    (select count(*) from developer_leads l where l.created_at >= m.m and l.created_at < m.m + interval '1 month'),
    (select count(*) from developer_leads l where l.referred_to_developer_at >= m.m and l.referred_to_developer_at < m.m + interval '1 month')
  from months m order by m.m desc
$$;
revoke all on function public.usage_by_month(integer) from public, anon, authenticated;
grant execute on function public.usage_by_month(integer) to service_role;

-- NOTES FOR DEV
-- * Needs phase27 first (covering_agreement now reads the completed record). The publication gate calls it.
-- * If developer_leads has row level security OFF, the restrictive policy does nothing: run sql/inspect_applied_state.sql and check.
-- * Rollback: drop the two triggers and the policy; the added columns are harmless to leave.
