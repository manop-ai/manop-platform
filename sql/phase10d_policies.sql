-- ─────────────────────────────────────────────────────────────────────────
-- 4. Security corrections to policies added in phases 8 and 9
--
-- Those admin policies checked auth.jwt() -> 'user_metadata' ->> 'user_role'.
-- user_metadata is editable by the signed-in user themselves
-- (supabase.auth.updateUser({ data: { user_role: 'admin' } })), so any
-- account could have granted itself write access to lender products and
-- exchange rates. The rest of the admin surface (developer_leads,
-- lib/admin-guard.ts) uses is_manop_admin(); these now do too.
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists "finance_products_admin_all" on finance_products;
create policy "finance_products_admin_all" on finance_products
  for all using (is_manop_admin()) with check (is_manop_admin());

drop policy if exists "admins manage rates" on currency_reference_rates;
create policy "admins manage rates" on currency_reference_rates
  for all using (is_manop_admin()) with check (is_manop_admin());
