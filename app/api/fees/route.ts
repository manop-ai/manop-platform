// app/api/fees/route.ts — a partner's (agency or developer) own fees: payment requests MANOP issued to them, their reports of payment, delay notes,
// and requests for a fee assessment. Own records only: ownership is the user the request was issued to; everyone else gets "not found".
//   GET   { paymentRequests, agreements (their completed agreements), assessmentRequests }
//   POST  { action:'claim_payment',   payment_request_id, method, amount, paid_on, reference, note? }  "I paid": recorded as a REPORT. Not proof of receipt.
//         { action:'delay_note',      payment_request_id, message, proposed_date?, extension? }          explain a delay / ask for more time; changes nothing by itself
//         { action:'request_assessment', agreement_id, description, project_id?, claimed_value?, currency?, occurred_on? }
// Payment is credited only when MANOP verifies it (see /api/admin/fees). Nothing here calls a payment provider.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../lib/supabase/route-client'
import { sbAdmin } from '../../../lib/supabase/admin'
import { planClaim, planDelayNote, newFeeReference, canSeePaymentRequest } from '../../../lib/fees'
import { logFeeEvent, describeRequest } from '../../../lib/fees-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const missing = (e: { message?: string } | null) => !!e && /does not exist|schema cache/i.test(e.message ?? '')

async function who(req: NextRequest) {
  const sb = sbFromRequest(req); const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: bad('Sign in required.', 401) } as const
  return { user } as const
}

export async function GET(req: NextRequest) {
  const w = await who(req); if ('error' in w) return w.error
  const { data: reqs, error } = await sbAdmin.from('fee_payment_requests').select('*').eq('payer_user_id', w.user.id).order('created_at', { ascending: false })
  if (error) return missing(error) ? NextResponse.json({ unavailable: true, paymentRequests: [], agreements: [], assessmentRequests: [] }) : bad('Could not load your fees.', 500)
  const paymentRequests = await Promise.all((reqs ?? []).map(r => describeRequest(r, true)))
  const { data: agreements } = await sbAdmin.from('agreement_requests').select('id,reference,company_name,executed_at').eq('requester_user_id', w.user.id).eq('status', 'executed')
  const { data: assessmentRequests } = await sbAdmin.from('fee_assessment_requests').select('id,reference,request_id,description,claimed_value,currency,occurred_on,status,admin_note,created_at').eq('requester_user_id', w.user.id).order('created_at', { ascending: false })
  return NextResponse.json({ paymentRequests, agreements: agreements ?? [], assessmentRequests: assessmentRequests ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const w = await who(req); if ('error' in w) return w.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const uid = w.user.id

    if (b.action === 'claim_payment' || b.action === 'delay_note') {
      const pid = typeof b.payment_request_id === 'string' && UUID.test(b.payment_request_id) ? b.payment_request_id : null
      const { data: r } = pid ? await sbAdmin.from('fee_payment_requests').select('*').eq('id', pid).maybeSingle() : { data: null }
      if (!r || !canSeePaymentRequest({ role: 'partner', userId: uid }, r)) return bad('Payment request not found.', 404)     // same answer for "missing" and "not yours"

      if (b.action === 'claim_payment') {
        const plan = planClaim({ requestStatus: r.status, method: b.method, amount: b.amount, paidOn: b.paid_on, reference: b.reference }); if (!plan.ok) return bad(plan.error!, 409)
        const { data: pay, error } = await sbAdmin.from('fee_payments').insert({ payment_request_id: r.id, method: b.method, partner_reference: txt(b.reference, 200), amount_claimed: Number(b.amount), paid_on_claimed: b.paid_on, partner_note: txt(b.note), created_by: uid, created_by_role: 'partner' }).select('id').single()
        if (error) return bad('Could not record your report. Please try again.', 500)
        await logFeeEvent({ payment_request_id: r.id, payment_id: pay.id, event_type: 'payment_reported', actor_user_id: uid, actor_role: 'partner', message: txt(b.note), detail: { amount: Number(b.amount), paid_on: b.paid_on, reference: txt(b.reference, 200), method: b.method } })
        return NextResponse.json({ ok: true, message: 'Thank you. MANOP will check the payment and confirm it. Until then the balance is unchanged.' })
      }
      const plan = planDelayNote({ requestStatus: r.status, message: b.message, proposedDate: b.proposed_date, wantsExtension: b.extension === true }); if (!plan.ok) return bad(plan.error!, 409)
      await logFeeEvent({ payment_request_id: r.id, event_type: b.extension === true ? 'extension_requested' : 'delay_explained', actor_user_id: uid, actor_role: 'partner', message: txt(b.message), proposed_date: (b.proposed_date as string) || null })
      return NextResponse.json({ ok: true, message: 'Sent to MANOP. The amount and deadline stay as they are until MANOP decides.' })
    }

    if (b.action === 'request_assessment') {
      const aid = typeof b.agreement_id === 'string' && UUID.test(b.agreement_id) ? b.agreement_id : null
      const { data: ag } = aid ? await sbAdmin.from('agreement_requests').select('id,status,requester_user_id').eq('id', aid).maybeSingle() : { data: null }
      if (!ag || ag.requester_user_id !== uid) return bad('Agreement not found.', 404)
      if (ag.status !== 'executed') return bad('A fee assessment can be requested only under a completed agreement.', 409)
      const description = txt(b.description, 4000); if (!description) return bad('Describe the transaction you believe qualifies.')
      let projectId: string | null = null
      if (typeof b.project_id === 'string' && b.project_id) {
        const { data: link } = UUID.test(b.project_id) ? await sbAdmin.from('agreement_request_developments').select('project_id').eq('request_id', ag.id).eq('project_id', b.project_id).maybeSingle() : { data: null }
        if (!link) return bad('That opportunity is not covered by this agreement.', 409)
        projectId = b.project_id
      }
      const value = b.claimed_value === '' || b.claimed_value == null ? null : Number(b.claimed_value)
      if (value !== null && (!Number.isFinite(value) || value <= 0)) return bad('Enter the transaction value as a positive number, or leave it empty.')
      let created: { id: string; reference: string } | null = null
      for (let i = 0; i < 4 && !created; i++) {
        const { data, error } = await sbAdmin.from('fee_assessment_requests').insert({ reference: newFeeReference().replace('FEE', 'ASSESS'), request_id: ag.id, requester_user_id: uid, project_id: projectId, description, claimed_value: value, currency: txt(b.currency, 3)?.toUpperCase() ?? null, occurred_on: typeof b.occurred_on === 'string' && b.occurred_on ? b.occurred_on : null }).select('id,reference').single()
        if (!error) created = data
        else if (error.code !== '23505') return bad('Could not send your request. Please try again.', 500)
      }
      return created ? NextResponse.json({ ok: true, reference: created.reference, message: 'MANOP has your request and will review it. This is not a charge.' }, { status: 201 }) : bad('Could not send your request.', 500)
    }
    return bad('Unknown action.')
  } catch (e) { console.error('POST fees', e); return bad('That could not be completed. Please try again.', 500) }
}