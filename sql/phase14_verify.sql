-- PHASE 14 verification (read-only). Run each block on its own.

-- A. Before applying: confirm the assumptions the routing and display rely on.
--    Expect auth_user_id on developer_accounts (a NULL auth_user_id means an unclaimed developer).
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'developer_accounts' and column_name in ('id','auth_user_id'))
     or (table_name = 'developer_projects' and column_name in ('developer_id','submitting_agency_id','mandate_document_url','publish_status'))
     or (table_name = 'developer_unit_types' and column_name in ('id','project_id','unit_type','price_ngn','price_usd','currency_code','available_count','last_price_verified_at')))
 order by table_name, column_name;

-- B. Before applying: what do existing leads hold in unit_interest / unit_type_id?
--    unit_type_id on these rows was filled with the first listed unit by the old form, so it is NOT
--    the buyer's choice. Nothing in phase 14 rewrites them.
select count(*) as leads, count(unit_type_id) as with_unit_type_id, count(unit_interest) as with_unit_interest
  from public.developer_leads;

-- C. After applying: the eleven columns exist.
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'developer_leads'
   and column_name in ('unit_type_label','unit_price_ngn','unit_price_usd','unit_price_currency','unit_price_status',
                       'unit_price_verified_at','unit_available_count','unit_snapshot_at','request_purpose','financing_type','routing_status')
 order by column_name;   -- expect 11 rows

-- D. After applying: constraints and trigger are present.
select conname, convalidated from pg_constraint
 where conrelid = 'public.developer_leads'::regclass and conname like 'developer_leads_%check'
   and conname in ('developer_leads_unit_price_status_check','developer_leads_request_purpose_check',
                   'developer_leads_financing_type_check','developer_leads_routing_status_check','developer_leads_unit_price_positive_check');
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.developer_leads'::regclass and tgname = 'developer_leads_request_snapshot_guard';

-- E. After real requests exist: each unit-specific lead names its own unit and price.
select manop_lead_id, unit_type_label, unit_price_ngn, unit_price_status, request_purpose, financing_type, routing_status, created_at
  from public.developer_leads
 where unit_type_label is not null
 order by created_at desc limit 20;
