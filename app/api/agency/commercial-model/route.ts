// app/api/agency/commercial-model/route.ts — an agency's own commercial route: see both alternatives with their terms, and explicitly choose one.
//   GET   both routes with price/rate, what each includes and excludes, whether each can be chosen now and why not, and the agency's history.
//   POST  { model, terms_version_id, accept: true }  records the choice WITH the exact statement shown, the terms snapshot, who and when.
// A choice never charges anything and never marks anything paid. Subscription: creates the existing Agency Subscription request (payment, approval
// and activation stay separate admin steps). Success fee: becomes active at once only when approved terms exist and no subscription is active.
// Not paying a subscription is never treated as accepting the success-fee route: acceptance must be explicit (accept: true).

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { getAgencyTerms } from '../../../../lib/commercial-server'
import { AGENCY_MODELS, AGENCY_MODEL_LABEL, buildAcceptanceStatement, eligibilityFor, type AgencyModel } from '../../../../lib/agency-commercial'
import { listElections, asElectionRow } from '../../../../lib/agency-election-server'
import { commitmentDates } from '../../../../lib/agency-subscription-request'
import { logEvent } from '../../../../lib/agency-subscription-server'

async function agencyOf(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) } as const
  const { data: agency } = await sb.from('data_partners').select('id,name,contact_email,active').eq('auth_user_id', user.id).maybeSingle()
  if (!agency) return { error: NextResponse.json({ error: 'The commercial route is chosen from an agency account. This account is not linked to an agency.' }, { status: 403 }) } as const
  return { sb, user, agency } as const
}

async function latestSubscription(agencyId: string) {
  const { data } = await sbAdmin.from('agency_subscriptions').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

export async function GET(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    const terms = await getAgencyTerms()
    const els = await listElections(a.sb as any, a.agency.id)
    if (els.error) return NextResponse.json({ error: els.error }, { status: 500 })
    const sub = await latestSubscription(a.agency.id)
    const rows = els.rows.map(asElectionRow)
    const today = new Date().toISOString().slice(0, 10)
    const routes = AGENCY_MODELS.map(model => {
      const e = eligibilityFor({ model, terms, agency: { active: a.agency.active }, elections: rows, subscription: sub, today })
      return {
        model, label: AGENCY_MODEL_LABEL[model], canChoose: e.ok && !els.unavailable && (model as string) === 'success_fee', reasons: els.unavailable ? ['Choosing a route is not available yet: MANOP has not enabled it.'] : e.reasons, notes: e.notes, effectiveFrom: e.effectiveFrom,
        price: null,
        rate: model === 'success_fee' ? terms.successFee : null,
        entitlement: terms.entitlements[model] ?? null,
        statement: e.ok && (model as string) === 'success_fee' ? buildAcceptanceStatement(model, terms, e.effectiveFrom ?? today) : null,
      }
    })
    return NextResponse.json({
      agency: { name: a.agency.name }, termsVersionId: terms.id, termsVersionLabel: terms.versionLabel, termsApproved: terms.approved,
      routes, current: els.rows.find((r: any) => r.status === 'active') ?? null, pending: els.rows.find((r: any) => r.status === 'proposed') ?? null,
      history: els.rows.map((r: any) => ({ id: r.id, model: r.model, status: r.status, effective_from: r.effective_from, effective_to: r.effective_to, accepted_at: r.accepted_at, ended_reason: r.ended_reason })),
      notice: 'Choosing a route does not guarantee any commission, give exclusivity, verify your submissions, or open confidential documents. A fee is calculated only from a qualifying event.',
    })
  } catch (e: unknown) {
    console.error('GET /api/agency/commercial-model', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
    const model = b.model as AgencyModel
    if (!AGENCY_MODELS.includes(model)) return NextResponse.json({ error: 'Choose either the subscription or the success-fee route.' }, { status: 400 })
    if (model === 'subscription') return NextResponse.json({ error: 'A subscription is custom. Send a custom subscription request; MANOP will assess it and send you a proposal to accept or decline.' }, { status: 409 })
    if (b.accept !== true) return NextResponse.json({ error: 'You must explicitly accept the terms shown. Not paying is never treated as acceptance.' }, { status: 400 })

    const terms = await getAgencyTerms()
    if (!terms.id || b.terms_version_id !== terms.id) return NextResponse.json({ error: 'The commercial terms changed since you opened this page. Reload to see the current terms before accepting.' }, { status: 409 })

    const els = await listElections(sbAdmin as any, a.agency.id)
    if (els.unavailable) return NextResponse.json({ error: 'Choosing a route is not available yet: MANOP has not enabled it.' }, { status: 503 })
    if (els.error) return NextResponse.json({ error: els.error }, { status: 500 })
    const sub = await latestSubscription(a.agency.id)
    const rows = els.rows.map(asElectionRow)
    const today = new Date().toISOString().slice(0, 10)

    // Double-click / retry safe: a pending or active selection of the same route is returned, not duplicated.
    const same = els.rows.find((r: any) => r.model === model && (r.status === 'proposed' || r.status === 'active'))
    if (same) return NextResponse.json({ election: same, duplicate: true })

    const e = eligibilityFor({ model, terms, agency: { active: a.agency.active }, elections: rows, subscription: sub, today })
    if (!e.ok) return NextResponse.json({ error: e.reasons.join(' ') }, { status: 409 })

    const effectiveFrom = e.effectiveFrom ?? today
    const statement = buildAcceptanceStatement(model, terms, effectiveFrom)
    const snapshot = { versionLabel: terms.versionLabel, subscription: null, successFee: terms.successFee, entitlement: terms.entitlements[model], legalReviewStatus: terms.legalReviewStatus }
    const base: Record<string, unknown> = { agency_id: a.agency.id, model, terms_version_id: terms.id, terms_snapshot: snapshot, acceptance_statement: statement, accepted_by: a.user.id }

    // success fee: active immediately; a previous route that is no longer in force (for example an expired subscription) ends the day before.
    const { data, error } = await sbAdmin.from('agency_commercial_elections').insert({ ...base, status: 'proposed', effective_from: effectiveFrom }).select().single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'You already have a pending selection.' : 'Could not record your selection. Please try again.' }, { status: error.code === '23505' ? 409 : 500 })
    const { activateElection } = await import('../../../../lib/agency-election-server')
    const act = await activateElection(sbAdmin as any, data, effectiveFrom, a.user.id, 'Replaced by the success-fee route chosen by the agency')
    if (!act.ok) { await sbAdmin.from('agency_commercial_elections').update({ status: 'withdrawn' }).eq('id', data.id); return NextResponse.json({ error: act.error ?? 'Could not activate the route.' }, { status: 409 }) }
    // The commitment runs from the recorded effective date of this accepted route, for the months in the approved terms. Never from account creation.
    const cm = terms.successFee?.commitmentMonths ?? null
    const cd = commitmentDates(effectiveFrom, cm)
    if (cm) await sbAdmin.from('agency_commercial_elections').update({ commitment_months: cm, commitment_start: cd.start, commitment_end: cd.end }).eq('id', data.id)
    await logEvent({ agency_id: a.agency.id, event_type: 'success_fee_route_accepted', actor_user_id: a.user.id, actor_role: 'agency', election_id: data.id, detail: { effectiveFrom, commitmentMonths: cm, commitmentEnd: cd.end, termsVersionId: terms.id } })
    const { data: fresh } = await sbAdmin.from('agency_commercial_elections').select('*').eq('id', data.id).single()
    return NextResponse.json({ election: fresh, next: 'The success-fee route is now recorded for your agency. No subscription fee applies to it.' }, { status: 201 })
  } catch (e: unknown) {
    console.error('POST /api/agency/commercial-model', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}