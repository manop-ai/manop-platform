-- cleanup_test_developments.sql — removes the TEST developments you listed (NOT The Lavender), together with their test enquiries and
-- anything that only exists because of them. DRY RUN FIRST: as written it deletes nothing; it ends with an error on purpose, which rolls everything back.
--   1. Run it as it is. Read the NOTICE lines: they list every table and how many rows would go. The last line must say "DRY RUN OK".
--      If it stops earlier with a different error (for example "... are append-only"), copy that error to me. Do NOT work around it.
--      If it stops with "... is append-only", that history is protected on purpose. For TEST data only, set remove_test_history to true
--      (below) and run the dry run again.
--   2. Remove from the list below any development you want to keep. Change   commit_it boolean := false;   to   true;   and run it again.
-- The ids are the ones from your result 6. The guard at the top refuses to run if The Lavender's id is in the list.
-- helper (temporary: exists only for this session). Deletes the rows that reference the given rows of p_tbl, depth first, then the rows themselves.
create or replace function pg_temp.purge(p_tbl regclass, p_ids uuid[], p_depth int) returns void language plpgsql as $f$
declare fk record; child_ids uuid[]; pk_col text; cnt bigint; rel_name text;
begin
  if p_depth > 6 then raise exception 'Dependency chain too deep under %. Stopping.', p_tbl; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return; end if;
  for fk in
    select c.conrelid::regclass as child, a.attname as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = p_tbl and array_length(c.conkey, 1) = 1 and c.confdeltype in ('a', 'r', 'n', 'd')
  loop
    -- rows of the child table that point at our rows; they may have children of their own (needs a uuid column named id)
    if exists (select 1 from pg_attribute where attrelid = fk.child and attname = 'id' and not attisdropped) then
      execute format('select coalesce(array_agg(id), ''{}'') from %s where %I = any($1)', fk.child, fk.col) into child_ids using p_ids;
      perform pg_temp.purge(fk.child, child_ids, p_depth + 1);
    end if;
    if current_setting('manop.cleanup_force', true) = 'on' then execute format('alter table %s disable trigger user', fk.child); end if;
    execute format('delete from %s where %I = any($1)', fk.child, fk.col) using p_ids;
    if current_setting('manop.cleanup_force', true) = 'on' then execute format('alter table %s enable trigger user', fk.child); end if;
    get diagnostics cnt = row_count;
    if cnt > 0 then raise notice '  % removed from %', cnt, fk.child; end if;
  end loop;
  if current_setting('manop.cleanup_force', true) = 'on' then execute format('alter table %s disable trigger user', p_tbl); end if;
  execute format('delete from %s where id = any($1)', p_tbl) using p_ids;
  if current_setting('manop.cleanup_force', true) = 'on' then execute format('alter table %s enable trigger user', p_tbl); end if;
  get diagnostics cnt = row_count;
  raise notice '  % removed from %', cnt, p_tbl;
end $f$;

do $$
declare
  commit_it boolean := false;
  -- Some history tables (lead_milestones, ...) are append-only on purpose. These listed enquiries are TEST data, so you may remove their
  -- history rows too: set this to true. It switches the protection off only for the tables touched, only inside this run, and only for the
  -- rows that belong to the listed test enquiries. Leave it false for anything that is not test data.
  remove_test_history boolean := false;
  lavender  uuid := '1d26f24d-810b-42b8-9e18-c6e47c526b67';
  targets   uuid[] := array[
    '91c6c7fa-2f51-4eda-86b8-e7e0739f84d0',   -- TEST — Lekki Horizon Residences   (1 enquiry)
    '99504c23-a033-44ab-b913-42ce43857dab',   -- TEST — Ajah Green Estate          (1 enquiry)
    '6ac13df9-cdcc-43da-91d4-d416ea3ac53f',   -- SURU
    '1c20b90e-3264-467c-9cdd-4a05e35f3971',   -- fakuna
    '665db131-46db-4fa7-a03e-d559b312b8df',   -- Baluku
    'd1296a53-a6d8-4d6a-b35b-125b49e90e1d',   -- zrdhydrr
    'ec8f2d96-666b-4b05-bcd9-c1853698af32'    -- Test                              (1 enquiry)
  ]::uuid[];
  lead_ids uuid[];
  n int;
begin
  if remove_test_history then perform set_config('manop.cleanup_force', 'on', true); end if;
  if lavender = any(targets) then raise exception 'The Lavender is in the list. Refusing to run.'; end if;
  select count(*) into n from developer_projects where id = any(targets);
  if n <> array_length(targets, 1) then raise exception 'Only % of % listed developments exist. Check the ids.', n, array_length(targets, 1); end if;
  if exists (select 1 from agreement_request_developments where project_id = any(targets))
     or exists (select 1 from agency_mandate_letters where project_id = any(targets)) then
    raise exception 'A listed development has an agreement link or mandate letter. Those are kept: suspend it instead.';
  end if;

  select coalesce(array_agg(id), '{}') into lead_ids from developer_leads where project_id = any(targets);
  raise notice 'enquiries to remove: %', coalesce(array_length(lead_ids, 1), 0);

  -- everything that points at those enquiries, then the enquiries
  perform pg_temp.purge('public.developer_leads'::regclass, lead_ids, 0);
  -- everything that points at those developments (unit types, evidence, documents, media rows, ...), then the developments
  perform pg_temp.purge('public.developer_projects'::regclass, targets, 0);

  if commit_it then raise notice 'COMMITTED: % developments and % enquiries deleted.', array_length(targets, 1), coalesce(array_length(lead_ids, 1), 0);
  else raise exception 'DRY RUN OK: nothing was deleted (this error rolls everything back on purpose). Set commit_it to true to delete.'; end if;
end $$;
