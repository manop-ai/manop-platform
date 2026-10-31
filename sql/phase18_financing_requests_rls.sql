-- phase18_financing_requests_rls.sql  (UNAPPLIED: review, then apply to DEV only)
--
-- Why: phase16_verify shows financing_requests has ONE policy, "financing_requests_open": ALL, roles {public},
-- using true / with check true. That lets anyone holding the public anon key read, edit and delete every buyer's
-- name, email, phone and finance figures.
--
-- What the code needs (checked in the repo): the browser only INSERTS (components/FinancingModal.tsx, no .select()
-- on the insert) and only the admin page reads/updates (app/admin/page.tsx, signed in as an admin).
-- So: keep anonymous/authenticated INSERT, remove everything else for them, give admins full access.
--
-- Not covered: buyers reading their own request status (no user-ownership column has been confirmed; inspect first):
--   select column_name from information_schema.columns where table_name='financing_requests' order by ordinal_position;

begin;

drop policy if exists financing_requests_open on public.financing_requests;

create policy financing_requests_insert_public on public.financing_requests
  for insert to anon, authenticated
  with check (true);

create policy financing_requests_admin_all on public.financing_requests
  for all to authenticated
  using (is_manop_admin())
  with check (is_manop_admin());

create policy financing_requests_service_all on public.financing_requests
  for all to service_role
  using (true) with check (true);

alter table public.financing_requests enable row level security;

commit;

-- Rollback (restores the open policy; only if you must):
--   drop policy financing_requests_insert_public on public.financing_requests;
--   drop policy financing_requests_admin_all on public.financing_requests;
--   drop policy financing_requests_service_all on public.financing_requests;
--   create policy financing_requests_open on public.financing_requests for all to public using (true) with check (true);
