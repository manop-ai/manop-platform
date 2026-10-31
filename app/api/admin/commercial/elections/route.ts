// app/api/admin/commercial/elections/route.ts — admin visibility and control of each agency's chosen commercial route.
//   GET    every election with the agency, the terms version, and (for subscriptions) the linked subscription phase.
//   PATCH  { id, action: 'activate' | 'end' | 'withdraw', ... }
//            activate  proposed -> active. A subscription route needs its subscription active (payment confirmed and approved first).
//                      The route it replaces ends the day before. Past records are never edited.
//            end       active -> ended on a given date, with a reason (a model change or termination). Transactions already triggered keep
//                      the route that was in force on their trigger date.
//            withdraw  proposed -> withdrawn.
// Nothing here charges or invoices anything.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { UUID_RE } from '../../../../../lib/agreements-server'
import { subscriptionPhase } from '../../../../../lib/commercial-terms'
import { activateElection, isMissingTable } from '../../../../../lib/agency-election-server'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 1000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

export async function GET(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    const { data, error } = await g.sb.from('agency_commercial_elections')
      .select('*, data_partners(name,contact_email), commercial_terms_versions(version_label,legal_review_status), agency_subscriptions(payment_status,approval_status,activation_status,period_start,period_end,payment_reference)')
      .order('created_at', { ascending: false }).limit(300)
    if (error) return isMissingTable(error) ? NextResponse.json({ elections: [], unavailable: true }) : bad(error.message, 500)
    return NextResponse.json({ elections: (data ?? []).map((r: any) => ({ ...r, subscription_phase: r.agency_subscriptions ? subscriptionPhase(r.agency_subscriptions) : null })) })
  } catch (e: unknown) { console.error('GET elections', e); return bad(e instanceof Error ? e.message : 'Server error', 500) }
}

export async function PATCH(req: NextRequest) {
  try {
    const g = await requireAdmin(req); if ('error' in g) return g.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return bad('Invalid election.')
    const { data: cur, error: ce } = await g.sb.from('agency_commercial_elections').select('*, agency_subscriptions(payment_status,approval_status,activation_status,period_start,period_end,payment_reference)').eq('id', b.id).maybeSingle()
    if (ce) return bad(ce.message, 500)
    if (!cur) return bad('Election not found.', 404)
    const today = new Date().toISOString().slice(0, 10)

    if (b.action === 'activate') {
      if (cur.status !== 'proposed') return bad('Only a pending selection can be activated.', 409)
      let from = isDate(b.effective_from) ? b.effective_from : today
      if (cur.model === 'subscription') {
        const s = cur.agency_subscriptions
        if (!s || subscriptionPhase(s) !== 'active') return bad('The linked Agency Subscription is not active yet. Confirm payment, approve and activate it first.', 409)
        from = s.period_start ?? from
      }
      const r = await activateElection(g.sb as any, cur, from, g.user.id, `Replaced by the ${cur.model === 'subscription' ? 'Agency Subscription' : 'success-fee route'}`)
      return r.ok ? NextResponse.json({ ok: true }) : bad(r.error ?? 'Could not activate.', 409)
    }
    if (b.action === 'end') {
      if (cur.status !== 'active') return bad('Only an active route can be ended.', 409)
      const reason = txt(b.reason); if (!reason) return bad('Give a reason for ending this route.')
      const to = isDate(b.effective_to) ? b.effective_to : today
      if (cur.effective_from && to < cur.effective_from) return bad('The end date cannot be before the route started.')
      const { error } = await g.sb.from('agency_commercial_elections').update({ status: 'ended', effective_to: to, ended_reason: reason, updated_at: new Date().toISOString() }).eq('id', cur.id).eq('status', 'active')
      return error ? bad(error.message, 409) : NextResponse.json({ ok: true })
    }
    if (b.action === 'withdraw') {
      if (cur.status !== 'proposed') return bad('Only a pending selection can be withdrawn.', 409)
      const { error } = await g.sb.from('agency_commercial_elections').update({ status: 'withdrawn', ended_reason: txt(b.reason), updated_at: new Date().toISOString() }).eq('id', cur.id).eq('status', 'proposed')
      return error ? bad(error.message, 409) : NextResponse.json({ ok: true })
    }
    return bad('Unknown action.')
  } catch (e: unknown) { console.error('PATCH elections', e); return bad(e instanceof Error ? e.message : 'Server error', 500) }
}