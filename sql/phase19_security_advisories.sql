-- phase19_security_advisories.sql  (UNAPPLIED: review, then apply)
-- Fixes the two critical Supabase advisories using what security_advisor_inspect.sql returned.
--
-- (1) Nine tables in public have Row-Level Security OFF and every privilege granted to anon and authenticated
--     (including TRUNCATE): agent_leads, agent_profiles, knowledge, market_data, parsed_properties, price_history,
--     task_history, thoughts, whatsapp_listings. Nothing in the Next.js app, components, lib or sql folders refers
--     to them, so they look like they belong to a separate agent / WhatsApp ingestion tool. Enabling RLS with no
--     policy denies anon and authenticated; service_role and postgres still work.
--     RISK: if any external script reads or writes them with the ANON key it will stop working. If so, add a
--     narrow policy for that script instead of re-opening the table. Nothing is deleted.
-- (2) View user_permission_summary reads auth.users (emails) and is selectable by anon and authenticated, so any
--     visitor could list every association role holder's email. The only callers (lib/association.ts and
--     app/association/dashboard/page.tsx) both filter by user_id = the signed-in user, so the view is limited to
--     the caller's own rows. Columns are unchanged.

begin;

do $$
declare t text;
begin
  foreach t in array array['agent_leads','agent_profiles','knowledge','market_data','parsed_properties',
                           'price_history','task_history','thoughts','whatsapp_listings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace view public.user_permission_summary as
 SELECT aur.user_id,
    au.email,
    (aur.role)::text AS role,
    (aur.scope_type)::text AS scope_type,
    aur.association_id,
    a.name AS association_name,
    a.short_code AS association_code,
    aur.chapter_id,
    ac.name AS chapter_name,
    ac.state AS chapter_state,
    aur.agency_id,
    dp.name AS agency_name,
    aur.country_code,
    aur.is_active,
    aur.expires_at,
    (aur.role = ANY (ARRAY['super_admin'::manop_role, 'country_admin'::manop_role])) AS can_see_all_countries,
    (aur.role = ANY (ARRAY['super_admin'::manop_role, 'country_admin'::manop_role, 'association_national_admin'::manop_role])) AS can_see_national_aggregates,
    (aur.role = ANY (ARRAY['super_admin'::manop_role, 'country_admin'::manop_role, 'association_national_admin'::manop_role, 'chapter_admin'::manop_role])) AS can_see_chapter_aggregates,
    (aur.role = ANY (ARRAY['super_admin'::manop_role, 'country_admin'::manop_role, 'association_national_admin'::manop_role])) AS can_approve_memberships,
    (aur.role = ANY (ARRAY['super_admin'::manop_role, 'country_admin'::manop_role, 'association_national_admin'::manop_role, 'chapter_admin'::manop_role])) AS can_verify_members,
    (aur.role = 'super_admin'::manop_role) AS can_manage_associations
   FROM ((((association_user_roles aur
     JOIN auth.users au ON ((au.id = aur.user_id)))
     LEFT JOIN associations a ON ((a.id = aur.association_id)))
     LEFT JOIN association_chapters ac ON ((ac.id = aur.chapter_id)))
     LEFT JOIN data_partners dp ON ((dp.id = aur.agency_id)))
  WHERE ((aur.is_active = true) AND ((aur.expires_at IS NULL) OR (aur.expires_at > now()))
         AND aur.user_id = auth.uid());

revoke all on public.user_permission_summary from anon;
grant select on public.user_permission_summary to authenticated;
grant select on public.user_permission_summary to service_role;

commit;

-- Rollback for (1): alter table public.<t> disable row level security; grant all on public.<t> to anon, authenticated;
-- Rollback for (2): re-create the view without the final "and aur.user_id = auth.uid()" line (definition saved from your inspection output).
