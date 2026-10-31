-- READ-ONLY diagnostics for Admin -> Development -> Evidence. Run each block on its own and send me the results.
-- (The page now shows the exact database error next to the form; this shows the rules behind it.)

-- 1. Real columns of the table
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'development_evidence'
 order by ordinal_position;

-- 2. CHECK / FK / unique constraints (a category or status the page offers but the table rejects shows up here)
select conname, contype, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid = 'public.development_evidence'::regclass;

-- 3. Row-level security: is it on, and which policies exist (admin insert/update/delete/select?)
select relrowsecurity as rls_enabled from pg_class where oid = 'public.development_evidence'::regclass;
select policyname, cmd, roles, qual, with_check from pg_policies where tablename = 'development_evidence' order by cmd, policyname;

-- 4. Are there any rows at all? (rows exist but the page shows none = a read-policy problem)
select count(*) as total_rows from development_evidence;
select project_id, count(*) from development_evidence group by 1 order by 2 desc limit 10;

-- 5. Is your admin account recognised by the database?  (run while signed in via the app, or check the function body)
select pg_get_functiondef(oid) from pg_proc where proname = 'is_manop_admin';

-- ─────────────────────────────────────────────────────────────────────────
-- ONLY IF block 3 shows no policy that lets an admin INSERT, UPDATE, DELETE and SELECT
-- evidence on draft developments, this adds one using the same trusted check the rest
-- of the admin surface uses (never user_metadata). Do not run it otherwise.
--
-- create policy "development_evidence admin all" on development_evidence
--   for all using (is_manop_admin()) with check (is_manop_admin());
