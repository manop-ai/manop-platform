-- ─────────────────────────────────────────────────────────────────────────
-- 2. my_introductions — what a buyer may see of their OWN introductions
--
-- The earlier policy "users can view own enquiries" (phase 9) let a buyer
-- SELECT * from their own developer_leads row, which includes MANOP's
-- fee_percentage, declared_txn_value, fee_amount and fee_status. A buyer
-- should see the progress of their introduction, not MANOP's commercial
-- terms with the developer. This view exposes only the safe columns and is
-- filtered to the caller, so the base-table policy can go.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "users can view own enquiries" on developer_leads;

create or replace view my_introductions as
  select id, manop_lead_id, project_id, unit_type_id, stage, source, is_diaspora,
         created_at, acknowledged_at, attribution_acknowledged_at
  from developer_leads
  where user_id = auth.uid();

revoke all on my_introductions from anon;
grant select on my_introductions to authenticated;
