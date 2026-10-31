// app/api/agency/subscription-request/route.ts — an agency's custom Agency Subscription request.
//   GET    own latest request, its proposal (issued and later only), eligibility, the agency's own developments (for coverage labels)
//   POST   { action:'request', portfolio_summary, intended_usage, ... }   → a pending request. Does NOT block onboarding or submissions.
//   PATCH  { request_id, action:'accept'|'decline'|'withdraw', proposal_id?, decline_reason? }
// Accepting records the exact statement shown and creates the (unpaid, unapproved, inactive) subscription record. It never activates anything.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { escapeHtml, notificationHtml, sendAdminNotification, adminEmailConfig } from '../../../../lib/email'
import { agencyViewOfRequest, canDecide, proposalStatement, transitionEligibility, validateRequestInput, OPEN_REQUEST } from '../../../../lib/agency-subscription-request'
import { expireStale, isMissingTable, logEvent } from '../../../../lib/agency-subscription-server'
import { listElections } from '../../../../lib/agency-election-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const NOT_READY = 'Custom subscription requests are not switched on yet.'

async function agencyOf(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: bad('Sign in required.', 401) } as const
  const { data: agency } = await sb.from('data_partners').select('id,name,contact_email,active').eq('auth_user_id', user.id).maybeSingle()
  if (!agency) return { error: bad('Custom subscriptions are requested from an agency account.', 403) } as const
  return { user, agency } as const
}

async function activeElection(agencyId: string) {
  const r = await listElections(sbAdmin as any, agencyId)
  return r.rows.find((x: any) => x.status === 'active') ?? null
}
const factsOf = (el: any) => (el ? { model: el.model, status: el.status, commitment_end: el.commitment_end ?? null, early_transition_authorized_at: el.early_transition_authorized_at ?? null, early_transition_reason: el.early_transition_reason ?? null } : null)

export async function GET(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    await expireStale(a.agency.id)
    const { data: reqs, error } = await sbAdmin.from('agency_subscription_requests').select('*').eq('agency_id', a.agency.id).order('created_at', { ascending: false }).limit(5)
    if (error) return isMissingTable(error) ? NextResponse.json({ unavailable: true, message: NOT_READY }) : bad('Could not load your request.', 500)
    const latest = reqs?.[0] ?? null
    let proposal: any = null
    if (latest) {
      const { data: ps } = await sbAdmin.from('agency_subscription_proposals').select('*').eq('request_id', latest.id).neq('status', 'draft').order('version', { ascending: false }).limit(1)
      proposal = ps?.[0] ?? null
    }
    const el = await activeElection(a.agency.id)
    const elig = transitionEligibility(factsOf(el), new Date().toISOString().slice(0, 10))
    const { data: devs } = await sbAdmin.from('developer_projects').select('id,name').eq('submitting_agency_id', a.agency.id).limit(300)
    return NextResponse.json({
      request: latest ? agencyViewOfRequest(latest, proposal) : null,
      canRequest: elig.ok && !(latest && OPEN_REQUEST.includes(latest.status)),
      eligibility: elig, developments: devs ?? [],
      notice: 'Requesting a custom subscription does not activate anything and does not stop you completing your profile, verification or development submissions. A proposal must be accepted, paid and approved before a subscription starts.',
    })
  } catch (e) { console.error('GET subscription-request', e); return bad('Could not load your request.', 500) }
}

export async function POST(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    if (b.action !== 'request') return bad('Unknown action.')
    if (a.agency.active === false) return bad('This agency account is not active.', 409)
    const v = validateRequestInput(b); if (!v.ok) return bad(v.errors.join(' '))

    const el = await activeElection(a.agency.id)
    const elig = transitionEligibility(factsOf(el), new Date().toISOString().slice(0, 10))
    if (!elig.ok) return bad(elig.reason ?? 'You are not eligible to request a subscription yet.', 409)

    await expireStale(a.agency.id)
    const { data: open } = await sbAdmin.from('agency_subscription_requests').select('id,status').eq('agency_id', a.agency.id).in('status', OPEN_REQUEST)
    if (open?.length) return NextResponse.json({ duplicate: true, request_id: open[0].id })        // double-click / retry safe

    const { data, error } = await sbAdmin.from('agency_subscription_requests').insert({ agency_id: a.agency.id, requested_by: a.user.id, ...v.value }).select().single()
    if (error) {
      if (isMissingTable(error)) return bad(NOT_READY, 503)
      if (error.code === '23505') return NextResponse.json({ duplicate: true })
      return bad('Could not record your request. Please try again.', 500)
    }
    await logEvent({ agency_id: a.agency.id, event_type: 'subscription_requested', actor_user_id: a.user.id, actor_role: 'agency', request_id: data.id })
    let notified = false
    if (adminEmailConfig().configured) {
      try { await sendAdminNotification(`Custom subscription requested: ${escapeHtml(a.agency.name)}`, notificationHtml('Custom Agency Subscription requested', [['Agency', escapeHtml(a.agency.name)], ['Review', '/admin/commercial']])); notified = true } catch { /* stored regardless */ }
    }
    return NextResponse.json({ request: agencyViewOfRequest(data, null), notified }, { status: 201 })
  } catch (e) { console.error('POST subscription-request', e); return bad('Could not record your request. Please try again.', 500) }
}

export async function PATCH(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const action = b.action
    if (!['accept', 'decline', 'withdraw'].includes(String(action))) return bad('Unknown action.')
    await expireStale(a.agency.id)
    const { data: r } = await sbAdmin.from('agency_subscription_requests').select('*').eq('id', String(b.request_id)).eq('agency_id', a.agency.id).maybeSingle()
    if (!r) return bad('Request not found.', 404)          // same answer for "not yours"

    const now = new Date()
    if (action === 'withdraw') {
      if (!OPEN_REQUEST.includes(r.status)) return bad('This request can no longer be withdrawn.', 409)
      await sbAdmin.from('agency_subscription_proposals').update({ status: 'withdrawn', updated_at: now.toISOString() }).eq('request_id', r.id).eq('status', 'issued')
      await sbAdmin.from('agency_subscription_requests').update({ status: 'withdrawn', updated_at: now.toISOString() }).eq('id', r.id).in('status', OPEN_REQUEST)
      await logEvent({ agency_id: a.agency.id, event_type: 'request_withdrawn', actor_user_id: a.user.id, actor_role: 'agency', request_id: r.id })
      return NextResponse.json({ ok: true })
    }

    const { data: p } = await sbAdmin.from('agency_subscription_proposals').select('*').eq('request_id', r.id).eq('status', 'issued').maybeSingle()
    if (!p || (b.proposal_id && b.proposal_id !== p.id)) return bad('That proposal is no longer current. Reload to see the latest one.', 409)
    const can = canDecide(p, r.status, now); if (!can.ok) return bad(can.reason ?? 'Not permitted.', 409)

    if (action === 'decline') {
      const { data: upd } = await sbAdmin.from('agency_subscription_proposals').update({ status: 'declined', decided_by: a.user.id, decided_at: now.toISOString(), decline_reason: typeof b.decline_reason === 'string' ? b.decline_reason.trim().slice(0, 1000) || null : null, updated_at: now.toISOString() }).eq('id', p.id).eq('status', 'issued').select('id')
      if (!upd?.length) return bad('That proposal is no longer open.', 409)
      await sbAdmin.from('agency_subscription_requests').update({ status: 'declined', updated_at: now.toISOString() }).eq('id', r.id)
      await logEvent({ agency_id: a.agency.id, event_type: 'proposal_declined', actor_user_id: a.user.id, actor_role: 'agency', request_id: r.id, proposal_id: p.id })
      return NextResponse.json({ ok: true })
    }

    // accept — commitment eligibility is re-checked at the moment of acceptance
    const el = await activeElection(a.agency.id)
    const elig = transitionEligibility(factsOf(el), now.toISOString().slice(0, 10))
    if (!elig.ok) return bad(elig.reason ?? 'Not eligible.', 409)

    let labels: string[] = []
    if (p.coverage_scope === 'listed' && p.coverage_development_ids?.length) {
      const { data: d } = await sbAdmin.from('developer_projects').select('id,name').in('id', p.coverage_development_ids)
      labels = (d ?? []).map((x: any) => x.name)
    }
    const statement = proposalStatement({ ...p, price_amount: Number(p.price_amount), version: p.version }, labels)

    // 1) the unpaid, unapproved, inactive subscription record  2) flip the proposal (guarded by status) so a double click cannot create two
    const { data: sub, error: se } = await sbAdmin.from('agency_subscriptions').insert({ agency_id: a.agency.id, requested_by: a.user.id, price_amount: p.price_amount, price_currency: p.price_currency, period_months: p.duration_months, proposal_id: p.id, coverage_scope: p.coverage_scope, coverage_development_ids: p.coverage_development_ids }).select().single()
    if (se) return bad('Could not record your acceptance. Please try again.', 500)
    const { data: flipped } = await sbAdmin.from('agency_subscription_proposals').update({ status: 'accepted', decided_by: a.user.id, decided_at: now.toISOString(), acceptance_statement: statement, updated_at: now.toISOString() }).eq('id', p.id).eq('status', 'issued').select('id')
    if (!flipped?.length) { await sbAdmin.from('agency_subscriptions').delete().eq('id', sub.id); return bad('That proposal is no longer open.', 409) }
    await sbAdmin.from('agency_subscription_requests').update({ status: 'accepted', subscription_id: sub.id, updated_at: now.toISOString() }).eq('id', r.id)
    const { data: elec } = await sbAdmin.from('agency_commercial_elections').insert({
      agency_id: a.agency.id, model: 'subscription', status: 'proposed', subscription_id: sub.id, proposal_id: p.id, accepted_by: a.user.id,
      acceptance_statement: statement,
      terms_snapshot: { proposal: { id: p.id, version: p.version, price: p.price_amount, currency: p.price_currency, durationMonths: p.duration_months, inclusions: p.inclusions, exclusions: p.exclusions, coverageScope: p.coverage_scope, coverageDevelopmentIds: p.coverage_development_ids, activationCondition: p.activation_condition, terms: p.terms_text } },
    }).select('id').maybeSingle()
    await logEvent({ agency_id: a.agency.id, event_type: 'proposal_accepted', actor_user_id: a.user.id, actor_role: 'agency', request_id: r.id, proposal_id: p.id, subscription_id: sub.id, election_id: elec?.id ?? null })
    if (adminEmailConfig().configured) { try { await sendAdminNotification(`Proposal accepted: ${escapeHtml(a.agency.name)}`, notificationHtml('Subscription proposal accepted', [['Agency', escapeHtml(a.agency.name)], ['Next', 'Confirm payment when received, then approve and activate at /admin/commercial']])) } catch { /* recorded regardless */ } }
    return NextResponse.json({ ok: true, next: 'Thank you. Follow MANOP’s payment instructions. Your subscription is active only after MANOP confirms payment and approves it.' })
  } catch (e) { console.error('PATCH subscription-request', e); return bad('Could not record your decision. Please try again.', 500) }
}