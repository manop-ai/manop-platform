// app/api/admin/commercial/terms/route.ts — versions of MANOP's commercial terms (fee schedule, trigger, Agency Subscription price,
// Buyer Pack price/access). Admin only (is_manop_admin()). A version is a DRAFT until explicitly approved; once approved the database
// refuses any change to its commercial fields (corrections are a NEW version). Nothing is applied automatically on approval:
// agreements copy a version's terms into their own immutable snapshot only when an agreement is EXECUTED.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { num, validateFeeSchedule, SUPPORTED_CURRENCIES } from '../../../../../lib/commercial-terms'
import { validateEntitlement, AGENCY_MODELS } from '../../../../../lib/agency-commercial'
import { UUID_RE } from '../../../../../lib/agreements-server'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

function pick(b: Record<string, unknown>) {
  const errors: string[] = []
  const out: Record<string, unknown> = {}
  if ('success_fee_schedule' in b) { const s = validateFeeSchedule(b.success_fee_schedule); if (!s.ok) errors.push(...s.errors); else out.success_fee_schedule = s.schedule }
  for (const [k, label] of [['agency_subscription_price', 'Agency Subscription price'], ['buyer_pack_price', 'Buyer Pack price']] as const) {
    if (k in b) { const n = b[k] === null || b[k] === '' ? null : num(b[k]); if (n !== null && n < 0) errors.push(`${label} must be zero or more.`); else out[k] = n }
  }
  for (const k of ['fee_currency', 'agency_subscription_currency', 'buyer_pack_currency'] as const) {
    if (k in b) { const c = txt(b[k], 3)?.toUpperCase() ?? null; if (c && !SUPPORTED_CURRENCIES.includes(c)) errors.push(`${k} must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`); else out[k] = c ?? (k === 'buyer_pack_currency' ? null : 'NGN') }
  }
  if ('agency_subscription_period_months' in b) { const n = num(b.agency_subscription_period_months); if (n === null || !Number.isInteger(n) || n < 1 || n > 60) errors.push('Subscription period must be 1 to 60 months.'); else out.agency_subscription_period_months = n }
  // Agency route terms (need sql/phase20): the AGENCY success-fee schedule is stored separately from the developer schedule.
  if ('agency_success_fee_schedule' in b) {
    if (b.agency_success_fee_schedule === null) out.agency_success_fee_schedule = null
    else { const s = validateFeeSchedule(b.agency_success_fee_schedule); if (!s.ok) errors.push('Agency success fee: ' + s.errors.join(' ')); else out.agency_success_fee_schedule = s.schedule }
  }
  if ('agency_entitlements' in b) {
    const e = (b.agency_entitlements && typeof b.agency_entitlements === 'object' ? b.agency_entitlements : {}) as Record<string, unknown>
    const o: Record<string, unknown> = {}
    for (const m of AGENCY_MODELS) if (e[m] != null) { const v = validateEntitlement(e[m]); if (!v.ok) errors.push(`${m}: ${v.errors.join(' ')}`); else o[m] = v.value }
    out.agency_entitlements = Object.keys(o).length ? o : null
  }
  if ('agency_success_fee_commitment_months' in b) { const n = b.agency_success_fee_commitment_months === null || b.agency_success_fee_commitment_months === '' ? null : num(b.agency_success_fee_commitment_months); if (n !== null && (!Number.isInteger(n) || n < 1 || n > 60)) errors.push('Commitment must be 1 to 60 whole months.'); else out.agency_success_fee_commitment_months = n }
  if ('agency_fee_payer' in b) out.agency_fee_payer = txt(b.agency_fee_payer, 40) ?? 'agency'
  if ('fee_payer' in b) out.fee_payer = txt(b.fee_payer, 40) ?? 'developer'
  if ('qualifying_milestones' in b) { const a = Array.isArray(b.qualifying_milestones) ? (b.qualifying_milestones as unknown[]).filter((x): x is string => typeof x === 'string' && /^[a-z_]+$/.test(x)) : []; if (!a.length) errors.push('Name at least one qualifying milestone.'); else out.qualifying_milestones = a }
  if ('buyer_pack_access_required' in b) out.buyer_pack_access_required = b.buyer_pack_access_required === true
  if ('notes' in b) out.notes = txt(b.notes, 4000)
  if ('effective_from' in b) { const d = txt(b.effective_from, 10); if (d && isNaN(Date.parse(d))) errors.push('Effective date is not a valid date.'); else out.effective_from = d }
  return { errors, out }
}

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data, error } = await g.sb.from('commercial_terms_versions').select('*').order('created_at', { ascending: false })
  if (error) return bad(error.message)
  return NextResponse.json({ versions: data })
}

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
  const label = txt(b.version_label, 60); if (!label) return bad('Give the version a label, for example v1-2026.')
  const p = pick(b); if (!('success_fee_schedule' in b)) p.errors.push('A fee schedule is required.')
  if (p.errors.length) return bad(p.errors.join(' '))
  const { data, error } = await g.sb.from('commercial_terms_versions').insert({ ...p.out, version_label: label, status: 'draft', created_by: g.user.id }).select().single()
  if (error) return bad(error.code === '23505' ? 'That version label already exists.' : error.message, error.code === '23505' ? 409 : 400)
  return NextResponse.json({ version: data }, { status: 201 })
}

/** body: { id, action: 'update_draft' | 'approve' | 'supersede' | 'withdraw' | 'set_legal_review', ... } */
export async function PATCH(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return bad('Invalid version.')
  const { data: cur } = await g.sb.from('commercial_terms_versions').select('*').eq('id', b.id).maybeSingle()
  if (!cur) return bad('Version not found.', 404)
  const action = b.action
  let upd: Record<string, unknown> = {}
  if (action === 'update_draft') {
    if (cur.status !== 'draft') return bad('Only a draft can be edited. Create a new version to change approved terms.', 409)
    const p = pick(b); if (p.errors.length) return bad(p.errors.join(' ')); upd = p.out
  } else if (action === 'approve') {
    if (cur.status !== 'draft') return bad('Only a draft can be approved.', 409)
    const eff = txt(b.effective_from, 10) ?? cur.effective_from
    if (!eff || isNaN(Date.parse(eff))) return bad('Set the date these terms take effect before approving.')
    if (!validateFeeSchedule(cur.success_fee_schedule).ok) return bad('The fee schedule is not valid.')
    upd = { status: 'approved', effective_from: eff, approved_by: g.user.id, approved_at: new Date().toISOString() }
  } else if (action === 'supersede' || action === 'withdraw') {
    if (cur.status !== 'approved') return bad('Only an approved version can be superseded or withdrawn.', 409)
    upd = { status: action === 'supersede' ? 'superseded' : 'withdrawn' }
  } else if (action === 'set_legal_review') {
    if (!['not_reviewed', 'in_review', 'cleared'].includes(b.legal_review_status as string)) return bad('Unknown legal review status.')
    upd = { legal_review_status: b.legal_review_status, ...('notes' in b ? { notes: txt(b.notes, 4000) } : {}) }
  } else return bad('Unknown action.')
  const { data, error } = await g.sb.from('commercial_terms_versions').update(upd).eq('id', b.id).select().maybeSingle()
  if (error) return bad(error.message, 409)   // the database guard returns a clear message for forbidden edits
  if (!data) return bad('Not permitted.', 403)
  return NextResponse.json({ version: data })
}