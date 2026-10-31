-- Five admin read policies still trust auth.jwt() -> user_metadata, which any
-- signed-in user can edit about themselves. Because developer_documents is
-- among them, any account could have read every developer's uploaded documents.
-- This rewrites each to is_manop_admin(), but only where the existing policy is
-- a SELECT policy (as its name says); anything else is skipped and reported.

-- Step 1 (read-only): see them first.
-- select tablename, policyname, cmd, qual from pg_policies
--  where qual ilike '%user_metadata%' or with_check ilike '%user_metadata%';

do $$
declare r record;
begin
  for r in
    select tablename, policyname, cmd from pg_policies
     where schemaname = 'public'
       and (qual ilike '%user_metadata%' or with_check ilike '%user_metadata%')
  loop
    if r.cmd = 'SELECT' then
      execute format('drop policy %I on public.%I', r.policyname, r.tablename);
      execute format('create policy %I on public.%I for select using (is_manop_admin())', r.policyname, r.tablename);
      raise notice 'rewrote % on %', r.policyname, r.tablename;
    else
      raise notice 'SKIPPED % on % (cmd = %): review by hand', r.policyname, r.tablename, r.cmd;
    end if;
  end loop;
end $$;

-- Re-check: expect zero rows.
select tablename, policyname from pg_policies
 where qual ilike '%user_metadata%' or with_check ilike '%user_metadata%';
