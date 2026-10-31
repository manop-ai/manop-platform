-- phase27_agreed_terms_and_coverage.sql  (idempotent; apply AFTER phase25 and phase26)
--
-- A. The agreed commercial terms, recorded as ONE approved terms version (founder decision, not re-approved here):
--      agency    : flat 1.5% of the qualifying transaction value, payer = agency
--      developer : 2% up to and including NGN 500m; 1.5% above 500m up to and including NGN 1bn; 1% above NGN 1bn.
--                  The applicable rate applies to the WHOLE qualifying transaction value. Payer = developer.
--    The two schedules are separate columns and nothing falls back from one to the other.
--    Approved versions are immutable (database guard), so existing approved versions with different schedules are marked SUPERSEDED and a new
--    approved version is added. Agreements already completed keep the snapshot they took; nothing is rewritten.
--    Legal review status is left as it is: it does not block use. No agency commitment months are invented (left empty).
-- B. covering_agreement() now reads the COMPLETED RECORD. The earlier definition required rows in agreement_acceptances for the fee payer and MANOP,
--    which the simplified workflow (MANOP signs first, partner returns a signed copy, MANOP records it as completed) does not create. An executed
--    request with no completed document never counts as coverage (so old executed statuses are NOT treated as verified coverage).

-- A ------------------------------------------------------------------------------------------------------------------------------------
do $$
declare
  dev_sched jsonb := '[{"up_to":500000000,"rate_pct":2},{"up_to":1000000000,"rate_pct":1.5},{"up_to":null,"rate_pct":1}]'::jsonb;
  ag_sched  jsonb := '[{"up_to":null,"rate_pct":1.5}]'::jsonb;
  founder   uuid;
  keep      uuid;
  new_id    uuid;
begin
  select id into founder from auth.users where lower(email) = 'joelnkemjieme469@gmail.com' limit 1;

  select id into keep from public.commercial_terms_versions
   where status = 'approved' and success_fee_schedule = dev_sched and agency_success_fee_schedule = ag_sched
         and coalesce(fee_currency,'NGN') = 'NGN' and coalesce(fee_payer,'developer') = 'developer' and coalesce(agency_fee_payer,'agency') = 'agency'
   order by approved_at desc nulls last limit 1;

  if keep is not null then
    raise notice 'phase27: an approved version with the agreed schedules already exists (%); nothing changed', keep;
    return;
  end if;

  -- older approved versions with different terms stop being the current terms (their own agreements keep their snapshots)
  update public.commercial_terms_versions set status = 'superseded' where status = 'approved';

  insert into public.commercial_terms_versions
    (version_label, status, success_fee_schedule, agency_success_fee_schedule, fee_currency, fee_payer, agency_fee_payer, qualifying_milestones, notes, created_by)
  values ('v1-agreed-2026', 'draft', dev_sched, ag_sched, 'NGN', 'developer', 'agency',
          coalesce((select qualifying_milestones from public.commercial_terms_versions where qualifying_milestones is not null order by created_at desc limit 1),
                   array['qualifying_payment_reported']),
          'Agreed by the founder. Agency: flat 1.5% of the qualifying transaction value. Developer: 2% up to and including NGN 500m, 1.5% above 500m up to and including NGN 1bn, 1% above NGN 1bn; the rate applies to the whole value. Legal review is arranged separately and does not block use.',
          founder)
  on conflict (version_label) do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id from public.commercial_terms_versions where version_label = 'v1-agreed-2026';
    raise notice 'phase27: version label v1-agreed-2026 already existed (%); check its status and schedules in the admin Commercial panel', new_id;
    return;
  end if;

  update public.commercial_terms_versions
     set status = 'approved', effective_from = current_date, approved_by = founder, approved_at = now()
   where id = new_id;
end $$;

-- B ------------------------------------------------------------------------------------------------------------------------------------
create or replace function public.covering_agreement(p_project uuid, p_site uuid default null, p_at timestamptz default now())
returns table(agreement_id uuid, reference text, status text, executed_at timestamptz, effective_date date, fee_payer text,
              terms_version_id uuid, rate_schedule_version text, fee_basis text, relationship_kind text)
language sql stable security definer set search_path to 'public' as $function$
  select r.id, r.reference, r.status, r.executed_at, coalesce(r.effective_date, r.executed_at::date), r.fee_payer,
         r.terms_version_id, v.version_label, r.fee_basis, r.relationship_kind
  from agreement_requests r
  left join commercial_terms_versions v on v.id = r.terms_version_id
  where r.status = 'executed'
    and coalesce(r.effective_date, r.executed_at::date) <= p_at::date
    -- a completed record must exist: the accepted partner-signed copy recorded by MANOP
    and exists (select 1 from agreement_documents f where f.request_id = r.id and f.kind = 'final_executed' and f.status = 'final')
    and not exists (select 1 from agreement_requests s where s.supersedes_request_id = r.id and s.status = 'executed'
                    and coalesce(s.effective_date, s.executed_at::date) <= p_at::date)
    and ((p_project is not null and exists (
            select 1 from agreement_request_developments d
              join agreement_documents f on f.request_id = r.id and f.kind = 'final_executed' and f.status = 'final'
              join agreement_documents i on i.id = f.issued_version_id
             where d.request_id = r.id and d.project_id = p_project and p_project = any(i.covered_project_ids)))
      or (p_site is not null and exists (select 1 from agreement_request_sites s2 where s2.request_id = r.id and s2.site_id = p_site)))
  order by coalesce(r.effective_date, r.executed_at::date) desc, r.executed_at desc
  limit 1
$function$;

-- NOTES FOR DEV
-- * Rollback of B: re-create the previous definition from the inspect output you saved. Rollback of A: set the new version to 'withdrawn'.
-- * This file does not touch any agreement, document, payment or fee record.
