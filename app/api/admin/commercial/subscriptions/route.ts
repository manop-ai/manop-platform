// app/api/admin/commercial/subscriptions/route.ts — admin: Agency Subscription requests. Payment, approval and activation are SEPARATE
// recorded steps. Activation requires confirmed payment WITH a reference and approval (also enforced by a database check).

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../lib/admin-guard'
import { UUID_RE } from '../../../../../lib/agreements-server'
import { isMissingTable } from '../../../../../lib/agency-election-server'
import { acceptedProposalFor, logEvent } from '../../../../../lib/agency-subscription-server'
import { addMonths, canActivateSubscription, subscriptionPhase, SUBSCRIPTION_PHASE_LABEL } from '../../../../../lib/commercial-terms'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  const { data, error } = await g.sb.from('agency_subscriptions').select('*, data_partners(name,contact_email,verification_status)').order('created_at', { ascending: false }).limit(300)
  if (error) return bad(error.message)
  return NextResponse.json({ subscriptions: (data ?? []).map(r => { const p = subscriptionPhase(r); return { ...r, phase: p, phaseLabel: SUBSCRIPTION_PHASE_LABEL[p] } }) })
}

/** body: { id, action: 'confirm_payment' | 'approve' | 'decline' | 'activate' | 'suspend' | 'reinstate', ... } */
export async function PATCH(req: NextRequest) {
  const g = await requireAdmin(req); if ('error' in g) return g.error
  let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
  if (typeof b.id !== 'string' || !UUID_RE.test(b.id)) return bad('Invalid subscription.')
  const { data: cur } = await g.sb.from('agency_subscriptions').select('*').eq('id', b.id).maybeSingle()
  if (!cur) return bad('Subscription not found.', 404)
  if (['confirm_payment', 'approve', 'activate'].includes(String(b.action))) {
    // No payment, approval or activation without an accepted proposal (there is no standard price to fall back on).
    const pc = await acceptedProposalFor(cur); if (!pc.ok) return bad(pc.reason ?? 'No accepted proposal.', 409)
  }
  const now = new Date().toISOString(); let upd: Record<string, unknown> = { updated_at: now }
  switch (b.action) {
    case 'confirm_payment': {
      const ref = txt(b.payment_reference); if (!ref) return bad('Enter the payment reference (for example the bank transfer reference). Payment is only recorded once it has actually been received.')
      upd = { ...upd, payment_status: 'payment_confirmed', payment_reference: ref, payment_confirmed_at: isDate(b.payment_date) ? new Date(b.payment_date).toISOString() : now, payment_confirmed_by: g.user.id }; break }
    case 'approve': upd = { ...upd, approval_status: 'approved', approved_at: now, approved_by: g.user.id }; break
    case 'decline': { const n = txt(b.notes, 2000); if (!n) return bad('Say why the subscription is declined.'); upd = { ...upd, approval_status: 'declined', approved_at: now, approved_by: g.user.id, notes: n }; break }
    case 'activate': {
      const chk = canActivateSubscription(cur); if (!chk.ok) return bad(chk.reasons.join(' '), 409)
      if (cur.activation_status === 'active') return bad('Already active.', 409)
      // An agency never carries two routes at once: if a success-fee route is active, this subscription may only be activated as a
      // recorded switch (a pending subscription selection linked to it). If the elections table is not installed this check is skipped.
      const { data: act, error: ae } = await g.sb.from('agency_commercial_elections').select('id,model').eq('agency_id', cur.agency_id).eq('status', 'active').maybeSingle()
      if (!ae && act?.model === 'success_fee') {
        const { data: link } = await g.sb.from('agency_commercial_elections').select('id').eq('subscription_id', cur.id).eq('status', 'proposed').maybeSingle()
        if (!link) return bad('This agency has an active success-fee route. Record a route change (the agency selects the subscription route) before activating the subscription.', 409)
      } else if (ae && !isMissingTable(ae)) return bad(ae.message, 500)
      const start = isDate(b.period_start) ? b.period_start : now.slice(0, 10)
      upd = { ...upd, activation_status: 'active', period_start: start, period_end: addMonths(start, cur.period_months), suspended_reason: null }; break }
    case 'suspend': { const r = txt(b.reason, 1000); if (!r) return bad('Give a reason for the suspension.'); if (cur.activation_status !== 'active') return bad('Only an active subscription can be suspended.', 409); upd = { ...upd, activation_status: 'suspended', suspended_reason: r }; break }
    case 'reinstate': { if (cur.activation_status !== 'suspended') return bad('Only a suspended subscription can be reinstated.', 409); upd = { ...upd, activation_status: 'active', suspended_reason: null }; break }
    default: return bad('Unknown action.')
  }
  const { data, error } = await g.sb.from('agency_subscriptions').update(upd).eq('id', b.id).select().maybeSingle()
  if (error) return bad(error.message, 409)
  if (!data) return bad('Not permitted.', 403)
  // Activating the subscription also activates the agency's pending subscription selection (ending a success-fee route the day before).
  let election: { ok: boolean; error?: string } | null = null
  if (b.action === 'activate' && data.activation_status === 'active') {
    const { data: link, error: le } = await g.sb.from('agency_commercial_elections').select('*').eq('subscription_id', data.id).eq('status', 'proposed').maybeSingle()
    if (!le && link) { const { activateElection } = await import('../../../../../lib/agency-election-server'); election = await activateElection(g.sb as any, link, data.period_start, g.user.id, 'Replaced by the Agency Subscription') }
  }
  await logEvent({ agency_id: data.agency_id, event_type: `subscription_${String(b.action)}`, actor_user_id: g.user.id, actor_role: 'admin', subscription_id: data.id, proposal_id: data.proposal_id ?? null, detail: b.action === 'confirm_payment' ? { reference: data.payment_reference } : {} })
  const p = subscriptionPhase(data); return NextResponse.json({ subscription: { ...data, phase: p, phaseLabel: SUBSCRIPTION_PHASE_LABEL[p] }, election })
}