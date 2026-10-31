-- After phase11. Run each on its own.
-- 1. New columns exist with the expected types (site_id type must equal sites.id type)
select table_name, column_name, data_type from information_schema.columns
 where (table_name = 'developer_leads' and column_name in ('site_id','source_kind'))
    or (table_name = 'sites' and column_name = 'id');
-- 2. Guard trigger present
select tgname from pg_trigger where tgrelid = 'developer_leads'::regclass and not tgisinternal;
-- 3. Checks rewritten
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid in ('lead_milestones'::regclass, 'developer_leads'::regclass) and contype = 'c'
   and conname ilike any (array['%milestone%','%party_role%','%acknowledged_by_role%','%one_subject%']);
-- 4. is_manop_admin / my_*_id definitions (read, to confirm they use auth.uid(), not user_metadata)
select proname, pg_get_functiondef(oid) from pg_proc where proname in ('is_manop_admin','my_agency_id','my_developer_account_id');
-- 5. activity_log policies (insert-only for any public role; no public read/update/delete)
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'activity_log';
-- 6. MANUAL negative test, signed in as an ordinary developer in the browser console:
--    await sb.from('developer_leads').update({ stage: 'completed' }).eq('id', '<one of your lead ids>')
--    EXPECT an error mentioning "cannot be changed directly".
