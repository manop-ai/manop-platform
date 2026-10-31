-- inspect_applied_state.sql — READ ONLY. Run in the DEV SQL editor and send me the output. It confirms what the database actually has,
-- so nothing is re-applied and any mismatch with the repository is reported rather than guessed.
select t.name as expected_object, to_regclass('public.' || t.name) is not null as exists_in_db from (values
 ('commercial_terms_versions'),('agency_subscriptions'),('agreement_acceptances'),('buyer_pack_access'),('document_shares'),            -- commercial v2
 ('lead_milestones'),('agency_commercial_elections'),                                                                              -- deal room, phase20
 ('deal_room_messages'),('deal_room_reads'),                                                                                       -- phase21
 ('agency_subscription_requests'),('agency_subscription_proposals'),('agency_commercial_events'),                                  -- phase22
 ('agency_mandate_letters'),('mandate_letter_events'),                                                                             -- phase23 (NEW)
 ('paystack_payments'),('paystack_events')                                                                                         -- phase24 (NEW)
) as t(name) order by 1;

select column_name from information_schema.columns where table_schema='public' and table_name='commercial_terms_versions' and column_name in ('agency_success_fee_schedule','agency_entitlements','agency_success_fee_commitment_months') order by 1;
select column_name from information_schema.columns where table_schema='public' and table_name='agency_commercial_elections' and column_name in ('commitment_end','early_transition_authorized_at','proposal_id') order by 1;
select column_name from information_schema.columns where table_schema='public' and table_name='developer_projects' and column_name like 'mandate%' order by 1;
select tgname from pg_trigger where tgrelid='public.developer_projects'::regclass and not tgisinternal order by 1;
select tablename, count(*) as policies from pg_policies where schemaname='public' and tablename in ('agency_mandate_letters','agency_subscription_requests','deal_room_messages','paystack_payments') group by 1;

-- ── Agreement workflow (phase25) ──────────────────────────────────────────────────────────────────────────────────────
select to_regclass('public.agreement_requests') is not null as agreement_requests, to_regclass('public.agreement_request_developments') is not null as request_dev_links,
       to_regclass('public.agreement_request_events') is not null as request_events, to_regclass('public.agreement_documents') is not null as phase25_documents_applied;
select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.agreement_requests'::regclass and contype = 'c';   -- is the status check the one phase25 expects to replace?
select column_name from information_schema.columns where table_schema='public' and table_name='agreement_requests' and column_name in ('opportunity_kind','scope_note','executed_at','execution_evidence_ref','agreed_option','requester_user_id') order by 1;
select tgname from pg_trigger where tgrelid='public.agreement_requests'::regclass and not tgisinternal order by 1;
select status, count(*) from public.agreement_requests group by 1 order by 1;                                                                        -- existing rows, esp. any 'executed' set by hand
select p.project_id, count(*) as open_requests from public.agreement_request_developments p join public.agreement_requests r on r.id = p.request_id
 where r.status not in ('draft','declined','withdrawn') group by 1 having count(*) > 1;                                                               -- existing duplicate coverage the new guard would not retro-fix
select proname from pg_proc where proname = 'covering_agreement';                                                                                    -- not defined anywhere in the repository

-- ── phase26 (fees and payments): run before and after applying it ──────────────────────────────────────────
select 'phase26 tables' as check_name, table_name, (select relrowsecurity from pg_class where oid = ('public.'||table_name)::regclass) as rls_on
  from information_schema.tables where table_schema='public' and table_name in ('fee_assessment_requests','fee_payment_requests','fee_payments','fee_payment_events') order by 2;
select 'calc columns' as check_name, column_name from information_schema.columns where table_schema='public' and table_name='agreement_fee_calculations' and column_name in ('transaction_date','supporting_info');
select 'agreement_documents.terms_version_id' as check_name, count(*) from information_schema.columns where table_schema='public' and table_name='agreement_documents' and column_name='terms_version_id';
select 'final check' as check_name, pg_get_constraintdef(oid) from pg_constraint where conname='agreement_documents_final_check';
select 'one payment request per calc index' as check_name, indexname from pg_indexes where indexname in ('fee_payment_requests_one_per_calc_uq','fee_payments_one_verified_ref_uq');
-- constraints on agreement_requests that record_completed must satisfy (send me this output)
select 'agreement_requests checks' as check_name, conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.agreement_requests'::regclass and contype='c';
select 'covering_agreement' as check_name, pg_get_functiondef(p.oid) from pg_proc p where proname='covering_agreement';

-- ══ ONE-TABLE SUMMARY: which migrations are really in the database (read only) ═══════════════════════════════════════════
-- Each row is a marker object of one migration. applied = true means that migration's marker exists. Send me this whole result.
select phase, marker, applied from (values
 ('phase11', 'developer_leads.site_id',                  exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='site_id')),
 ('phase11', 'trigger developer_leads_guard',            exists (select 1 from pg_trigger where tgname='developer_leads_guard' and not tgisinternal)),
 ('phase12', 'table development_evidence',               to_regclass('public.development_evidence') is not null),
 ('phase14', 'developer_leads.unit_type_label',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='unit_type_label')),
 ('phase14', 'developer_leads.routing_status',           exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='routing_status')),
 ('phase15', 'developer_leads.referred_to_developer_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='referred_to_developer_at')),
 ('phase16', 'policy leads_owner_read',                  exists (select 1 from pg_policies where tablename='developer_leads' and policyname='leads_owner_read')),
 ('phase16', 'trigger developer_accounts_privileged_guard', exists (select 1 from pg_trigger where tgname='developer_accounts_privileged_guard' and not tgisinternal)),
 ('phase17', 'finance_product_events',                   to_regclass('public.finance_product_events') is not null),
 ('phase18', 'policy financing_requests_admin_all',      exists (select 1 from pg_policies where tablename='financing_requests' and policyname='financing_requests_admin_all')),
 ('phase23', 'agency_mandate_letters',                   to_regclass('public.agency_mandate_letters') is not null),
 ('phase24', 'paystack_payments',                        to_regclass('public.paystack_payments') is not null),
 ('phase25', 'agreement_documents',                      to_regclass('public.agreement_documents') is not null),
 ('phase26', 'fee_payment_requests',                     to_regclass('public.fee_payment_requests') is not null),
 ('phase27', 'approved terms v1-agreed-2026',            exists (select 1 from public.commercial_terms_versions where version_label='v1-agreed-2026' and status='approved')),
 ('phase27', 'covering_agreement reads the completed record', exists (select 1 from pg_proc where proname='covering_agreement' and pg_get_functiondef(oid) like '%final_executed%')),
 ('phase28', 'developer_leads.manop_routing_required',   exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_leads' and column_name='manop_routing_required')),
 ('phase28', 'developer_projects.suspended_at',          exists (select 1 from information_schema.columns where table_schema='public' and table_name='developer_projects' and column_name='suspended_at')),
 ('phase28', 'usage_events',                             to_regclass('public.usage_events') is not null)
) as t(phase, marker, applied) order by phase, marker;

-- row level security must be ON for the tables that hold partner and buyer data (a restrictive policy does nothing if RLS is off)
select relname as table_name, relrowsecurity as rls_on from pg_class
 where relnamespace='public'::regnamespace and relname in ('developer_leads','developer_projects','sites','agreement_requests','agreement_documents','fee_payment_requests','fee_payments','usage_events','financing_requests') order by 1;

-- is the founder an admin? (should return true when run as the founder in the app; here it lists admin_users if the table exists)
select 'admin_users' as check_name, count(*) as admins from public.admin_users;

-- existing agreements that say "executed" but have NO completed record (they will not count as coverage until one is recorded)
select r.id, r.reference, r.status, r.executed_at from public.agreement_requests r
 where r.status = 'executed' and not exists (select 1 from public.agreement_documents d where d.request_id = r.id and d.kind='final_executed' and d.status='final');
