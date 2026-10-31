-- phase21_deal_room_messages.sql  (UNAPPLIED: review, then apply to DEV only)
--
-- Conversation inside a Deal Room (one thread per introduction = one developer_leads row).
-- Access is decided by app/api/deal-room/messages (loadAccess), exactly as for milestones.
-- Browsers have NO direct table access: RLS is on and only service_role has a policy,
-- so a message can never be read or written around the route's authorization.
--
-- visibility 'all'      : every party with access to the introduction can read it.
-- visibility 'internal' : MANOP admins only (notes between MANOP staff; never shown to parties).
-- Messages are append-only (no update/delete policy, trigger blocks edits) so a record of what was said exists.

begin;

create table if not exists public.deal_room_messages (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.developer_leads(id) on delete cascade,
  sender_user_id   uuid,
  sender_party     text not null check (sender_party in ('buyer','developer','agency','landowner','buyer_agent','admin','system')),
  body             text not null check (char_length(btrim(body)) between 1 and 4000),
  visibility       text not null default 'all' check (visibility in ('all','internal')),
  client_message_id text,
  created_at       timestamptz not null default now()
);

create unique index if not exists deal_room_messages_client_uidx
  on public.deal_room_messages(lead_id, sender_user_id, client_message_id)
  where client_message_id is not null;
create index if not exists deal_room_messages_lead_created_idx
  on public.deal_room_messages(lead_id, created_at);

create table if not exists public.deal_room_reads (
  lead_id      uuid not null references public.developer_leads(id) on delete cascade,
  user_id      uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (lead_id, user_id)
);

create or replace function public.deal_room_messages_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'deal_room_messages are append-only';
end $$;
drop trigger if exists deal_room_messages_no_update on public.deal_room_messages;
create trigger deal_room_messages_no_update before update on public.deal_room_messages
  for each row execute function public.deal_room_messages_immutable();

alter table public.deal_room_messages enable row level security;
alter table public.deal_room_reads    enable row level security;

drop policy if exists deal_room_messages_service on public.deal_room_messages;
create policy deal_room_messages_service on public.deal_room_messages for all to service_role using (true) with check (true);
drop policy if exists deal_room_reads_service on public.deal_room_reads;
create policy deal_room_reads_service on public.deal_room_reads for all to service_role using (true) with check (true);

-- Explicit grants (Supabase no longer grants automatically on new public tables).
revoke all on public.deal_room_messages from anon, authenticated;
revoke all on public.deal_room_reads    from anon, authenticated;
grant select, insert, delete on public.deal_room_messages to service_role;
grant select, insert, update on public.deal_room_reads    to service_role;

commit;

-- Rollback:
--   drop table public.deal_room_reads; drop table public.deal_room_messages; drop function public.deal_room_messages_immutable();
