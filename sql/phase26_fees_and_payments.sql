-- phase26_fees_and_payments.sql  (idempotent; NOT yet applied. Apply after phase25.)
--
-- The smallest reliable fee workflow, built on what already exists:
--   agreement_fee_calculations (existing)  is the QUALIFYING TRANSACTION + FEE ASSESSMENT record. Here it only gains a transaction date and
--                                          supporting information. "confirmed" = MANOP has reviewed the assessment and approved it for a payment request.
--   fee_assessment_requests   a partner says "I believe a qualifying transaction happened"; MANOP reviews and, if it agrees, records the calculation.
--   fee_payment_requests      ONE obligation per confirmed assessment (unique while not withdrawn), so a retry can never create a second one.
--   fee_payments              every payment attempt or claim; nothing counts until MANOP VERIFIES it (amount, date, reference). Partial payments allowed.
--   fee_payment_events        append-only history: issue, deadline changes, partner messages, extension requests and decisions, claims, verification.
--   agreement_documents       issued versions now record that MANOP signed first (signatory, method, date) and which approved terms version applies.
-- Distinct stages, never inferred from each other: agreement completed -> transaction/assessment -> payment request -> payment claimed -> payment verified.
-- A pending or claimed payment is never "paid"; an unpaid balance never disappears; a deadline passing changes nothing except that it shows as overdue.
-- Provider-independent: methods are 'bank_transfer', 'paystack', 'other'. Paystack for fees is NOT wired here (only the column for its reference exists).

-- 1. transaction facts on the existing calculation record -------------------------------------------------------------------------
alter table public.agreement_fee_calculations add column if not exists transaction_date date;
alter table public.agreement_fee_calculations add column if not exists supporting_info text;

-- 2. agreement documents: the approved terms version the agreement was prepared with is linked to it.
--    MANOP signs first OUTSIDE this system and sends the signed PDF; the partner signs by hand and uploads it. There is no second MANOP signature.
--    Completion records the partner's returned copy as the completed record (the countersigned_* columns of the final row then mean
--    'completed by / completed at'; the names are kept from phase25 to avoid a rename migration). -----------------------------------------------------------------
alter table public.agreement_documents add column if not exists terms_version_id uuid references public.commercial_terms_versions(id);

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.agreement_documents'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) like '%final_executed%' and pg_get_constraintdef(oid) like '%signing_method%' loop
    execute format('alter table public.agreement_documents drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'agreement_documents_final_check') then
    alter table public.agreement_documents add constraint agreement_documents_final_check
      check (kind <> 'final_executed' or (issued_version_id is not null and status in ('pending_upload','upload_failed','final')
             and (status <> 'final' or (countersigned_by is not null and countersigned_at is not null))));
  end if;
end $$;

-- the content guard from phase25, now also freezing the new fields once a version is prepared
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
        or new.terms_summary is distinct from old.terms_summary or new.requester_note is distinct from old.requester_note
        or new.terms_version_id is distinct from old.terms_version_id) then
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

-- 3. partner requests a fee assessment ----------------------------------------------------------------------------------------------
create table if not exists public.fee_assessment_requests (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  request_id    uuid not null references public.agreement_requests(id),       -- the executed agreement the partner relies on
  requester_user_id uuid not null,
  project_id    uuid references public.developer_projects(id),
  description   text not null,
  claimed_value numeric(18,2) check (claimed_value is null or claimed_value > 0),
  currency      text,
  occurred_on   date,
  status        text not null default 'requested' check (status in ('requested','under_review','accepted','declined')),
  admin_note    text,
  calculation_id uuid references public.agreement_fee_calculations(id),
  decided_by    uuid, decided_at timestamptz,
  created_at    timestamptz not null default now(),
  check (status <> 'declined' or admin_note is not null)
);
create index if not exists fee_assessment_requests_request_idx on public.fee_assessment_requests (request_id);

-- 4. the payment obligation: ONE per confirmed assessment -----------------------------------------------------------------------------
create table if not exists public.fee_payment_requests (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,
  calculation_id uuid not null references public.agreement_fee_calculations(id),
  request_id    uuid not null references public.agreement_requests(id),       -- the linked agreement
  party_role    text not null check (party_role in ('agency','developer')),
  payer_user_id uuid not null,                                                -- the agreement's requester; this is who may see and answer it
  amount        numeric(18,2) not null check (amount > 0),
  currency      text not null,
  reason        text not null,
  instructions  text not null,                                                -- how to pay (bank details, or the online option when it exists)
  issued_at     timestamptz not null default now(),
  original_due_date date not null,
  due_date      date not null,
  status        text not null default 'issued' check (status in ('issued','partly_paid','paid','withdrawn')),
  withdrawn_reason text,
  created_by    uuid not null,
  created_at    timestamptz not null default now(),
  check (status <> 'withdrawn' or withdrawn_reason is not null)
);
create unique index if not exists fee_payment_requests_one_per_calc_uq on public.fee_payment_requests (calculation_id) where status <> 'withdrawn';
create index if not exists fee_payment_requests_payer_idx on public.fee_payment_requests (payer_user_id, created_at desc);

-- the facts of an obligation never change; only its deadline and status do
create or replace function public.fee_payment_requests_guard() returns trigger language plpgsql as $$
declare calc_status text;
begin
  if tg_op = 'DELETE' then raise exception 'payment requests are kept for the record'; end if;
  if tg_op = 'INSERT' then
    select status into calc_status from public.agreement_fee_calculations where id = new.calculation_id;
    if calc_status is distinct from 'confirmed' then raise exception 'a payment request needs an assessment that MANOP has reviewed and confirmed'; end if;
    return new;
  end if;
  if new.amount <> old.amount or new.currency <> old.currency or new.calculation_id <> old.calculation_id or new.request_id <> old.request_id
     or new.payer_user_id <> old.payer_user_id or new.reference <> old.reference or new.party_role <> old.party_role
     or new.original_due_date <> old.original_due_date or new.issued_at <> old.issued_at or new.reason <> old.reason then
    raise exception 'the amount, parties, reference and original deadline of a payment request cannot be changed';
  end if;
  if old.status = 'withdrawn' and new.status <> 'withdrawn' then raise exception 'a withdrawn payment request cannot be reopened'; end if;
  return new;
end $$;
drop trigger if exists fee_payment_requests_guard_t on public.fee_payment_requests;
create trigger fee_payment_requests_guard_t before insert or update or delete on public.fee_payment_requests
  for each row execute function public.fee_payment_requests_guard();

-- 5. payments / claims: nothing counts until verified ------------------------------------------------------------------------------------
create table if not exists public.fee_payments (
  id            uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.fee_payment_requests(id),
  method        text not null check (method in ('bank_transfer','paystack','other')),
  partner_reference text,
  amount_claimed numeric(18,2) check (amount_claimed is null or amount_claimed > 0),
  paid_on_claimed date,
  partner_note  text,
  paystack_reference text unique,                                              -- reserved for the later online option
  status        text not null default 'claimed' check (status in ('claimed','verified','rejected')),
  verified_amount numeric(18,2), verified_on date, verified_reference text,
  verified_by   uuid, verified_at timestamptz, verification_note text,
  created_by    uuid not null,
  created_by_role text not null check (created_by_role in ('partner','admin')),
  created_at    timestamptz not null default now(),
  check (status <> 'verified' or (verified_amount is not null and verified_amount > 0 and verified_on is not null and coalesce(btrim(verified_reference),'') <> '' and verified_by is not null)),
  check (status <> 'rejected' or coalesce(btrim(verification_note),'') <> '')
);
create index if not exists fee_payments_request_idx on public.fee_payments (payment_request_id, created_at);
-- the same bank/provider reference cannot be verified twice against one obligation
create unique index if not exists fee_payments_one_verified_ref_uq on public.fee_payments (payment_request_id, lower(verified_reference)) where status = 'verified';

create or replace function public.fee_payments_guard() returns trigger language plpgsql as $$
declare req record; already numeric(18,2);
begin
  if tg_op = 'DELETE' then raise exception 'payment records are kept for the record'; end if;
  if tg_op = 'UPDATE' and old.status in ('verified','rejected') then raise exception 'a verified or rejected payment record cannot be changed'; end if;
  select amount, status into req from public.fee_payment_requests where id = new.payment_request_id;
  if req.status = 'withdrawn' then raise exception 'this payment request was withdrawn'; end if;
  if new.status = 'verified' then
    select coalesce(sum(verified_amount),0) into already from public.fee_payments where payment_request_id = new.payment_request_id and status = 'verified' and id <> new.id;
    if already + new.verified_amount > req.amount then raise exception 'verified payments cannot exceed the amount requested'; end if;
  end if;
  return new;
end $$;
drop trigger if exists fee_payments_guard_t on public.fee_payments;
create trigger fee_payments_guard_t before insert or update or delete on public.fee_payments
  for each row execute function public.fee_payments_guard();

-- 6. history (append-only) -------------------------------------------------------------------------------------------------------------------
create table if not exists public.fee_payment_events (
  id            uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.fee_payment_requests(id),
  payment_id    uuid references public.fee_payments(id),
  event_type    text not null,
  actor_user_id uuid,
  actor_role    text not null check (actor_role in ('partner','admin','system')),
  message       text,
  proposed_date date,
  decided_date  date,
  visible_to_partner boolean not null default true,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists fee_payment_events_request_idx on public.fee_payment_events (payment_request_id, created_at);
create or replace function public.fee_payment_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'fee_payment_events are append-only'; end $$;
drop trigger if exists fee_payment_events_no_change on public.fee_payment_events;
create trigger fee_payment_events_no_change before update or delete on public.fee_payment_events
  for each row execute function public.fee_payment_events_immutable();

-- 7. RLS: no browser access; admin read; the service role writes after a route has authorised the caller -----------------------------------
do $$
declare t text;
begin
  foreach t in array array['fee_assessment_requests','fee_payment_requests','fee_payments','fee_payment_events'] loop
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
-- * Rollback: drop the four fee_* tables and their functions/triggers; the added columns are harmless to leave.
-- * Nothing here sends email or calls a payment provider.
