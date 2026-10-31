// app/api/agency/subscription-payment/route.ts — pay an ACCEPTED custom subscription proposal through Paystack.
//   POST { subscription_id }  start a payment. The amount and currency come from the accepted proposal's subscription record, never from the browser.
//   GET  ?reference=…         the return page asks "did it work?"; the server verifies with Paystack itself. The query string is never proof.
// Paying confirms PAYMENT only. MANOP still approves and activates the subscription as separate recorded steps.
import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { acceptedProposalFor } from '../../../../lib/agency-subscription-server'
import { paystackConfig, initializeTransaction, newReference, toMinor } from '../../../../lib/paystack'
import { settle } from '../../../../lib/paystack-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function agencyOf(req: NextRequest) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: bad('Sign in required.', 401) } as const
  const { data: agency } = await sb.from('data_partners').select('id,name,contact_email').eq('auth_user_id', user.id).maybeSingle()
  if (!agency) return { error: bad('Payments are made from an agency account.', 403) } as const
  return { user, agency } as const
}

export async function POST(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    const cfg = paystackConfig(); if (!cfg) return bad('Online payment is not available yet. MANOP will send payment instructions.', 503)
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    if (typeof b.subscription_id !== 'string' || !UUID.test(b.subscription_id)) return bad('Invalid subscription.')
    const { data: sub } = await sbAdmin.from('agency_subscriptions').select('*').eq('id', b.subscription_id).eq('agency_id', a.agency.id).maybeSingle()
    if (!sub) return bad('Subscription not found.', 404)
    const pc = await acceptedProposalFor(sub); if (!pc.ok) return bad(pc.reason ?? 'Not payable yet.', 409)
    if (sub.payment_status === 'payment_confirmed') return bad('Payment has already been confirmed for this subscription.', 409)
    if (sub.price_amount == null || Number(sub.price_amount) <= 0) return bad('This subscription has no agreed price.', 409)
    if ((sub.price_currency ?? 'NGN') !== 'NGN') return bad('Online payment supports NGN only. MANOP will send instructions for other currencies.', 409)
    const { data: done } = await sbAdmin.from('paystack_payments').select('id').eq('subscription_id', sub.id).eq('status', 'succeeded').limit(1)
    if (done?.length) return bad('This subscription has already been paid.', 409)

    const reference = newReference()
    const amountMinor = toMinor(Number(sub.price_amount))
    const { error: ie } = await sbAdmin.from('paystack_payments').insert({ reference, purpose: 'agency_subscription', subscription_id: sub.id, agency_id: a.agency.id, amount_minor: amountMinor, currency: 'NGN', environment: cfg.environment, initiated_by: a.user.id })
    if (ie) return bad('Could not start the payment. Please try again.', 500)
    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin
    const init = await initializeTransaction(cfg, { email: a.agency.contact_email || a.user.email || '', amountMinor, currency: 'NGN', reference, callbackUrl: `${origin}/agency/dashboard?tab=agreement&payment_ref=${encodeURIComponent(reference)}`, metadata: { purpose: 'agency_subscription', subscription_id: sub.id } })
    if (!init.ok) { await sbAdmin.from('paystack_payments').update({ status: 'failed', failure_reason: init.error ?? 'failed' }).eq('reference', reference); return bad(init.error ?? 'Payment could not be started.', 502) }
    await sbAdmin.from('paystack_payments').update({ status: 'pending', authorization_url: init.authorizationUrl }).eq('reference', reference)
    return NextResponse.json({ authorizationUrl: init.authorizationUrl, reference })
  } catch (e) { console.error('POST subscription-payment', e); return bad('Could not start the payment.', 500) }
}

export async function GET(req: NextRequest) {
  try {
    const a = await agencyOf(req); if ('error' in a) return a.error
    const ref = req.nextUrl.searchParams.get('reference') || ''
    const { data: p } = await sbAdmin.from('paystack_payments').select('reference,agency_id').eq('reference', ref).maybeSingle()
    if (!p || p.agency_id !== a.agency.id) return bad('Payment not found.', 404)
    const r = await settle(ref)
    return NextResponse.json({ status: r.status, message: r.status === 'succeeded' ? 'Payment received. MANOP will now approve and activate your subscription.' : r.status === 'pending' ? 'Your payment is still being processed.' : r.message ?? 'The payment was not completed.' })
  } catch (e) { console.error('GET subscription-payment', e); return bad('Could not check the payment.', 500) }
}