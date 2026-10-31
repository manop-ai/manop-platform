// app/api/admin/commercial/subscription-requests/route.ts — admin: assess custom Agency Subscription requests and issue proposals.
//   GET    requests with agency, every proposal version (including internal basis notes), the agency's active route and audit events.
//   PATCH  { action, ... }
//            start_assessment     requested -> under_assessment
//            save_draft           create / update the draft proposal (next version) for a request under assessment
//            issue                draft -> issued (frozen). Needs expiry and every required field. Request -> proposal_issued.
//            withdraw_proposal    issued -> withdrawn; request returns to under_assessment
//            close                close a request with a reason
//            set_notes            internal assessment notes
//            authorize_early      record an exception allowing a subscription request before an election's commitment ends (reason required)
// Admin only (is_manop_admin). Writes use the service role after that check. Nothing here prices automatically, charges or activates anything.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { UUID_RE } from '../../../../../lib/agreements-server'
import { validateProposalInput, validateEarlyAuthorisation, OPEN_REQUEST } from '../../../../../lib/agency-subscription-request'
import { expireStale, isMissingTable, logEvent } from '../../../../../lib/agency-subscription-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function GET(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    await expireStale()
    const { data: reqs, error } = await sbAdmin.from('agency_subscription_requests').select('*, data_partners(name,contact_email,verification_status)').order('created_at', { ascending: false }).limit(200)
    if (error) return isMissingTable(error) ? NextResponse.json({ requests: [], unavailable: true }) : bad(error.message, 500)
    const ids = (reqs ?? []).map(r => r.id)
    const { data: props } = ids.length ? await sbAdmin.from('agency_subscription_proposals').select('*').in('request_id', ids).order('version', { ascending: true }) : { data: [] as any[] }
    const agencyIds = Array.from(new Set((reqs ?? []).map(r => r.agency_id)))
    const [{ data: els }, { data: events }] = await Promise.all([
      agencyIds.length ? sbAdmin.from('agency_commercial_elections').select('id,agency_id,model,status,effective_from,effective_to,commitment_months,commitment_start,commitment_end,early_transition_authorized_at,early_transition_reason').in('agency_id', agencyIds).in('status', ['active', 'proposed']) : Promise.resolve({ data: [] as any[] }),
      agencyIds.length ? sbAdmin.from('agency_commercial_events').select('*').in('agency_id', agencyIds).order('created_at', { ascending: false }).limit(400) : Promise.resolve({ data: [] as any[] }),
    ])
    return NextResponse.json({
      requests: (reqs ?? []).map(r => ({ ...r, proposals: (props ?? []).filter(p => p.request_id === r.id), elections: (els ?? []).filter(e => e.agency_id === r.agency_id), events: (events ?? []).filter(e => e.agency_id === r.agency_id).slice(0, 60) })),
    })
  } catch (e) { console.error('GET admin subscription-requests', e); return bad('Server error', 500) }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const now = new Date().toISOString()
    const action = String(b.action)

    if (action === 'authorize_early') {
      if (typeof b.election_id !== 'string' || !UUID_RE.test(b.election_id)) return bad('Invalid route.')
      const r = validateEarlyAuthorisation(b.reason); if (!r.ok) return bad(r.error!)
      const { data: el } = await sbAdmin.from('agency_commercial_elections').select('id,agency_id,model,status').eq('id', b.election_id).maybeSingle()
      if (!el || el.model !== 'success_fee' || el.status !== 'active') return bad('Only an active success-fee route can be given an early-change authorisation.', 409)
      const { error } = await sbAdmin.from('agency_commercial_elections').update({ early_transition_authorized_by: g.user.id, early_transition_authorized_at: now, early_transition_reason: r.value, updated_at: now }).eq('id', el.id)
      if (error) return bad('Could not record the authorisation.', 500)
      await logEvent({ agency_id: el.agency_id, event_type: 'early_transition_authorized', actor_user_id: g.user.id, actor_role: 'admin', election_id: el.id, detail: { reason: r.value } })
      return NextResponse.json({ ok: true })
    }

    if (typeof b.request_id !== 'string' || !UUID_RE.test(b.request_id)) return bad('Invalid request.')
    const { data: r } = await sbAdmin.from('agency_subscription_requests').select('*').eq('id', b.request_id).maybeSingle()
    if (!r) return bad('Request not found.', 404)

    if (action === 'start_assessment') {
      if (r.status !== 'requested') return bad('Only a new request can be moved to assessment.', 409)
      await sbAdmin.from('agency_subscription_requests').update({ status: 'under_assessment', assessed_by: g.user.id, assessment_started_at: now, updated_at: now }).eq('id', r.id).eq('status', 'requested')
      await logEvent({ agency_id: r.agency_id, event_type: 'assessment_started', actor_user_id: g.user.id, actor_role: 'admin', request_id: r.id })
      return NextResponse.json({ ok: true })
    }
    if (action === 'set_notes') {
      await sbAdmin.from('agency_subscription_requests').update({ admin_notes: txt(b.notes, 8000), updated_at: now }).eq('id', r.id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'close') {
      const reason = txt(b.reason, 1000); if (!reason) return bad('Give a reason for closing this request.')
      if (!OPEN_REQUEST.includes(r.status)) return bad('This request is already finished.', 409)
      await sbAdmin.from('agency_subscription_proposals').update({ status: 'withdrawn', updated_at: now }).eq('request_id', r.id).eq('status', 'issued')
      await sbAdmin.from('agency_subscription_requests').update({ status: 'closed', closed_reason: reason, updated_at: now }).eq('id', r.id).in('status', OPEN_REQUEST)
      await logEvent({ agency_id: r.agency_id, event_type: 'request_closed', actor_user_id: g.user.id, actor_role: 'admin', request_id: r.id, detail: { reason } })
      return NextResponse.json({ ok: true })
    }

    if (action === 'save_draft' || action === 'issue') {
      if (!['under_assessment', 'proposal_issued'].includes(r.status)) return bad('Start the assessment before preparing a proposal.', 409)
      const { data: existing } = await sbAdmin.from('agency_subscription_proposals').select('*').eq('request_id', r.id).order('version', { ascending: false })
      const draft = existing?.find(p => p.status === 'draft') ?? null
      const live = existing?.find(p => p.status === 'issued') ?? null
      if (action === 'issue' && !draft) return bad('Save a draft proposal first.', 409)

      const input = action === 'issue' && draft && !b.price_amount ? draft : { ...(draft ?? {}), ...b }
      const v = validateProposalInput(input as any, { issue: action === 'issue' })
      if (!v.ok) return bad(v.errors.join(' '))

      // Coverage must be developments this agency actually represents. A missing relationship is flagged, never invented.
      if (v.value!.coverage_scope === 'listed') {
        const { data: devs } = await sbAdmin.from('developer_projects').select('id').eq('submitting_agency_id', r.agency_id).in('id', v.value!.coverage_development_ids)
        const found = new Set((devs ?? []).map(d => d.id)); const missing = v.value!.coverage_development_ids.filter(id => !found.has(id))
        if (missing.length) return bad(`${missing.length} listed development(s) are not submitted by this agency, so no representation is on record: ${missing.join(', ')}`)
      }

      const row = { agency_id: r.agency_id, request_id: r.id, ...v.value!, effective_date: v.value!.effective_date, updated_at: now }
      let proposalId: string
      if (draft) {
        const { error } = await sbAdmin.from('agency_subscription_proposals').update(row).eq('id', draft.id).eq('status', 'draft')
        if (error) return bad('Could not save the draft.', 500)
        proposalId = draft.id
      } else {
        const version = (existing?.[0]?.version ?? 0) + 1
        const { data: ins, error } = await sbAdmin.from('agency_subscription_proposals').insert({ ...row, version, created_by: g.user.id }).select('id').single()
        if (error) return bad('Could not save the draft.', 500)
        proposalId = ins.id
      }
      if (action === 'save_draft') { await logEvent({ agency_id: r.agency_id, event_type: 'proposal_draft_saved', actor_user_id: g.user.id, actor_role: 'admin', request_id: r.id, proposal_id: proposalId }); return NextResponse.json({ ok: true, proposal_id: proposalId }) }

      // issue: a previously issued version is superseded by the new one in the same step
      if (live) await sbAdmin.from('agency_subscription_proposals').update({ status: 'superseded', updated_at: now }).eq('id', live.id).eq('status', 'issued')
      const { data: issued, error: ie } = await sbAdmin.from('agency_subscription_proposals').update({ status: 'issued', issued_by: g.user.id, issued_at: now, updated_at: now }).eq('id', proposalId).eq('status', 'draft').select('id')
      if (ie || !issued?.length) return bad('Could not issue the proposal.', 500)
      await sbAdmin.from('agency_subscription_requests').update({ status: 'proposal_issued', updated_at: now }).eq('id', r.id)
      await logEvent({ agency_id: r.agency_id, event_type: 'proposal_issued', actor_user_id: g.user.id, actor_role: 'admin', request_id: r.id, proposal_id: proposalId })
      return NextResponse.json({ ok: true, proposal_id: proposalId })
    }

    if (action === 'withdraw_proposal') {
      const reason = txt(b.reason, 1000); if (!reason) return bad('Give a reason for withdrawing the proposal.')
      const { data: w } = await sbAdmin.from('agency_subscription_proposals').update({ status: 'withdrawn', updated_at: now }).eq('request_id', r.id).eq('status', 'issued').select('id')
      if (!w?.length) return bad('There is no open proposal to withdraw (it may already have been accepted or declined).', 409)
      await sbAdmin.from('agency_subscription_requests').update({ status: 'under_assessment', updated_at: now }).eq('id', r.id).eq('status', 'proposal_issued')
      await logEvent({ agency_id: r.agency_id, event_type: 'proposal_withdrawn', actor_user_id: g.user.id, actor_role: 'admin', request_id: r.id, proposal_id: w[0].id, detail: { reason } })
      return NextResponse.json({ ok: true })
    }
    return bad('Unknown action.')
  } catch (e) { console.error('PATCH admin subscription-requests', e); return bad('Server error', 500) }
}