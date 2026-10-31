// app/api/admin/agreements/[id]/route.ts — admin: full request, status changes, disclosure review, terms, notes.
// Every write is recorded in agreement_request_events. An agreement becomes 'executed' only through /documents (record_completed); set_status cannot set it.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { UUID_RE } from '../../../../../lib/agreements-server'
import { checkAdminTransition, proposalFor, readinessGaps, num, SUPPORTED_CURRENCIES, TERMINAL, type RequestStatus } from '../../../../../lib/commercial-terms'

type Ctx = { params: { id: string } }
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return bad('Invalid id.')
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data: request, error } = await g.sb.from('agreement_requests').select('*').eq('id', params.id).maybeSingle()
  if (error) return bad(error.message)
  if (!request) return bad('Request not found.', 404)
  const [{ data: links }, { data: events }, { data: calcs }] = await Promise.all([
    g.sb.from('agreement_request_developments').select('project_id').eq('request_id', params.id),
    g.sb.from('agreement_request_events').select('*').eq('request_id', params.id).order('created_at', { ascending: true }),
    g.sb.from('agreement_fee_calculations').select('*').eq('request_id', params.id).order('calculated_at', { ascending: false }),
  ])
  const ids = (links ?? []).map(l => l.project_id)
  let devRows: any[] | null = []
  if (ids.length) {
    const full = await g.sb.from('developer_projects').select('id,name,neighborhood,city,publish_status,mandate_letter_id,submitting_agency_id,developer_id').in('id', ids)
    // mandate_letter_id exists only after phase23; fall back so this page keeps working before it is applied.
    devRows = full.error ? (await g.sb.from('developer_projects').select('id,name,neighborhood,city,publish_status,submitting_agency_id,developer_id').in('id', ids)).data : full.data
  }
  // Per development: its mandate-letter status and whether THIS request's executed agreement covers it, so nothing has to be inferred.
  const letterIds = (devRows ?? []).map((x: any) => x.mandate_letter_id).filter(Boolean)
  const { data: letters } = letterIds.length ? await sbAdmin.from('agency_mandate_letters').select('id,status,visibility').in('id', letterIds) : { data: [] }
  const { data: finalDoc } = await sbAdmin.from('agreement_documents').select('id,issued_version_id').eq('request_id', params.id).eq('kind', 'final_executed').eq('status', 'final').maybeSingle()
  const { data: issuedDoc } = finalDoc ? await sbAdmin.from('agreement_documents').select('covered_project_ids').eq('id', finalDoc.issued_version_id).maybeSingle() : { data: null }
  const developments = (devRows ?? []).map((x: any) => ({ ...x, mandate: x.mandate_letter_id ? ((letters ?? []).find(l => l.id === x.mandate_letter_id)?.status ?? 'unknown') : (x.submitting_agency_id ? 'none_on_record' : 'not_applicable'), coveredByThisAgreement: !!issuedDoc && (issuedDoc.covered_project_ids ?? []).includes(x.id) }))
  return NextResponse.json({ request, developments, events, calculations: calcs, gaps: readinessGaps({ ...request, project_ids: ids }, request.requester_role), proposal: proposalFor(request) })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!UUID_RE.test(params.id)) return bad('Invalid id.')
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad('Invalid request.') }
  const g = await requireAdmin(req); if ('error' in g) return g.error

  const { data: current } = await g.sb.from('agreement_requests').select('*').eq('id', params.id).maybeSingle()
  if (!current) return bad('Request not found.', 404)
  const now = new Date().toISOString()
  const event = async (e: Record<string, unknown>) => g.sb.from('agreement_request_events').insert({ request_id: params.id, actor_user_id: g.user.id, actor_role: 'admin', ...e })
  const action = body.action

  if (action === 'set_status') {
    const to = body.to as RequestStatus
    const message = txt(body.message)
    const executedAt = typeof body.executed_at === 'string' && !isNaN(Date.parse(body.executed_at)) ? new Date(body.executed_at).toISOString() : null
    const evidence = txt(body.evidence_ref, 500)
    const agreedOption = txt(body.agreed_option, 40)
    const chk = checkAdminTransition(current.status, to, { message, executedAt, evidenceRef: evidence, agreedOption })
    if (!chk.ok) return bad(chk.error!, 409)
    if (to === 'agreement_sent') {
      const { count } = await g.sb.from('agreement_documents').select('id', { count: 'exact', head: true }).eq('request_id', params.id).eq('kind', 'issued').eq('status', 'issued')
      if (!count) return bad('Issue a prepared agreement version from the Documents section; that sends it and sets this status.', 409)
    }
    const upd: Record<string, unknown> = { status: to, status_updated_at: now, updated_at: now }
    if (to === 'executed') {
      upd.executed_at = executedAt; upd.execution_evidence_ref = evidence; upd.agreed_option = agreedOption; upd.agreed_terms_note = txt(body.agreed_terms_note)
      if (agreedOption === 'agency_commission_share') upd.disclosure_status = 'agreed_in_executed_agreement'
    }
    const { data, error } = await g.sb.from('agreement_requests').update(upd).eq('id', params.id).eq('status', current.status).select().maybeSingle()
    if (error) return bad(error.message)
    if (!data) return bad('The request changed while you were editing it. Reload and try again.', 409)
    // Messages that ask the requester for something, or decline, are shown to them. Everything else stays internal unless ticked.
    const visible = ['information_required', 'clarification_requested', 'declined', 'executed'].includes(to) || body.visible_to_requester === true
    await event({ event_type: 'status_changed', from_status: current.status, to_status: to, message, visible_to_requester: visible, metadata: to === 'executed' ? { evidence_ref: evidence, agreed_option: agreedOption, recorded_manually: true } : { recorded_manually: ['agreement_prepared', 'agreement_sent', 'awaiting_signature'].includes(to) } })
    return NextResponse.json({ request: data })
  }

  if (action === 'review_disclosure') {
    const st = body.disclosure_status
    if (!['manop_reviewed', 'counterparty_confirmed', 'clarification_required'].includes(st as string)) return bad('Unknown disclosure status.')
    if (current.preferred_option !== 'agency_commission_share') return bad('This request does not use the agency commission-sharing option.', 409)
    if (TERMINAL.includes(current.status)) return bad('This request is closed.', 409)
    const note = txt(body.message)
    if (st === 'clarification_required' && !note) return bad('Add a message for the requester explaining what needs clarifying.')
    const { data, error } = await g.sb.from('agreement_requests').update({ disclosure_status: st, disclosure_reviewed_by: g.user.id, disclosure_reviewed_at: now, updated_at: now }).eq('id', params.id).select().maybeSingle()
    if (error) return bad(error.message)
    await event({ event_type: 'disclosure_reviewed', message: note, visible_to_requester: st === 'clarification_required', metadata: { disclosure_status: st, previous: current.disclosure_status } })
    return NextResponse.json({ request: data })
  }

  if (action === 'update_terms') {
    if (TERMINAL.includes(current.status)) return bad('This request is closed.', 409)
    const upd: Record<string, unknown> = { updated_at: now }
    const fee = body.proposed_fee_rate_pct !== undefined ? num(body.proposed_fee_rate_pct) : undefined
    const share = body.proposed_share_rate_pct !== undefined ? num(body.proposed_share_rate_pct) : undefined
    if (fee !== undefined) { if (fee === null || fee < 0 || fee > 100) return bad('Proposed fee rate must be between 0 and 100.'); upd.proposed_fee_rate_pct = fee }
    if (share !== undefined) { if (share === null || share < 0 || share > 100) return bad('Proposed sharing rate must be between 0 and 100.'); upd.proposed_share_rate_pct = share }
    if (body.currency !== undefined) { const c = txt(body.currency, 3)?.toUpperCase() ?? null; if (c && !SUPPORTED_CURRENCIES.includes(c)) return bad(`Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`); upd.currency = c }
    if (body.illustrative_transaction_value !== undefined) { const v = num(body.illustrative_transaction_value); if (v !== null && v < 0) return bad('Illustrative value must be zero or more.'); upd.illustrative_transaction_value = v }
    const { data, error } = await g.sb.from('agreement_requests').update(upd).eq('id', params.id).select().maybeSingle()
    if (error) return bad(error.message)
    await event({ event_type: 'terms_updated', message: txt(body.message), visible_to_requester: false, metadata: { proposed: true, changes: Object.keys(upd).filter(k => k !== 'updated_at'), previous: Object.fromEntries(Object.keys(upd).filter(k => k !== 'updated_at').map(k => [k, (current as Record<string, unknown>)[k]])) } })
    return NextResponse.json({ request: data })
  }

  if (action === 'add_note') {
    const message = txt(body.message); if (!message) return bad('Write a note first.')
    await event({ event_type: body.visible_to_requester === true ? 'message' : 'note', message, visible_to_requester: body.visible_to_requester === true })
    return NextResponse.json({ ok: true })
  }

  if (action === 'update_calculation') {
    const st = body.status; if (!['proposed', 'confirmed', 'disputed', 'superseded'].includes(st as string)) return bad('Unknown calculation status.')
    const cid = typeof body.calculation_id === 'string' && UUID_RE.test(body.calculation_id) ? body.calculation_id : null; if (!cid) return bad('Missing calculation.')
    const { data, error } = await g.sb.from('agreement_fee_calculations').update({ status: st, notes: txt(body.notes) }).eq('id', cid).eq('request_id', params.id).select().maybeSingle()
    if (error) return bad(error.message)
    if (!data) return bad('Calculation not found.', 404)
    await event({ event_type: 'calculation_status', message: txt(body.notes), visible_to_requester: false, metadata: { calculation_id: cid, status: st } })
    return NextResponse.json({ calculation: data })
  }

  return bad('Unknown action.')
}