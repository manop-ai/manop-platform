// lib/agreements-server.ts
//
// Server-only helpers for the agreement-request API routes. Follows MANOP's Supabase conventions:
//  - the caller's identity and ownership are read with sbFromRequest (their own session, RLS applies);
//  - requester WRITES use sbAdmin (service role) because a row-level policy cannot restrict which columns an
//    owner may change — the routes validate ownership and a field whitelist instead. See the migration header.
//  - admin routes use requireAdmin (lib/admin-guard.ts) and write as the admin, so RLS is_manop_admin() applies.

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { sbFromRequest } from './supabase/route-client'
import { escapeHtml, notificationHtml, sendAdminNotification, adminEmailConfig } from './email'
import { OPPORTUNITY_KINDS } from './agreement-docs'
import { sbAdmin } from './supabase/admin'
import { OPTION_LABEL, readinessGaps, num, type CommercialOption, type RequestInput } from './commercial-terms'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Requester {
  userId: string
  role: 'agency' | 'developer'
  agencyId: string | null
  developerAccountId: string | null
  defaults: { company_name: string; requester_name: string; contact_email: string; contact_phone: string }
}

export async function requireRequester(req: NextRequest, wanted?: string | null) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) } as const
  const [{ data: partner }, { data: dev }] = await Promise.all([
    sb.from('data_partners').select('id,name,contact_email').eq('auth_user_id', user.id).maybeSingle(),
    sb.from('developer_accounts').select('id,company_name,contact_name,email').eq('auth_user_id', user.id).maybeSingle(),
  ])
  // Role comes from the database records the caller owns, never from the request body alone.
  const role: 'agency' | 'developer' | null =
    wanted === 'agency' && partner ? 'agency' : wanted === 'developer' && dev ? 'developer' : partner ? 'agency' : dev ? 'developer' : null
  if (!role) return { error: NextResponse.json({ error: 'Agreement requests are available to agency and developer accounts.' }, { status: 403 }) } as const
  const r: Requester = role === 'agency'
    ? { userId: user.id, role, agencyId: partner!.id, developerAccountId: null, defaults: { company_name: partner!.name ?? '', requester_name: '', contact_email: partner!.contact_email ?? user.email ?? '', contact_phone: '' } }
    : { userId: user.id, role, agencyId: null, developerAccountId: dev!.id, defaults: { company_name: dev!.company_name ?? '', requester_name: dev!.contact_name ?? '', contact_email: dev!.email ?? user.email ?? '', contact_phone: '' } }
  return { sb, user, requester: r } as const
}

/** Development ids this requester actually owns (agency: submitted by it; developer: belongs to its account). */
export async function ownedProjects(sb: ReturnType<typeof sbFromRequest>, r: Requester): Promise<{ id: string; name: string }[]> {
  const q = sb.from('developer_projects').select('id,name')
  const { data } = r.role === 'agency' ? await q.eq('submitting_agency_id', r.agencyId!) : await q.eq('developer_id', r.developerAccountId!)
  return (data as { id: string; name: string }[]) ?? []
}

const s = (v: unknown, max = 500): string | null => { if (typeof v !== 'string') return null; const t = v.trim(); return t ? t.slice(0, max) : null }
const VARIES = ['development', 'unit_type', 'transaction', 'client']

/** Whitelist + normalise the editable fields. Anything else in the body (status, executed_*, reference…) is dropped. */
export function pickRequestFields(b: Record<string, unknown>): RequestInput & { project_ids?: string[] } {
  const out: Record<string, unknown> = {}
  const has = (k: string) => k in b
  for (const k of ['company_name', 'requester_name', 'requester_title', 'contact_email', 'contact_phone', 'counterparty_name', 'commission_basis', 'commission_payer']) if (has(k)) out[k] = s(b[k], 200)
  for (const k of ['commission_shared_details', 'commission_notes', 'requester_notes', 'questions']) if (has(k)) out[k] = s(b[k], 4000)
  for (const k of ['counterparty_role', 'preferred_option', 'commission_type', 'commission_pct_scope']) if (has(k)) out[k] = s(b[k], 60)
  if (has('currency')) out.currency = s(b.currency, 3)?.toUpperCase() ?? null
  for (const k of ['illustrative_transaction_value', 'commission_rate_pct', 'commission_fixed_amount', 'commission_retained_pct']) if (has(k)) out[k] = num(b[k])
  if (has('opportunity_kind')) out.opportunity_kind = (OPPORTUNITY_KINDS as readonly string[]).includes(b.opportunity_kind as string) ? b.opportunity_kind : null
  if (has('scope_note')) out.scope_note = s(b.scope_note, 4000)
  if (has('commission_shared')) out.commission_shared = typeof b.commission_shared === 'boolean' ? b.commission_shared : null
  if (has('disclosure_declined')) out.disclosure_declined = b.disclosure_declined === true
  if (has('commission_varies')) out.commission_varies = Array.isArray(b.commission_varies) ? (b.commission_varies as unknown[]).filter((x): x is string => typeof x === 'string' && VARIES.includes(x)) : null
  if (has('project_ids')) out.project_ids = Array.isArray(b.project_ids) ? (b.project_ids as unknown[]).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)).slice(0, 50) : []
  return out as RequestInput & { project_ids?: string[] }
}

export const DISCLOSURE_KEYS = ['commission_type', 'commission_rate_pct', 'commission_fixed_amount', 'commission_basis', 'commission_pct_scope', 'commission_payer', 'commission_shared', 'commission_shared_details', 'commission_retained_pct', 'commission_varies', 'commission_notes', 'disclosure_declined', 'currency'] as const

export function initialDisclosureStatus(role: 'agency' | 'developer', f: RequestInput): string | null {
  if (f.preferred_option !== 'agency_commission_share') return null
  // A currency on its own is not a commission disclosure.
  const any = DISCLOSURE_KEYS.filter(k => k !== 'currency').some(k => { const v = (f as Record<string, unknown>)[k]; return v !== null && v !== undefined && v !== '' && v !== false && !(Array.isArray(v) && v.length === 0) })
  if (role === 'agency') return any ? 'agency_supplied' : 'clarification_required'
  return any ? 'developer_reported' : 'clarification_required'
}

export interface NotifyResult { attempted: boolean; configured: boolean; missing: string[] }

/** Admin email for a new / resubmitted request. No buyer or investor data is included. */
export async function notifyAgreementRequest(kind: 'submitted' | 'resubmitted', row: Record<string, unknown>, developmentNames: string[], gaps: string[]): Promise<NotifyResult> {
  const cfg = adminEmailConfig()
  if (!cfg.configured) return { attempted: false, configured: false, missing: cfg.missing }
  const opt = (row.preferred_option as CommercialOption | null)
  const e = escapeHtml
  await sendAdminNotification(
    `${kind === 'resubmitted' ? 'Agreement request updated' : 'New agreement request'} — ${e(row.company_name)} (${e(row.reference)})`,
    notificationHtml(kind === 'resubmitted' ? 'Agreement request resubmitted' : 'New agreement request', [
      ['Reference', e(row.reference)],
      ['Company', e(row.company_name)],
      ['Type', e(row.requester_role)],
      ['Contact', `${e(row.requester_name)} (${e(row.requester_title)}), ${e(row.contact_email)}`],
      ['Developments', developmentNames.map(e).join(', ') || '—'],
      ['Preferred option (proposed, not agreed)', opt ? e(OPTION_LABEL[opt]) : 'None chosen'],
      ['Commission details', gaps.length ? `Incomplete: ${gaps.map(e).join('; ')}` : 'Complete (self-reported, not verified)'],
      ['Review', `/admin/agreements`],
    ]),
  )
  return { attempted: true, configured: true, missing: [] }
}

export { readinessGaps }

/** Developments that already sit in ANOTHER open (submitted, not declined/withdrawn) request. A development has one live request at a time. */
export async function conflictingDevelopments(projectIds: string[], exceptRequestId: string | null): Promise<{ id: string; name: string }[]> {
  if (!projectIds.length) return []
  const { data: links } = await sbAdmin.from('agreement_request_developments').select('project_id,request_id').in('project_id', projectIds)
  const others = (links ?? []).filter(l => l.request_id !== exceptRequestId)
  if (!others.length) return []
  const { data: reqs } = await sbAdmin.from('agreement_requests').select('id,status').in('id', Array.from(new Set(others.map(l => l.request_id))))
  const open = new Set((reqs ?? []).filter(r => !['draft', 'declined', 'withdrawn'].includes(r.status)).map(r => r.id))
  const ids = Array.from(new Set(others.filter(l => open.has(l.request_id)).map(l => l.project_id)))
  if (!ids.length) return []
  const { data: ps } = await sbAdmin.from('developer_projects').select('id,name').in('id', ids)
  return (ps as { id: string; name: string }[]) ?? []
}

const PUBLISH_LABEL: Record<string, string> = { draft: 'Draft, not yet submitted for review', pending_review: 'Awaiting MANOP review', published: 'Published', rejected: 'Not approved by MANOP' }

/** The requester's OWN submitted opportunities with the facts they need to choose one (review status, mandate letter) and whether one can be chosen now. */
export async function opportunityOptions(r: Requester) {
  const col = r.role === 'agency' ? 'submitting_agency_id' : 'developer_id'
  const owner = r.role === 'agency' ? r.agencyId! : r.developerAccountId!
  let q = await sbAdmin.from('developer_projects').select('id,name,city,neighborhood,publish_status,mandate_letter_id').eq(col, owner).order('created_at', { ascending: false })
  if (q.error) q = (await sbAdmin.from('developer_projects').select('id,name,city,neighborhood,publish_status').eq(col, owner).order('created_at', { ascending: false })) as any
  const rows = (q.data ?? []) as any[]
  const ids = rows.map(p => p.id)
  const letterIds = rows.map(p => p.mandate_letter_id).filter(Boolean)
  const { data: letters } = letterIds.length ? await sbAdmin.from('agency_mandate_letters').select('id,status').in('id', letterIds) : { data: [] }
  const { data: links } = ids.length ? await sbAdmin.from('agreement_request_developments').select('project_id,request_id').in('project_id', ids) : { data: [] }
  const { data: reqs } = links?.length ? await sbAdmin.from('agreement_requests').select('id,reference,status').in('id', Array.from(new Set(links.map(l => l.request_id)))) : { data: [] }
  const openRef = new Map<string, string>()
  for (const l of links ?? []) { const rq = (reqs ?? []).find(x => x.id === l.request_id); if (rq && !['draft', 'declined', 'withdrawn'].includes(rq.status)) openRef.set(l.project_id, rq.reference) }
  return rows.map(p => ({
    id: p.id as string, name: p.name as string, publishStatus: String(p.publish_status ?? ''), location: [p.neighborhood, p.city].filter(Boolean).join(', '), statusLabel: PUBLISH_LABEL[p.publish_status] ?? String(p.publish_status ?? ''),
    mandateLabel: r.role === 'agency' ? (p.mandate_letter_id ? ((letters ?? []).find(l => l.id === p.mandate_letter_id)?.status ?? null) : 'none uploaded') : null,
    blockedReason: p.publish_status === 'rejected' ? 'MANOP did not approve this submission. Resubmit it before requesting an agreement.' : openRef.has(p.id) ? `Already has an open agreement request (${openRef.get(p.id)}).` : null,
  }))
}

/** Server-side eligibility for a submitted request: opportunities MANOP rejected cannot be put forward. (Ownership and one-open-request are checked separately.) */
export async function rejectedDevelopments(projectIds: string[]): Promise<string[]> {
  if (!projectIds.length) return []
  const { data } = await sbAdmin.from('developer_projects').select('name,publish_status').in('id', projectIds)
  return (data ?? []).filter(p => p.publish_status === 'rejected').map(p => p.name as string)
}