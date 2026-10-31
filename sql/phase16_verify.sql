-- PHASE 16 VERIFY. Read-only selects. Run each block separately in the DEV Supabase SQL editor and send results.

-- 1. The two policies and the new trigger exist as intended
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'developer_leads' and policyname in ('leads_owner_read', 'leads_owner_update');

select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.developer_accounts'::regclass and not tgisinternal;

-- 2. finance_products: real columns, constraints and policies (needed before the Lender Products register migration)
select column_name, data_type, is_nullable, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'finance_products' order by ordinal_position;

select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.finance_products'::regclass;

select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'finance_products';

-- 3. finance_analyses and financing_requests: real columns, constraints and policies
select table_name, column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name in ('finance_analyses', 'financing_requests') order by table_name, ordinal_position;

select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.finance_analyses'::regclass, 'public.financing_requests'::regclass);

select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('finance_analyses', 'financing_requests') order by tablename, policyname;

-- 4. Does the founder's login pass is_manop_admin()? (is_manop_admin reads admin_users where user_id = auth.uid() and active)
select user_id, active from public.admin_users;

-- 5. developer_unit_types: every column (payment-plan fields)
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'developer_unit_types' order by ordinal_position;
