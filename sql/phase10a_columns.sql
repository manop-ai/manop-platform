-- ─────────────────────────────────────────────────────────────────────────
-- 1. developer_leads — acknowledgement, responsible party, attribution consent
-- ─────────────────────────────────────────────────────────────────────────
alter table developer_leads
  add column if not exists acknowledged_at            timestamptz,
  add column if not exists acknowledged_by_user_id    uuid references auth.users(id) on delete set null,
  add column if not exists acknowledged_by_role       text check (acknowledged_by_role in ('developer','agency')),
  -- Who the commercial relationship is with for THIS introduction. Left null
  -- until set; never both, so a fee claim is never raised against two parties.
  add column if not exists responsible_party          text check (responsible_party in ('developer','agency')),
  -- Which commercial-terms version was accepted on acknowledgement. Stays null
  -- until terms are approved and activated (lib/deal-room.ts).
  add column if not exists terms_version              text,
  add column if not exists terms_accepted_at          timestamptz,
  -- The buyer agreed MANOP may record this introduction and share their details.
  add column if not exists attribution_acknowledged_at timestamptz;

create index if not exists developer_leads_project_id_idx on developer_leads(project_id);
