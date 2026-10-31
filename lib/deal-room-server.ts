// lib/deal-room-server.ts
//
// Server-only: loads the facts about an introduction and the caller, then asks
// the pure rules in lib/deal-room-access.ts who the caller is. Shared by every
// /api/deal-room route so authorization is decided in exactly one place.
//
// The caller's identity (session, is_manop_admin, my_developer_account_id,
// my_agency_id) is read AS THE CALLER with sbFromRequest. The lead and the
// opportunity it belongs to are read with the service role, because a buyer's
// view of RLS must not decide what the seller side may see — and because
// site/general leads have no project for the existing RLS policies to key on.
// The decision is still made here from database facts, never from the body.

import type { NextRequest } from 'next/server'
import { sbFromRequest } from './supabase/route-client'
import { sbAdmin } from './supabase/admin'
import { mandateOnFile } from './mandate-on-file'
import { resolveParty, type CallerFacts, type OpportunityFacts } from './deal-room-access'
import type { Party } from './deal-room'

export interface DealAccess {
  party: Party
  userId: string
  caller: ReturnType<typeof sbFromRequest>
  lead: Record<string, any>
  opportunity: OpportunityFacts
}

export type AccessResult = { access: DealAccess } | { status: number; error: string }

export async function loadOpportunity(lead: Record<string, any>): Promise<OpportunityFacts> {
  if (lead.project_id) {
    const { data: p } = await sbAdmin.from('developer_projects')
      .select('developer_id, submitting_agency_id, mandate_document_url, mandate_letter_id, publish_status')
      .eq('id', lead.project_id).maybeSingle()
    return {
      kind: 'project',
      developer_id: p?.developer_id ?? null,
      submitting_agency_id: p?.submitting_agency_id ?? null,
      landowner_user_id: null,
      mandate_document_url: (await mandateOnFile(p)) ? (p?.mandate_document_url || 'uploaded-letter') : null,
      published: p?.publish_status === 'published',
    }
  }
  if (lead.site_id) {
    const { data: s } = await sbAdmin.from('sites')
      .select('developer_id, submitting_agency_id, submitted_by_user_id, entry_source, mandate_document_url, site_status')
      .eq('id', lead.site_id).maybeSingle()
    return {
      kind: 'site',
      developer_id: s?.developer_id ?? null,
      submitting_agency_id: s?.submitting_agency_id ?? null,
      landowner_user_id: s?.entry_source === 'landowner' ? (s?.submitted_by_user_id ?? null) : null,
      mandate_document_url: s?.mandate_document_url ?? null,
      published: s?.site_status === 'published',
    }
  }
  // General enquiry to MANOP: no seller side exists. Only the buyer and admin take part.
  return { kind: 'general', developer_id: null, submitting_agency_id: null, landowner_user_id: null, mandate_document_url: null, published: false }
}

export async function loadAccess(req: NextRequest, leadId: string): Promise<AccessResult> {
  const caller = sbFromRequest(req)
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return { status: 401, error: 'Sign in required.' }

  const { data: lead } = await sbAdmin.from('developer_leads').select('*').eq('id', leadId).maybeSingle()
  // Same answer for "does not exist" and "not yours", so ids cannot be probed.
  if (!lead) return { status: 404, error: 'Introduction not found.' }

  const [{ data: isAdmin }, { data: devId }, { data: agencyId }] = await Promise.all([
    caller.rpc('is_manop_admin'), caller.rpc('my_developer_account_id'), caller.rpc('my_agency_id'),
  ])
  const facts: CallerFacts = {
    userId: user.id, isAdmin: isAdmin === true,
    developerAccountId: (devId as string | null) ?? null, agencyId: (agencyId as string | null) ?? null,
  }
  const opportunity = await loadOpportunity(lead)
  const r = resolveParty({ user_id: lead.user_id ?? null, developer_id: lead.developer_id ?? null, routing_status: lead.routing_status ?? null, manop_routing_required: lead.manop_routing_required ?? null, referred_to_developer_at: lead.referred_to_developer_at ?? null }, opportunity, facts)
  if (!r.party) return { status: r.reason?.startsWith('You are not') ? 404 : 403, error: r.reason ?? 'Not permitted.' }
  return { access: { party: r.party, userId: user.id, caller, lead, opportunity } }
}

/** Columns each audience may see. Fee, user and responsibility fields are admin-only. */
// The unit-request snapshot (sql/phase14_unit_request.sql) is the buyer's own request, so every party sees it.
// A column that is not in the row yet (migration not applied) is simply skipped by visibleLead.
const UNIT_REQUEST = ['unit_type_label', 'unit_price_ngn', 'unit_price_usd', 'unit_price_currency', 'unit_price_status',
  'unit_price_verified_at', 'unit_available_count', 'unit_snapshot_at', 'request_purpose', 'financing_type']
const COMMON = ['id', 'manop_lead_id', 'project_id', 'site_id', 'source_kind', 'stage', 'created_at', 'acknowledged_at', 'attribution_acknowledged_at', 'manop_routing_required', 'referred_to_developer_at', ...UNIT_REQUEST]
// unit_type_id on rows created before the snapshot existed was filled in automatically, so it is exposed
// only so the display can tell the two apart; it is never shown as the buyer's choice.
const SELLER = [...COMMON, 'acknowledged_by_role', 'unit_type_id', 'is_diaspora', 'routing_status', 'referred_to_developer_at']
const ADMIN = [...SELLER, 'referred_by_user_id', 'routing_note', 'developer_id', 'user_id', 'responsible_party', 'terms_version', 'terms_accepted_at',
  'fee_percentage', 'declared_txn_value', 'fee_amount', 'fee_status', 'fee_model']

export function visibleLead(party: Party, lead: Record<string, any>): Record<string, any> {
  const keys = party === 'admin' ? ADMIN : party === 'buyer' ? COMMON : SELLER
  return Object.fromEntries(keys.filter(k => k in lead).map(k => [k, lead[k]]))
}