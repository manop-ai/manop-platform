-- READ-ONLY. Names what Supabase's two critical advisories refer to. Run each block, send me the output.

-- 1. Tables in public with Row-Level Security OFF
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2. Views in public that read auth.users, and who can select from them
select v.table_name as view_name, v.view_definition ilike '%auth.users%' as reads_auth_users,
       has_table_privilege('anon', format('public.%I', v.table_name), 'select') as anon_can_select,
       has_table_privilege('authenticated', format('public.%I', v.table_name), 'select') as authenticated_can_select
from information_schema.views v
where v.table_schema = 'public' and v.view_definition ilike '%auth.users%';

-- 3. finance_analyses: RLS state and policies (the earlier output showed no policy rows for it)
select relrowsecurity from pg_class where oid = 'public.finance_analyses'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='finance_analyses';
