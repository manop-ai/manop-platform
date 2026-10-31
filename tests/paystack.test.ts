import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'crypto'
import { paystackConfig, validSignature, verifyTransaction, initializeTransaction, settlementPlan, toMinor, newReference, eventKey } from '../lib/paystack'

const cfg = { secretKey: 'sk_test_abc', environment: 'test' as const, baseUrl: 'https://api.paystack.co' }
const exp = { reference: 'R1', amountMinor: 75000000, currency: 'NGN' }
const reply = (data: any, ok = true) => (async () => new Response(JSON.stringify({ status: ok, data, message: ok ? 'ok' : 'bad' }), { status: ok ? 200 : 400 })) as unknown as typeof fetch

test('config: test key ok; live key refused unless explicitly allowed; malformed refused', () => {
  assert.equal(paystackConfig({ PAYSTACK_SECRET_KEY: 'sk_test_x' })!.environment, 'test')
  assert.equal(paystackConfig({ PAYSTACK_SECRET_KEY: 'sk_live_x' }), null)
  assert.equal(paystackConfig({ PAYSTACK_SECRET_KEY: 'sk_live_x', PAYSTACK_ALLOW_LIVE: 'true' })!.environment, 'live')
  assert.equal(paystackConfig({ PAYSTACK_SECRET_KEY: 'pk_test_x' }), null); assert.equal(paystackConfig({}), null)
})
test('webhook signature: valid HMAC-SHA512 of the raw body only', () => {
  const body = '{"event":"charge.success"}', sig = createHmac('sha512', 'sk_test_abc').update(body).digest('hex')
  assert.equal(validSignature(body, sig, 'sk_test_abc'), true)
  assert.equal(validSignature(body + ' ', sig, 'sk_test_abc'), false)
  assert.equal(validSignature(body, sig, 'other'), false); assert.equal(validSignature(body, null, 'sk_test_abc'), false); assert.equal(validSignature(body, 'abc', 'sk_test_abc'), false)
})
test('amounts are converted to kobo exactly; references are unique', () => {
  assert.equal(toMinor(750000), 75000000); assert.equal(toMinor(1234.56), 123456)
  assert.notEqual(newReference(), newReference()); assert.match(newReference(), /^MANOP-SUB-/)
})
test('a verified success needs matching amount, currency and reference', async () => {
  assert.deepEqual(await verifyTransaction(cfg, exp, reply({ status: 'success', reference: 'R1', amount: 75000000, currency: 'NGN', id: 99 })), { outcome: 'succeeded', transactionId: '99' })
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'success', reference: 'R1', amount: 100, currency: 'NGN', id: 1 }))).outcome, 'mismatch')       // underpayment
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'success', reference: 'R1', amount: 75000000, currency: 'USD', id: 1 }))).outcome, 'mismatch')
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'success', reference: 'OTHER', amount: 75000000, currency: 'NGN', id: 1 }))).outcome, 'mismatch')
})
test('failed, abandoned, pending and provider errors are not success', async () => {
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'failed', reference: 'R1', gateway_response: 'Declined' }))).outcome, 'failed')
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'abandoned', reference: 'R1' }))).outcome, 'failed')
  assert.equal((await verifyTransaction(cfg, exp, reply({ status: 'ongoing', reference: 'R1' }))).outcome, 'pending')
  assert.equal((await verifyTransaction(cfg, exp, reply(null, false))).outcome, 'error')
  assert.equal((await verifyTransaction(cfg, exp, (async () => { throw new Error('x') }) as unknown as typeof fetch)).outcome, 'error')
})
test('initialize sends the server-computed amount and surfaces provider errors', async () => {
  let sent: any
  const f = (async (_u: any, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', access_code: 'ac' } }), { status: 200 }) }) as unknown as typeof fetch
  const r = await initializeTransaction(cfg, { email: 'a@b.com', amountMinor: 75000000, currency: 'NGN', reference: 'R1', callbackUrl: 'https://x/y' }, f)
  assert.ok(r.ok); assert.equal(sent.amount, 75000000); assert.equal(sent.reference, 'R1')
  assert.equal((await initializeTransaction(cfg, { email: 'a@b.com', amountMinor: 1, currency: 'NGN', reference: 'R2', callbackUrl: 'x' }, reply(null, false))).ok, false)
})
test('settlement is idempotent and confirms the subscription only on a verified success', () => {
  const p = { id: 'p', status: 'pending', subscription_id: 's' }
  assert.deepEqual(settlementPlan(p, { outcome: 'succeeded', transactionId: '1' }), { paymentStatus: 'succeeded', confirmSubscription: true })
  assert.deepEqual(settlementPlan({ ...p, status: 'succeeded' }, { outcome: 'succeeded', transactionId: '1' }), { paymentStatus: null, confirmSubscription: false })   // webhook replay
  assert.equal(settlementPlan(p, { outcome: 'mismatch', reason: 'x' }).confirmSubscription, false)
  assert.equal(settlementPlan(p, { outcome: 'pending' }).paymentStatus, null)
  assert.equal(eventKey('charge.success', 'R1', 5), 'charge.success:R1:5')
})
