-- inspect_one_at_a_time.sql — READ ONLY. The Supabase SQL editor shows only the LAST result of whatever you run, so run these ONE AT A TIME:
-- highlight a single query (from its "select" to its ";"), press Run, copy the result, then do the next one. Send me results 1 to 6.

-- 1. Which migrations are really applied. Every row should say applied = true once everything is done.
select phase, marker, applied from (values
 ('phase11', 'developer_leads.site_id',                  exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='site_id')),
 ('phase12', 'table development_evidence',               to_regclass('public.development_evidence') is not null),
 ('phase14', 'developer_leads.unit_type_label',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='unit_type_label')),
 ('phase14', 'developer_leads.routing_status',           exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='routing_status')),
 ('phase15', 'developer_leads.referred_to_developer_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='referred_to_developer_at')),
 ('phase16', 'policy leads_owner_read',                  exists (select 1 from pg_policies where tablename='developer_leads' and policyname='leads_owner_read')),
 ('phase17', 'finance_product_events',                   to_regclass('public.finance_product_events') is not null),
 ('phase18', 'policy financing_requests_admin_all',      exists (select 1 from pg_policies where tablename='financing_requests' and policyname='financing_requests_admin_all')),
 ('phase23', 'agency_mandate_letters',                   to_regclass('public.agency_mandate_letters') is not null),
 ('phase24', 'paystack_payments',                        to_regclass('public.paystack_payments') is not null),
 ('phase25', 'agreement_documents',                      to_regclass('public.agreement_documents') is not null),
 ('phase26', 'fee_payment_requests',                     to_regclass('public.fee_payment_requests') is not null),
 ('phase27', 'approved terms v1-agreed-2026',            exists (select 1 from public.commercial_terms_versions where version_label='v1-agreed-2026' and status='approved')),
 ('phase27', 'covering_agreement reads completed record', exists (select 1 from pg_proc where proname='covering_agreement' and pg_get_functiondef(oid) like '%final_executed%')),
 ('phase28', 'developer_leads.manop_routing_required',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='manop_routing_required')),
 ('phase28', 'developer_projects.suspended_at',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_projects' and column_name='suspended_at')),
 ('phase28', 'usage_events',                             to_regclass('public.usage_events') is not null)
) as t(phase, marker, applied) order by phase, marker;

-- 2. Row level security must be ON for these tables.
select relname as table_name, relrowsecurity as rls_on from pg_class
 where relnamespace='public'::regnamespace and relname in ('developer_leads','developer_projects','sites','agreement_requests','agreement_documents','fee_payment_requests','fee_payments','usage_events','financing_requests') order by 1;

-- 3. The rules on agreement_requests that "record completed" must satisfy.
select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.agreement_requests'::regclass and contype='c' order by 1;

-- 4. Agreements that say "executed" but have no completed record (they will not count as coverage).
select r.id, r.reference, r.status, r.executed_at from public.agreement_requests r
 where r.status='executed' and not exists (select 1 from public.agreement_documents d where d.request_id=r.id and d.kind='final_executed' and d.status='final');

-- 5. The commercial terms versions and their approval state.
select version_label, status, effective_from, success_fee_schedule, agency_success_fee_schedule, legal_review_status from public.commercial_terms_versions order by created_at;

-- 6. Every development, and what depends on it (use this to decide what test data can be deleted; keep The Lavender).
select p.id, p.name, p.publish_status, p.submitted_via, p.created_at::date as created,
  (select count(*) from public.developer_leads l where l.project_id = p.id) as enquiries,
  (select count(*) from public.agreement_request_developments d where d.project_id = p.id) as agreement_links,
  (select count(*) from public.agency_mandate_letters m where m.project_id = p.id) as mandate_letters
from public.developer_projects p order by p.created_at;
