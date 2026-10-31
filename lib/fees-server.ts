// lib/fees-server.ts — server-only helpers for fee payment requests (callers have already authorised the caller).
import { sbAdmin } from './supabase/admin'
import { balanceOf, isOverdue, partnerStatusLabel } from './fees'

export async function logFeeEvent(e: { payment_request_id: string; payment_id?: string | null; event_type: string; actor_user_id: string | null; actor_role: 'partner' | 'admin' | 'system'; message?: string | null; proposed_date?: string | null; decided_date?: string | null; visible_to_partner?: boolean; detail?: Record<string, unknown> }) {
  const { error } = await sbAdmin.from('fee_payment_events').insert({ payment_request_id: e.payment_request_id, payment_id: e.payment_id ?? null, event_type: e.event_type, actor_user_id: e.actor_user_id, actor_role: e.actor_role,
    message: e.message ?? null, proposed_date: e.proposed_date ?? null, decided_date: e.decided_date ?? null, visible_to_partner: e.visible_to_partner !== false, detail: e.detail ?? {} })
  if (error) console.error('fee_payment_events insert failed', error.message)
  return !error
}

/** Recompute the obligation's status from its VERIFIED payments only and store it. Returns the balance. */
export async function refreshRequest(id: string) {
  const { data: r } = await sbAdmin.from('fee_payment_requests').select('id,amount,status,due_date').eq('id', id).maybeSingle()
  if (!r) return null
  const { data: pays } = await sbAdmin.from('fee_payments').select('status,amount_claimed,verified_amount').eq('payment_request_id', id)
  const b = balanceOf(r.amount, (pays ?? []) as any)
  if (r.status !== 'withdrawn' && r.status !== b.status) await sbAdmin.from('fee_payment_requests').update({ status: b.status }).eq('id', id)
  return b
}

/** One obligation as the screens show it: balance, overdue, label, its payments and its history. `forPartner` hides internal notes. */
export async function describeRequest(r: any, forPartner: boolean) {
  const [{ data: pays }, { data: evs }] = await Promise.all([
    sbAdmin.from('fee_payments').select('*').eq('payment_request_id', r.id).order('created_at', { ascending: true }),
    sbAdmin.from('fee_payment_events').select('id,payment_id,event_type,actor_role,message,proposed_date,decided_date,visible_to_partner,created_at').eq('payment_request_id', r.id).order('created_at', { ascending: true }),
  ])
  const b = balanceOf(r.amount, (pays ?? []) as any)
  const status = r.status === 'withdrawn' ? 'withdrawn' : b.status
  const overdue = isOverdue(r.due_date, b.outstanding, status)
  return {
    id: r.id, reference: r.reference, requestId: r.request_id, calculationId: r.calculation_id, partyRole: r.party_role, amount: Number(r.amount), currency: r.currency, reason: r.reason,
    instructions: r.instructions, issuedAt: r.issued_at, originalDueDate: r.original_due_date, dueDate: r.due_date, status, overdue, verified: b.verified, outstanding: b.outstanding, claimedNotVerified: b.claimedNotVerified,
    statusLabel: partnerStatusLabel(status as any, { overdue, claimedNotVerified: b.claimedNotVerified }),
    payments: (pays ?? []).map(p => ({ id: p.id, method: p.method, status: p.status, reference: p.partner_reference, amountClaimed: p.amount_claimed, paidOnClaimed: p.paid_on_claimed, note: p.partner_note, verifiedAmount: p.verified_amount, verifiedOn: p.verified_on, verifiedReference: p.verified_reference, verificationNote: forPartner && p.status !== 'rejected' ? null : p.verification_note, createdAt: p.created_at })),
    events: (evs ?? []).filter(e => !forPartner || e.visible_to_partner),
  }
}
