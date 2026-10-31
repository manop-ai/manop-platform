// lib/paystack.ts — Paystack for MANOP's OWN charges only (agency subscriptions; fee invoices later). Never property purchase funds.
// Server-only. Secret key from env (PAYSTACK_SECRET_KEY); test keys start with sk_test_. A browser redirect or any client-supplied
// "paid" flag is never proof: a payment counts only after (a) the webhook signature is valid or MANOP calls Paystack's verify endpoint
// itself, and (b) the verified amount, currency and reference match what MANOP recorded. `fetchImpl` is injectable for tests.
import { createHmac, timingSafeEqual, randomBytes } from 'crypto'

export interface PaystackCfg { secretKey: string; environment: 'test' | 'live'; baseUrl: string }
export function paystackConfig(env: Record<string, string | undefined> = process.env): PaystackCfg | null {
  const k = env.PAYSTACK_SECRET_KEY
  if (!k || !/^sk_(test|live)_/.test(k)) return null
  const environment = k.startsWith('sk_live_') ? 'live' : 'test'
  // Safety: a live key is refused unless explicitly allowed, so sandbox work cannot charge real money by accident.
  if (environment === 'live' && env.PAYSTACK_ALLOW_LIVE !== 'true') return null
  return { secretKey: k, environment, baseUrl: 'https://api.paystack.co' }
}

export const toMinor = (amount: number) => Math.round(amount * 100)
export function newReference(): string { return `MANOP-SUB-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString('hex').toUpperCase()}` }

/** Paystack signs the RAW body with HMAC-SHA512 using the secret key; header x-paystack-signature. */
export function validSignature(rawBody: string, header: string | null | undefined, secret: string): boolean {
  if (!header) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8'), b = Buffer.from(header.trim().toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

type Fetch = typeof fetch
export async function initializeTransaction(cfg: PaystackCfg, i: { email: string; amountMinor: number; currency: string; reference: string; callbackUrl: string; metadata?: Record<string, unknown> }, f: Fetch = fetch): Promise<{ ok: boolean; authorizationUrl?: string; accessCode?: string; error?: string }> {
  try {
    const r = await f(`${cfg.baseUrl}/transaction/initialize`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: i.email, amount: i.amountMinor, currency: i.currency, reference: i.reference, callback_url: i.callbackUrl, metadata: i.metadata ?? {} }) })
    const j: any = await r.json().catch(() => null)
    if (!r.ok || !j?.status || !j?.data?.authorization_url) return { ok: false, error: j?.message || 'Payment could not be started.' }
    return { ok: true, authorizationUrl: j.data.authorization_url, accessCode: j.data.access_code }
  } catch { return { ok: false, error: 'Payment provider could not be reached.' } }
}

export type VerifyOutcome = { outcome: 'succeeded'; transactionId: string } | { outcome: 'pending' } | { outcome: 'failed'; reason: string } | { outcome: 'mismatch'; reason: string } | { outcome: 'error'; reason: string }

/** Ask Paystack directly. Success requires status 'success' AND the exact amount, currency and reference MANOP recorded. */
export async function verifyTransaction(cfg: PaystackCfg, expected: { reference: string; amountMinor: number; currency: string }, f: Fetch = fetch): Promise<VerifyOutcome> {
  try {
    const r = await f(`${cfg.baseUrl}/transaction/verify/${encodeURIComponent(expected.reference)}`, { headers: { Authorization: `Bearer ${cfg.secretKey}` } })
    const j: any = await r.json().catch(() => null)
    if (!r.ok || !j?.status || !j?.data) return { outcome: 'error', reason: j?.message || 'Could not verify the payment.' }
    const d = j.data
    if (d.reference !== expected.reference) return { outcome: 'mismatch', reason: 'Reference mismatch.' }
    if (d.status === 'success') {
      if (Number(d.amount) !== expected.amountMinor) return { outcome: 'mismatch', reason: `Amount mismatch: expected ${expected.amountMinor}, paid ${d.amount}.` }
      if (String(d.currency).toUpperCase() !== expected.currency) return { outcome: 'mismatch', reason: 'Currency mismatch.' }
      return { outcome: 'succeeded', transactionId: String(d.id) }
    }
    if (['failed', 'reversed'].includes(d.status)) return { outcome: 'failed', reason: d.gateway_response || d.status }
    if (d.status === 'abandoned') return { outcome: 'failed', reason: 'abandoned' }
    return { outcome: 'pending' }
  } catch { return { outcome: 'error', reason: 'Payment provider could not be reached.' } }
}

export const eventKey = (type: string, reference: string | undefined, txId: unknown) => `${type}:${reference ?? ''}:${txId ?? ''}`

export interface PaymentRow { id: string; status: string; subscription_id: string | null }
/** What to record after verification. Idempotent: a payment that already succeeded is never changed or confirmed twice. */
export function settlementPlan(p: PaymentRow, v: VerifyOutcome): { paymentStatus: string | null; confirmSubscription: boolean; reason?: string } {
  if (p.status === 'succeeded') return { paymentStatus: null, confirmSubscription: false }
  if (v.outcome === 'succeeded') return { paymentStatus: 'succeeded', confirmSubscription: !!p.subscription_id }
  if (v.outcome === 'failed') return { paymentStatus: 'failed', confirmSubscription: false, reason: v.reason }
  if (v.outcome === 'mismatch') return { paymentStatus: 'mismatch', confirmSubscription: false, reason: v.reason }
  return { paymentStatus: null, confirmSubscription: false }       // pending or error: leave as is, try again later
}