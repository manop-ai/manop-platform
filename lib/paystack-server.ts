// lib/paystack-server.ts — server-only: settle a payment from Paystack's VERIFIED result. Used by the webhook and the return-page check.
import { sbAdmin } from './supabase/admin'
import { logEvent } from './agency-subscription-server'
import { paystackConfig, verifyTransaction, settlementPlan } from './paystack'

export async function settle(reference: string): Promise<{ status: string; message?: string }> {
  const cfg = paystackConfig(); if (!cfg) return { status: 'error', message: 'Payments are not configured.' }
  const { data: p } = await sbAdmin.from('paystack_payments').select('*').eq('reference', reference).maybeSingle()
  if (!p) return { status: 'unknown' }
  if (p.status === 'succeeded') return { status: 'succeeded' }
  const v = await verifyTransaction(cfg, { reference, amountMinor: Number(p.amount_minor), currency: p.currency })
  const plan = settlementPlan(p, v)
  const now = new Date().toISOString()
  if (plan.paymentStatus) {
    const { data: upd } = await sbAdmin.from('paystack_payments').update({ status: plan.paymentStatus, verified_at: now, failure_reason: plan.reason ?? null, paystack_transaction_id: v.outcome === 'succeeded' ? v.transactionId : p.paystack_transaction_id, updated_at: now }).eq('id', p.id).neq('status', 'succeeded').select('id')
    if (!upd?.length) return { status: 'succeeded' }                      // another request already settled it
    if (plan.confirmSubscription && p.subscription_id) {
      // Payment confirmation only. Approval and activation remain separate admin steps.
      await sbAdmin.from('agency_subscriptions').update({ payment_status: 'payment_confirmed', payment_reference: reference, payment_confirmed_at: now, payment_confirmed_by: null, updated_at: now }).eq('id', p.subscription_id).eq('payment_status', 'awaiting_payment')
      await logEvent({ agency_id: p.agency_id, event_type: 'payment_confirmed_by_paystack', actor_user_id: null, actor_role: 'system', subscription_id: p.subscription_id, detail: { reference, environment: p.environment } })
    }
    if (plan.paymentStatus === 'mismatch') await logEvent({ agency_id: p.agency_id, event_type: 'payment_mismatch', actor_user_id: null, actor_role: 'system', subscription_id: p.subscription_id, detail: { reference, reason: plan.reason } })
    return { status: plan.paymentStatus, message: plan.reason }
  }
  return { status: v.outcome === 'pending' ? 'pending' : 'error', message: v.outcome === 'error' ? v.reason : undefined }
}