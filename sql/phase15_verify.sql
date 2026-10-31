-- PHASE 15 VERIFY / INSPECT. Read-only: every statement is a select. Run each block separately in the Supabase SQL editor
-- and send the results back. Nothing here changes data or schema.

-- 1. What do the identity helpers actually do? (the app trusts is_manop_admin() for admin authorization)
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_manop_admin', 'my_agency_id', 'my_developer_account_id');

-- 2. Does the signed-in founder admin pass is_manop_admin()? Run this as the admin user in the app, or inspect the
--    table the function reads (see block 1) and confirm the founder's auth user id is in it.

-- 3. Columns the code relies on
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'developer_projects' and column_name in ('active', 'status', 'developer_id', 'submitting_agency_id', 'mandate_document_url'))
    or (table_name = 'developer_accounts' and column_name in ('account_status', 'auth_user_id', 'email', 'verified', 'active'))
    or (table_name = 'developer_leads' and column_name in ('routing_status', 'referred_to_developer_at', 'referred_by_user_id', 'relayed_to_developer_at', 'unit_type_label', 'attribution_acknowledged_at')))
order by table_name, column_name;

-- 4. Row level security policies on the introduction and developer tables (needed before any RLS change that hides
--    MANOP-held introductions from a developer who has claimed an account; the developer dashboard reads developer_leads directly)
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('developer_leads', 'developer_accounts', 'lead_milestones', 'developer_projects')
order by tablename, policyname;

-- 5. Triggers on developer_leads (phase 14 snapshot guard, phase 15 referral guard expected after those are applied)
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.developer_leads'::regclass and not tgisinternal;

-- 6. Unclaimed accounts and the introductions currently held for them
select a.id, a.company_name, a.account_status, (a.auth_user_id is not null) as has_login,
       count(l.id) as introductions
from public.developer_accounts a
left join public.developer_leads l on l.developer_id = a.id
where a.account_status = 'unclaimed'
group by a.id, a.company_name, a.account_status, a.auth_user_id;
