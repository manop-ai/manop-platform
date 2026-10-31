-- phase23_agency_mandate_letters.sql  (idempotent; inspect first, see the inspection block at the end)
--
-- Mandate letters are UPLOADED documents (private Cloudinary, authenticated delivery), not URLs.
--   agency_mandate_letters   one row per uploaded file: who, when, file facts, review status, visibility (default internal), Cloudinary id
--                            (server-side only), version chain. Browsers have no table access; routes authorise and use the service role.
--   mandate_letter_events    append-only audit trail (upload, replace, review, visibility change, removal, access grants by admin)
--   developer_projects       gets mandate_letter_id. A trigger makes sure an agency submission links ITS OWN, non-rejected letter,
--                            and that an agency submission cannot be published until that letter has been accepted by MANOP.
-- Review status, visibility and development publication are separate columns/records; nothing here couples them.

create table if not exists public.agency_mandate_letters (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.data_partners(id) on delete cascade,
  project_id         uuid references public.developer_projects(id) on delete set null,
  version            integer not null default 1,
  status             text not null default 'pending_upload'
                     check (status in ('pending_upload','uploaded','under_review','approved','changes_requested','rejected','superseded','removed','upload_failed')),
  visibility         text not null default 'internal' check (visibility in ('internal','public')),
  original_filename  text,
  format             text check (format is null or format in ('pdf','jpg','png')),
  bytes              integer check (bytes is null or (bytes > 0 and bytes <= 10485760)),
  cloudinary_public_id text,                       -- server-side only; never returned to browsers
  cloudinary_resource_type text not null default 'raw',
  cloudinary_delivery_type text not null default 'authenticated' check (cloudinary_delivery_type = 'authenticated'),
  uploaded_by        uuid not null,
  uploaded_at        timestamptz,
  reviewed_by        uuid,
  reviewed_at        timestamptz,
  review_note        text,
  visibility_changed_by uuid,
  visibility_changed_at timestamptz,
  supersedes_id      uuid references public.agency_mandate_letters(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (visibility = 'internal' or status = 'approved'),                       -- public only while accepted
  check (status in ('pending_upload','upload_failed') or cloudinary_public_id is not null)
);
create index if not exists agency_mandate_letters_agency_idx on public.agency_mandate_letters (agency_id, created_at desc);
create index if not exists agency_mandate_letters_project_idx on public.agency_mandate_letters (project_id);

create table if not exists public.mandate_letter_events (
  id          uuid primary key default gen_random_uuid(),
  letter_id   uuid not null references public.agency_mandate_letters(id) on delete cascade,
  agency_id   uuid not null,
  event_type  text not null,
  actor_user_id uuid,
  actor_role  text not null check (actor_role in ('agency','admin','system')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists mandate_letter_events_letter_idx on public.mandate_letter_events (letter_id, created_at);
create or replace function public.mandate_letter_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'mandate_letter_events are append-only'; end $$;
drop trigger if exists mandate_letter_events_no_change on public.mandate_letter_events;
create trigger mandate_letter_events_no_change before update or delete on public.mandate_letter_events
  for each row execute function public.mandate_letter_events_immutable();

do $$
declare t text;
begin
  foreach t in array array['agency_mandate_letters','mandate_letter_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (is_manop_admin())', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- developer_projects link + guard
alter table public.developer_projects add column if not exists mandate_letter_id uuid references public.agency_mandate_letters(id);

create or replace function public.developer_projects_mandate_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare l record; privileged boolean;
begin
  if new.submitting_agency_id is null then return new; end if;
  privileged := auth.uid() is null or coalesce(is_manop_admin(), false);   -- service role / admin tooling
  if new.mandate_letter_id is not null and (tg_op = 'INSERT' or new.mandate_letter_id is distinct from old.mandate_letter_id) then
    select * into l from public.agency_mandate_letters where id = new.mandate_letter_id;
    if not found or l.agency_id <> new.submitting_agency_id then raise exception 'The mandate letter does not belong to this agency'; end if;
    if l.status in ('rejected','superseded','removed','pending_upload','upload_failed') then raise exception 'That mandate letter cannot be used (status: %)', l.status; end if;
    if l.project_id is not null and l.project_id <> new.id then raise exception 'That mandate letter is already attached to another development'; end if;
  end if;
  if not privileged then
    if new.mandate_letter_id is null and (tg_op = 'INSERT' or new.mandate_document_url is distinct from old.mandate_document_url) then
      raise exception 'Upload the mandate letter through MANOP; a document link is not accepted';
    end if;
  end if;
  if new.publish_status = 'published' and (tg_op = 'INSERT' or old.publish_status is distinct from 'published') and new.mandate_letter_id is not null then
    select status into l from public.agency_mandate_letters where id = new.mandate_letter_id;
    if l.status is distinct from 'approved' then raise exception 'The agency mandate letter has not been accepted by MANOP, so this development cannot be published'; end if;
  end if;
  return new;
end $$;
drop trigger if exists developer_projects_mandate_guard on public.developer_projects;
create trigger developer_projects_mandate_guard before insert or update on public.developer_projects
  for each row execute function public.developer_projects_mandate_guard();

-- attach the letter to the project once the project row exists
create or replace function public.developer_projects_mandate_attach() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.mandate_letter_id is not null then
    update public.agency_mandate_letters set project_id = new.id, updated_at = now() where id = new.mandate_letter_id and project_id is null;
  end if;
  return new;
end $$;
drop trigger if exists developer_projects_mandate_attach on public.developer_projects;
create trigger developer_projects_mandate_attach after insert or update of mandate_letter_id on public.developer_projects
  for each row execute function public.developer_projects_mandate_attach();

-- IMPACT: existing projects and legacy mandate_document_url values are untouched. Legacy agency projects without a letter can still be
-- edited and published by an admin (privileged) but a signed-in agency can no longer set a URL instead of uploading.
-- ROLLBACK: drop trigger developer_projects_mandate_guard/attach on developer_projects; drop functions; alter table developer_projects drop column mandate_letter_id;
--           drop table mandate_letter_events; drop table agency_mandate_letters;
--
-- INSPECT BEFORE APPLYING (run in DEV, report the result):
--   select column_name, data_type from information_schema.columns where table_name = 'developer_projects' and column_name like 'mandate%';
--   select tgname from pg_trigger where tgrelid = 'public.developer_projects'::regclass and not tgisinternal;
--   select to_regclass('public.agency_mandate_letters');   -- expect null before, a name after
