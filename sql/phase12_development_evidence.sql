-- PHASE 12 — create the development evidence register.   NOT YET APPLIED.
--
-- Why: Admin -> Development -> Evidence fails with
--   "Could not find the table 'public.development_evidence' in the schema cache (PGRST205)".
-- The register is used by the admin page, the public development page, the Buyer Pack,
-- the completeness checklist and market intelligence, but the table was never created.
--
-- STEP 0 (run first, on its own). If it returns a name, the table EXISTS and only PostgREST's
-- cache is stale: run just the last line of this file (notify pgrst ...) instead of the migration.
--   select to_regclass('public.development_evidence');
--
-- Columns are exactly those the code reads and writes:
--   project_id, category, claim, source, status, next_action, recorded_at   (+ id, recorded_by for audit)
-- category and status values are the two lists in app/admin/developments/page.tsx and
-- lib/development-standard.ts. "Recording a source" never marks anything verified: status
-- defaults to 'unknown' and only an admin chooses a stronger one.

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
        category     text not null default 'other' check (category in (
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
        recorded_at  timestamptz not null default now(),
        recorded_by  uuid default auth.uid()
      )$f$, t);
  end if;
end $$;

create index if not exists development_evidence_project_idx on public.development_evidence(project_id, recorded_at desc);

alter table public.development_evidence enable row level security;

-- MANOP admin: full control (trusted check, never user_metadata).
drop policy if exists "development_evidence admin all" on public.development_evidence;
create policy "development_evidence admin all" on public.development_evidence
  for all using (is_manop_admin()) with check (is_manop_admin());

-- Ownership / published checks live in small SECURITY DEFINER functions so they do not depend on
-- which developer_projects rows the CALLER happens to be allowed to see. They return only a boolean.
create or replace function public.evidence_project_is_published(pid anyelement) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from developer_projects p where p.id::text = pid::text and p.publish_status = 'published')
$$;

create or replace function public.evidence_project_is_mine(pid anyelement) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from developer_projects p
                  where p.id::text = pid::text
                    and ((p.developer_id is not null and p.developer_id = my_developer_account_id())
                      or (p.submitting_agency_id is not null and p.submitting_agency_id = my_agency_id())))
$$;

grant execute on function public.evidence_project_is_published(anyelement), public.evidence_project_is_mine(anyelement) to anon, authenticated;

-- The public development page, Buyer Pack and market intelligence read evidence for
-- PUBLISHED developments only (published requires the reviewed_at review step).
drop policy if exists "development_evidence public read published" on public.development_evidence;
create policy "development_evidence public read published" on public.development_evidence
  for select using (public.evidence_project_is_published(project_id));

-- The developer account that owns a development, and the agency that submitted it, may READ
-- its evidence (the completeness checklist on their dashboards). They cannot write it.
drop policy if exists "development_evidence owner read" on public.development_evidence;
create policy "development_evidence owner read" on public.development_evidence
  for select using (public.evidence_project_is_mine(project_id));

-- Make PostgREST see the new table immediately.
notify pgrst, 'reload schema';
