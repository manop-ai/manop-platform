-- phase29_partner_flag_on_insert.sql  (idempotent; apply after phase28)
-- Phase 28 flagged a development as partner-submitted only when an agency submitted it. Developers add developments straight from their
-- dashboard (a signed-in browser session), so those were NOT flagged and would not have needed a completed agreement before publishing.
-- Rule now, decided by the database itself: a development inserted by a signed-in user who is NOT a MANOP admin is partner-submitted.
-- A MANOP admin's own developments, and rows created by the server with the service role, keep the value they were given (default false).
-- Existing rows are not changed.
create or replace function public.developer_projects_publish_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and (new.submitting_agency_id is not null or (auth.uid() is not null and not public.is_manop_admin())) then
    new.partner_submitted := true;
  end if;
  if new.publish_status = 'published' and (tg_op = 'INSERT' or old.publish_status is distinct from 'published') then
    if new.suspended_at is not null then
      raise exception 'This development is suspended. Reinstate it before publishing.';
    end if;
    if new.partner_submitted and not exists (select 1 from public.covering_agreement(new.id)) then
      raise exception 'A completed agreement that names this development is required before MANOP publishes a partner-submitted development.';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.suspended_at is not null and old.suspended_at is null and new.publish_status = 'published' then
    new.publish_status := 'draft';
  end if;
  return new;
end $$;
