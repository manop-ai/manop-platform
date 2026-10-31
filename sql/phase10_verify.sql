-- Run AFTER phase10_deal_room.sql. Each query states what a correct result looks like.

-- 1. Unknowns I could not confirm from the repo
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'developer_leads'::regclass and contype = 'c';          -- is 'enquiry' an allowed stage?
select column_name, is_nullable from information_schema.columns
 where table_name = 'developer_leads' and column_name in ('developer_id','user_id','project_id'); -- developer_id nullable?

-- 2. Buyer base-table policy is gone (expect no row named "users can view own enquiries")
select policyname, cmd, qual from pg_policies where tablename = 'developer_leads' order by 1;

-- 3. Milestones: RLS on, select + service policies only, trigger present
select policyname, cmd, roles from pg_policies where tablename = 'lead_milestones';
select tgname from pg_trigger where tgrelid = 'lead_milestones'::regclass and not tgisinternal;

-- 4. Any remaining policy that trusts user-editable metadata (expect zero rows)
select tablename, policyname from pg_policies
 where qual ilike '%user_metadata%' or with_check ilike '%user_metadata%';

-- 5. Fee columns are not exposed through the buyer view (expect no fee_* columns)
select column_name from information_schema.columns where table_name = 'my_introductions';

-- 6. Append-only proof (expect an error)
-- update lead_milestones set note = 'x' where id = (select id from lead_milestones limit 1);
