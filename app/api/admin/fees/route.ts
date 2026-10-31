// app/api/admin/fees/route.ts — MANOP's fee desk: assessments ready for a payment request, payment requests, partner reports, verification.
//   GET   { assessmentRequests, readyAssessments, paymentRequests }
//   POST  { action }:
//     create_payment_request  calculation_id, due_date, instructions, reason?     ONE obligation per confirmed assessment (database-enforced)
//     set_deadline            payment_request_id, next_due_date, reason           records a decision (for example on an extension request); history keeps the original
//     remind                  payment_request_id, message?                        another request to pay against the SAME obligation (no new obligation)
//     record_payment          payment_request_id, method, amount, verified_on, reference, note   MANOP saw money arrive (manual payment): recorded verified
//     verify_payment          payment_id, amount, verified_on, reference, note    verify a partner's report; partial amounts allowed, balance stays visible
//     reject_payment          payment_id, note                                    the report could not be matched; the obligation is unchanged
//     withdraw                payment_request_id, reason
//     decide_assessment       id, decision under_review|accept|decline, note, calculation_id?   answer a partner's assessment request
// Stages stay separate: a confirmed assessment, a payment request, a reported payment and a verified payment are different records.
// Nothing here calls a payment provider, sends email, or treats a claim as money received.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '../../../../lib/admin-guard'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { newFeeReference, planPaymentRequest, planVerify, planDeadline, PAYMENT_METHODS, balanceOf } from '../../../../lib/fees'
import { logFeeEvent, refreshRequest, describeRequest } from '../../../../lib/fees-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const missing = (e: { message?: string } | null) => !!e && /does not exist|schema cache/i.test(e.message ?? '')

export async function GET(req: NextRequest) {
  const g = await requireStaff(req, 'fees'); if ('error' in g) return g.error
  const { data: reqs, error } = await sbAdmin.from('fee_payment_requests').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return missing(error) ? bad('The fee tables are not installed yet (phase26 has not been applied).', 503) : bad('Could not load the fee desk.', 500)
  const paymentRequests = await Promise.all((reqs ?? []).map(async r => {
    const { data: a } = await sbAdmin.from('agreement_requests').select('reference,company_name,requester_role').eq('id', r.request_id).maybeSingle()
    return { ...(await describeRequest(r, false)), agreementReference: a?.reference ?? null, company: a?.company_name ?? null }
  }))
  const { data: ar } = await sbAdmin.from('fee_assessment_requests').select('*').in('status', ['requested', 'under_review']).order('created_at', { ascending: true })
  const assessmentRequests = await Promise.all((ar ?? []).map(async a => {
    const { data: q } = await sbAdmin.from('agreement_requests').select('reference,company_name,status').eq('id', a.request_id).maybeSingle()
    return { ...a, agreementReference: q?.reference ?? null, company: q?.company_name ?? null, agreementStatus: q?.status ?? null }
  }))
  // Confirmed assessments that do not have a payment request yet
  const { data: confirmed } = await sbAdmin.from('agreement_fee_calculations').select('id,request_id,development_id,deal_reference,amount,currency,transaction_date,created_at').eq('status', 'confirmed')
  const taken = new Set((reqs ?? []).filter(r => r.status !== 'withdrawn').map(r => r.calculation_id))
  const readyAssessments = await Promise.all((confirmed ?? []).filter(c => !taken.has(c.id)).map(async c => {
    const { data: q } = await sbAdmin.from('agreement_requests').select('reference,company_name,requester_role').eq('id', c.request_id).maybeSingle()
    return { ...c, agreementReference: q?.reference ?? null, company: q?.company_name ?? null, partyRole: q?.requester_role ?? null }
  }))
  return NextResponse.json({ assessmentRequests, readyAssessments, paymentRequests })
}

export async function POST(req: NextRequest) {
  try {
    const g = await requireStaff(req, 'fees'); if ('error' in g) return g.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const actor = g.user.id
    const id = (k: string) => (typeof b[k] === 'string' && UUID.test(b[k] as string) ? (b[k] as string) : null)
    const loadReq = async () => { const i = id('payment_request_id'); if (!i) return null; return (await sbAdmin.from('fee_payment_requests').select('*').eq('id', i).maybeSingle()).data }
    const balanceFor = async (r: any) => { const { data } = await sbAdmin.from('fee_payments').select('status,amount_claimed,verified_amount').eq('payment_request_id', r.id); return balanceOf(r.amount, (data ?? []) as any) }

    if (b.action === 'create_payment_request') {
      const cid = id('calculation_id'); if (!cid) return bad('Choose a confirmed assessment.')
      const { data: calc } = await sbAdmin.from('agreement_fee_calculations').select('id,request_id,status,amount,currency,deal_reference,transaction_date').eq('id', cid).maybeSingle()
      if (!calc) return bad('Assessment not found.', 404)
      const { data: ag } = await sbAdmin.from('agreement_requests').select('id,status,requester_role,requester_user_id,reference').eq('id', calc.request_id).maybeSingle()
      if (!ag) return bad('Agreement not found.', 404)
      const { data: open } = await sbAdmin.from('fee_payment_requests').select('id').eq('calculation_id', cid).neq('status', 'withdrawn').maybeSingle()
      const reason = txt(b.reason) ?? `MANOP success fee under agreement ${ag.reference}${calc.deal_reference ? `, transaction ${calc.deal_reference}` : ''}`
      const plan = planPaymentRequest({ calculationStatus: calc.status, calculationAmount: calc.amount, agreementStatus: ag.status, dueDate: b.due_date, instructions: b.instructions, reason, alreadyOpen: !!open }); if (!plan.ok) return bad(plan.error!, 409)
      let row: any = null
      for (let i = 0; i < 4 && !row; i++) {
        const { data, error } = await sbAdmin.from('fee_payment_requests').insert({ reference: newFeeReference(), calculation_id: cid, request_id: ag.id, party_role: ag.requester_role, payer_user_id: ag.requester_user_id,
          amount: calc.amount, currency: calc.currency, reason, instructions: txt(b.instructions), original_due_date: b.due_date, due_date: b.due_date, created_by: actor }).select().single()
        if (!error) { row = data; break }
        if (error.code === '23505' && /one_per_calc/.test(error.message)) return bad('A payment request already exists for this assessment.', 409)
        if (error.code !== '23505') return bad(error.message, 400)
      }
      if (!row) return bad('Could not create the request. Try again.', 500)
      await logFeeEvent({ payment_request_id: row.id, event_type: 'issued', actor_user_id: actor, actor_role: 'admin', message: reason, decided_date: row.due_date })
      return NextResponse.json({ request: row }, { status: 201 })
    }

    if (b.action === 'set_deadline') {
      const r = await loadReq(); if (!r) return bad('Payment request not found.', 404)
      const bal = await balanceFor(r)
      const plan = planDeadline({ current: r.due_date, next: b.next_due_date, reason: b.reason, requestStatus: bal.status === 'paid' ? 'paid' : r.status }); if (!plan.ok) return bad(plan.error!, 409)
      await sbAdmin.from('fee_payment_requests').update({ due_date: b.next_due_date }).eq('id', r.id)
      await logFeeEvent({ payment_request_id: r.id, event_type: 'deadline_changed', actor_user_id: actor, actor_role: 'admin', message: txt(b.reason), decided_date: b.next_due_date as string, detail: { previous: r.due_date } })
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'remind') {
      const r = await loadReq(); if (!r) return bad('Payment request not found.', 404)
      if (r.status === 'withdrawn' || r.status === 'paid') return bad('There is nothing outstanding on this request.', 409)
      await logFeeEvent({ payment_request_id: r.id, event_type: 'reminder', actor_user_id: actor, actor_role: 'admin', message: txt(b.message) ?? 'MANOP asks you to pay the outstanding balance on this request.' })
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'record_payment' || b.action === 'verify_payment') {
      let r: any, pay: any = null
      if (b.action === 'verify_payment') {
        const pid = id('payment_id'); if (!pid) return bad('Choose a payment.')
        pay = (await sbAdmin.from('fee_payments').select('*').eq('id', pid).maybeSingle()).data; if (!pay) return bad('Payment not found.', 404)
        r = (await sbAdmin.from('fee_payment_requests').select('*').eq('id', pay.payment_request_id).maybeSingle()).data
      } else r = await loadReq()
      if (!r) return bad('Payment request not found.', 404)
      const bal = await balanceFor(r)
      const plan = planVerify({ requestStatus: r.status, outstanding: bal.outstanding, amount: b.amount, verifiedOn: b.verified_on, reference: b.reference, paymentStatus: pay?.status }); if (!plan.ok) return bad(plan.error!, 409)
      const fields = { status: 'verified', verified_amount: plan.amount, verified_on: b.verified_on, verified_reference: txt(b.reference, 200), verified_by: actor, verified_at: new Date().toISOString(), verification_note: txt(b.note) }
      let paymentId: string
      if (pay) { const { error } = await sbAdmin.from('fee_payments').update(fields).eq('id', pay.id).eq('status', 'claimed'); if (error) return bad(error.code === '23505' ? 'That reference was already verified against this request.' : error.message, 409); paymentId = pay.id }
      else {
        if (!(PAYMENT_METHODS as readonly string[]).includes(b.method as string)) return bad('Choose the payment method.')
        const { data, error } = await sbAdmin.from('fee_payments').insert({ payment_request_id: r.id, method: b.method, partner_reference: txt(b.reference, 200), amount_claimed: plan.amount, paid_on_claimed: b.verified_on, created_by: actor, created_by_role: 'admin', ...fields }).select('id').single()
        if (error) return bad(error.code === '23505' ? 'That reference was already verified against this request.' : error.message, 409); paymentId = data.id
      }
      const after = await refreshRequest(r.id)
      await logFeeEvent({ payment_request_id: r.id, payment_id: paymentId, event_type: 'payment_verified', actor_user_id: actor, actor_role: 'admin', message: txt(b.note), detail: { amount: plan.amount, on: b.verified_on, reference: txt(b.reference, 200), partial: plan.partial, outstanding_after: after?.outstanding } })
      return NextResponse.json({ ok: true, outstanding: after?.outstanding, status: after?.status })
    }

    if (b.action === 'reject_payment') {
      const pid = id('payment_id'); const note = txt(b.note); if (!pid) return bad('Choose a payment.'); if (!note) return bad('Say why the payment could not be matched.')
      const { data: pay } = await sbAdmin.from('fee_payments').select('id,status,payment_request_id').eq('id', pid).maybeSingle()
      if (!pay || pay.status !== 'claimed') return bad('Only a reported payment waiting for verification can be rejected.', 409)
      await sbAdmin.from('fee_payments').update({ status: 'rejected', verification_note: note, verified_by: actor, verified_at: new Date().toISOString() }).eq('id', pid).eq('status', 'claimed')
      await logFeeEvent({ payment_request_id: pay.payment_request_id, payment_id: pid, event_type: 'payment_not_matched', actor_user_id: actor, actor_role: 'admin', message: note })
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'withdraw') {
      const r = await loadReq(); const reason = txt(b.reason); if (!r) return bad('Payment request not found.', 404); if (!reason) return bad('Record why this request is withdrawn.')
      const bal = await balanceFor(r)
      if (bal.verified > 0) return bad('Money has already been verified against this request, so it cannot be withdrawn.', 409)
      await sbAdmin.from('fee_payment_requests').update({ status: 'withdrawn', withdrawn_reason: reason }).eq('id', r.id)
      await logFeeEvent({ payment_request_id: r.id, event_type: 'withdrawn', actor_user_id: actor, actor_role: 'admin', message: reason })
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'decide_assessment') {
      const aid = id('id'); const note = txt(b.note); if (!aid) return bad('Choose a request.')
      if (!['under_review', 'accept', 'decline'].includes(b.decision as string)) return bad('Unknown decision.')
      if (b.decision === 'decline' && !note) return bad('Tell the partner why the assessment is declined.')
      const upd: Record<string, unknown> = { status: b.decision === 'accept' ? 'accepted' : b.decision === 'decline' ? 'declined' : 'under_review', admin_note: note, decided_by: actor, decided_at: new Date().toISOString() }
      if (b.decision === 'accept') {
        const cid = id('calculation_id'); if (!cid) return bad('Record the fee calculation first (on the agreement page), then link it here.')
        const { data: a } = await sbAdmin.from('fee_assessment_requests').select('request_id').eq('id', aid).maybeSingle()
        const { data: c } = await sbAdmin.from('agreement_fee_calculations').select('id,request_id').eq('id', cid).maybeSingle()
        if (!a || !c || c.request_id !== a.request_id) return bad('That calculation belongs to a different agreement.', 409)
        upd.calculation_id = cid
      }
      const { error } = await sbAdmin.from('fee_assessment_requests').update(upd).eq('id', aid).in('status', ['requested', 'under_review'])
      if (error) return bad(error.message, 409)
      return NextResponse.json({ ok: true })
    }

    return bad('Unknown action.')
  } catch (e) { console.error('POST admin fees', e); return bad('That could not be completed. Please try again.', 500) }
}