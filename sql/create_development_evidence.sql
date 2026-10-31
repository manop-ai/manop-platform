-- CREATE development_evidence — the per-claim evidence register for a development.
-- The live database returned PGRST205 ("Could not find the table 'public.development_evidence'"),
-- so Admin -> Development -> Evidence had nowhere to save. Five parts of the app already read or
-- write this table (admin development page, public development page, review queue count, Buyer
-- Pack, market intelligence); this creates it to match what that code uses.
--
-- Safe to run once. `create table if not exists`, so it does nothing if the table appears later.
-- It does not touch any other table. Run each numbered block on its own if the editor complains.

-- 1. The table. project_id takes the SAME TYPE as developer_projects.id (read from the catalogue).
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
    from pg_attribute a
   where a.attrelid = 'public.developer_projects'::regclass and a.attname = 'id' and not a.attisdropped;
  if t is null then raise exception 'developer_projects.id not found'; end if;

  if to_regclass('public.development_evidence') is null then
    execute format($f$
      create table public.development_evidence (
        id           uuid primary key default gen_random_uuid(),
        project_id   %s not null references public.developer_projects(id) on delete cascade,
        category     text not null check (category in (
                       'identity','site','unit_mix','floor_configuration','construction',
                       'amenities','architectural_design','location_positioning',
                       'pricing','payment_plan','planning','title','service_charge',
                       'parking','power_water','market_context','rental_yield',
                       'developer_track_record','consultant_professional','other')),
        claim        text not null check (length(btrim(claim)) > 0),
        source       text,
        status       text not null default 'unknown' check (status in (
                       'developer_stated','documented','manop_observed','manop_derived',
                       'independently_verified','professional_opinion','unknown',
                       'contradictory_clarification_required')),
        next_action  text,
        recorded_by  uuid references auth.users(id) on delete set null default auth.uid(),
        recorded_at  timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      )$f$, t);
  end if;
end $$;

-- 2.
create index if not exists development_evidence_project_idx on public.development_evidence(project_id, category);

-- 3. updated_at maintenance
create or replace function public.development_evidence_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists development_evidence_touch on public.development_evidence;
create trigger development_evidence_touch before update on public.development_evidence
  for each row execute function public.development_evidence_touch();

-- 4. Row-level security.
--    Write: MANOP admin only (evidence is recorded by MANOP, never by the developer or agency
--           it is about), using the same trusted check as the rest of the admin surface.
--    Read:  admin; the developer or submitting agency that owns the development; and the public
--           ONLY for developments MANOP has published.
alter table public.development_evidence enable row level security;

drop policy if exists "development_evidence admin all" on public.development_evidence;
create policy "development_evidence admin all" on public.development_evidence
  for all using (is_manop_admin()) with check (is_manop_admin());

drop policy if exists "development_evidence owner read" on public.development_evidence;
create policy "development_evidence owner read" on public.development_evidence
  for select using (exists (
    select 1 from public.developer_projects p
     where p.id = development_evidence.project_id
       and (p.developer_id = my_developer_account_id() or p.submitting_agency_id = my_agency_id())
  ));

drop policy if exists "development_evidence public read published" on public.development_evidence;
create policy "development_evidence public read published" on public.development_evidence
  for select using (exists (
    select 1 from public.developer_projects p
     where p.id = development_evidence.project_id and p.publish_status = 'published'
  ));

grant select on public.development_evidence to anon, authenticated;
grant insert, update, delete on public.development_evidence to authenticated;   -- narrowed by the admin-only policy above
grant all on public.development_evidence to service_role;

-- 5. Verify (read-only)
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'development_evidence' order by ordinal_position;
select policyname, cmd from pg_policies where tablename = 'development_evidence' order by 1;
