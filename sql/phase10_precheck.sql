-- Run first. Everything phase 10 depends on must show up here.
select table_name, column_name from information_schema.columns
 where table_name = 'developer_leads'
   and column_name in ('id','manop_lead_id','project_id','unit_type_id','stage','source','is_diaspora','created_at','user_id','developer_id');
-- expect 10 rows. Tell me which are missing.
select proname from pg_proc where proname in ('is_manop_admin','my_agency_id','my_developer_account_id');  -- expect 3
select to_regclass('public.finance_products') as finance_products, to_regclass('public.currency_reference_rates') as rates; -- both non-null
