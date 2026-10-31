-- phase25_agreement_documents.sql  (idempotent; NOT yet applied anywhere. Run inspect_applied_state.sql first, see the notes at the end.)
--
-- Adds the document trail to the EXISTING agreement_requests workflow (it is not replaced):
--   agreement_documents        one row per file, three kinds:
--                                issued        a version MANOP prepared and sent (frozen once issued; revisions are new versions)
--                                signed_copy   the requester's physically signed copy, tied to the exact issued version
--                                final_executed MANOP's countersigned final record
--   agreement_document_events  append-only audit (uploads, issue, downloads, review, countersignature)
--   agreement_requests         + opportunity_kind, scope_note, and two new statuses (signed_copy_received, countersignature_pending)
-- Files are private Cloudinary (authenticated delivery); browsers have no table access, routes authorise and use the service role.
-- "executed" can only be reached while a final_executed document exists for the request (trigger below), so execution can never be
-- recorded by a status change alone. Nothing here verifies an opportunity, publishes it or activates commercial coverage.
-- Legal: templates and the signing method are not legally approved. legal_review_status stays 'unreviewed' until a lawyer clears them.

-- 1. agreement_requests: opportunity kind, scope note, new statuses --------------------------------------------------------
alter table public.agreement_requests add column if not exists opportunity_kind text;
alter table public.agreement_requests add column if not exists scope_note text;
alter table public.agreement_requests drop constraint if exists agreement_requests_opportunity_kind_check;
alter table public.agreement_requests add constraint agreement_requests_opportunity_kind_check
  check (opportunity_kind is null or opportunity_kind in ('development','land','redevelopment','agency_level'));

-- The existing status check has a name we have not seen; find every check on this table that mentions 'awaiting_signature' and replace it.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.agreement_requests'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%awaiting_signature%' loop
    execute format('alter table public.agreement_requests drop constraint %I', c.conname);
  end loop;
  alter table public.agreement_requests add constraint agreement_requests_status_check
    check (status in ('draft','submitted','information_required','under_review','clarification_requested','ready_for_agreement_preparation',
                      'agreement_prepared','agreement_sent','awaiting_signature','signed_copy_received','countersignature_pending',
                      'executed','declined','withdrawn'));
end $$;

-- 2. documents -----------------------------------------------------------------------------------------------------------------
create table if not exists public.agreement_documents (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.agreement_requests(id),
  kind          text not null check (kind in ('issued','signed_copy','final_executed')),
  version_number integer not null check (version_number >= 1),
  issued_version_id uuid references public.agreement_documents(id),            -- signed_copy / final_executed point at the exact issued version
  status        text not null default 'pending_upload'
                check (status in ('pending_upload','upload_failed','draft','issued','superseded','withdrawn','received','accepted','held','rejected','final')),
  title         text,
  scope_summary text,                         -- issued: what the agreement covers, in MANOP's words
  terms_summary text,                         -- issued: headline commercial terms as written in the document (no rule is applied from this)
  legal_review_status text not null default 'unreviewed' check (legal_review_status in ('unreviewed','in_review','approved')),
  covered_project_ids uuid[] not null default '{}',   -- issued: exact developments covered, snapshotted when issued
  original_filename text,
  format        text check (format is null or format in ('pdf','jpg','png')),
  bytes         integer check (bytes is null or (bytes > 0 and bytes <= 10485760)),
  cloudinary_public_id text,                  -- server side only
  cloudinary_resource_type text not null default 'raw',
  cloudinary_delivery_type text not null default 'authenticated' check (cloudinary_delivery_type = 'authenticated'),
  uploaded_by   uuid not null,
  uploaded_by_role text not null check (uploaded_by_role in ('requester','admin')),
  uploaded_at   timestamptz,
  issued_at     timestamptz,
  issued_by     uuid,
  requester_note text,                        -- signed_copy: the requester's optional note
  review_note   text,                         -- signed_copy: MANOP's note when held or rejected
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  countersigned_by uuid,                      -- final_executed: the authorised MANOP user recording the countersignature
  countersigner_name text,
  countersigner_title text,
  signing_method text,                        -- final_executed: how it was signed (to be confirmed with MANOP's lawyer)
  signing_reference text,                     -- final_executed: provider / certificate / envelope reference, if any
  countersigned_at timestamptz,
  created_at    timestamptz not null default now(),
  check (status in ('pending_upload','upload_failed') or cloudinary_public_id is not null),
  check (kind <> 'issued' or status in ('pending_upload','upload_failed','draft','issued','superseded','withdrawn')),
  check (kind <> 'signed_copy' or (issued_version_id is not null and status in ('pending_upload','upload_failed','received','accepted','held','rejected','superseded'))),
  check (kind <> 'final_executed' or (issued_version_id is not null and status in ('pending_upload','upload_failed','final')
         and (status <> 'final' or (countersigned_by is not null and signing_method is not null and countersigned_at is not null))))
);
create unique index if not exists agreement_documents_issued_version_uq on public.agreement_documents (request_id, version_number) where kind = 'issued';
create unique index if not exists agreement_documents_one_live_signed_uq on public.agreement_documents (issued_version_id) where kind = 'signed_copy' and status in ('received','accepted');
create unique index if not exists agreement_documents_one_final_uq on public.agreement_documents (request_id) where kind = 'final_executed' and status = 'final';
create unique index if not exists agreement_documents_one_issued_live_uq on public.agreement_documents (request_id) where kind = 'issued' and status = 'issued';
create index if not exists agreement_documents_request_idx on public.agreement_documents (request_id, created_at);

create table if not exists public.agreement_document_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.agreement_requests(id),
  document_id uuid references public.agreement_documents(id),
  event_type  text not null,
  actor_user_id uuid,
  actor_role  text not null check (actor_role in ('requester','admin','system')),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists agreement_document_events_request_idx on public.agreement_document_events (request_id, created_at);

create or replace function public.agreement_document_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'agreement_document_events are append-only'; end $$;
drop trigger if exists agreement_document_events_no_change on public.agreement_document_events;
create trigger agreement_document_events_no_change before update or delete on public.agreement_document_events
  for each row execute function public.agreement_document_events_immutable();

-- Documents are never deleted, and an issued version's content never changes: only its status may move on (issued -> superseded/withdrawn).
create or replace function public.agreement_documents_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'agreement documents are kept for the record and cannot be deleted'; end if;
  if tg_op = 'UPDATE' then
    if new.request_id <> old.request_id or new.kind <> old.kind or new.version_number <> old.version_number
       or new.issued_version_id is distinct from old.issued_version_id then
      raise exception 'an agreement document cannot be moved to another request, kind or version';
    end if;
    if old.status in ('issued','superseded','withdrawn','final','received','accepted','held','rejected') and
       (new.cloudinary_public_id is distinct from old.cloudinary_public_id or new.bytes is distinct from old.bytes
        or new.original_filename is distinct from old.original_filename or new.covered_project_ids is distinct from old.covered_project_ids
        or new.title is distinct from old.title or new.scope_summary is distinct from old.scope_summary
        or new.terms_summary is distinct from old.terms_summary or new.requester_note is distinct from old.requester_note) then
      raise exception 'the content of a prepared, issued or returned agreement document cannot be changed; issue a new version instead';
    end if;
    if old.kind = 'issued' and old.status in ('issued','superseded','withdrawn') and new.status = 'draft' then
      raise exception 'an issued version cannot go back to draft';
    end if;
    if old.kind = 'final_executed' and old.status = 'final' and new.status is distinct from old.status then
      raise exception 'the executed record cannot be changed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists agreement_documents_guard_t on public.agreement_documents;
create trigger agreement_documents_guard_t before update or delete on public.agreement_documents
  for each row execute function public.agreement_documents_guard();

-- 3. "executed" needs a final countersigned record ---------------------------------------------------------------------------
create or replace function public.agreement_requests_execution_guard() returns trigger language plpgsql as $$
begin
  if new.status = 'executed' and (tg_op = 'INSERT' or old.status is distinct from 'executed') then
    if not exists (select 1 from public.agreement_documents d where d.request_id = new.id and d.kind = 'final_executed' and d.status = 'final') then
      raise exception 'an agreement cannot be marked executed without a countersigned final record';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists agreement_requests_execution_guard_t on public.agreement_requests;
create trigger agreement_requests_execution_guard_t before insert or update of status on public.agreement_requests
  for each row execute function public.agreement_requests_execution_guard();

-- 4. one development, one live request (prevents duplicate / cross-linked coverage) -------------------------------------------------
-- A development may sit in only one request that is submitted and not closed (declined / withdrawn). Drafts do not block.
create or replace function public.agreement_project_conflict(p_request uuid, p_project uuid) returns uuid language sql stable as $$
  select r.id from public.agreement_request_developments l join public.agreement_requests r on r.id = l.request_id
   where l.project_id = p_project and l.request_id <> p_request and r.status not in ('draft','declined','withdrawn') limit 1
$$;
create or replace function public.agreement_links_guard() returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from public.agreement_requests where id = new.request_id;
  if st is not null and st not in ('draft','declined','withdrawn') and public.agreement_project_conflict(new.request_id, new.project_id) is not null then
    raise exception 'this development is already part of another open agreement request';
  end if;
  return new;
end $$;
drop trigger if exists agreement_links_guard_t on public.agreement_request_developments;
create trigger agreement_links_guard_t before insert on public.agreement_request_developments for each row execute function public.agreement_links_guard();

create or replace function public.agreement_submit_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'draft' and new.status not in ('draft','withdrawn') then
    if exists (select 1 from public.agreement_request_developments l where l.request_id = new.id and public.agreement_project_conflict(new.id, l.project_id) is not null) then
      raise exception 'a development in this request is already part of another open agreement request';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists agreement_submit_guard_t on public.agreement_requests;
create trigger agreement_submit_guard_t before update of status on public.agreement_requests for each row execute function public.agreement_submit_guard();

-- 5. RLS: no browser access; admin read; service role does the writing after the route has authorised the caller ----------------------------
do $$
declare t text;
begin
  foreach t in array array['agreement_documents','agreement_document_events'] loop
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

-- NOTES FOR DEV
-- * Existing rows in agreement_requests that are already 'executed' are untouched (the guard fires only on a change INTO executed). Their manual
--   evidence reference stays as it is; they have no final_executed document.
-- * If the status check on agreement_requests was written differently from the pattern searched above, the do-block adds the new check anyway
--   and an old one may still reject the two new statuses. Inspect with:
--     select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.agreement_requests'::regclass and contype='c';
-- * Rollback: drop the triggers/functions above, drop table agreement_document_events, agreement_documents; restore the old status check.
