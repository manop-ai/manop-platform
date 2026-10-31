import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBuyerPackPdf, computeGaps, packFilename, priceText, paymentText } from '../lib/buyer-pack'

const data: any = {
  generatedAt: new Date('2026-10-23T10:00:00Z'),
  project: { id: 'p1', name: 'The Lavender', neighborhood: 'Lekki', city: 'Lagos', state: 'Lagos', country_code: 'NG', stage: 'construction', total_units: 40, handover_date: null, description: 'Sample description', manop_checked_note: 'Checked: title document seen', manop_flag_note: null, reviewed_at: '2026-10-01T00:00:00Z' },
  developerName: null, developerNote: 'Developer identity is shown to signed-in users',
  units: [{ unit_type: '1-bedroom apartment', size_sqm: 60, price_ngn: 330_000_000, price_usd: null, currency_code: 'NGN', available_count: 6, quantity: 10, deposit_pct: 30, installment_months: null, completion_payment_pct: null, last_price_verified_at: null }],
  updates: [], documents: [{ id: 'd1', document_type: 'title', document_name: 'Certificate of Occupancy', status: 'provided', publicly_visible: false, verified: false }], evidence: [], images: [],
}

test('a Buyer Pack PDF is generated from a published development record', async () => {
  const bytes = await buildBuyerPackPdf(data)
  assert.ok(bytes.length > 1500)
  assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-')
  assert.match(packFilename('The Lavender', data.generatedAt), /\.pdf$/)
})

test('missing information is labelled, never invented', () => {
  const gaps = computeGaps(data)
  assert.ok(gaps.length > 0)
  assert.match(paymentText(data.units[0]), /30/)
  assert.doesNotMatch(priceText(data.units[0]), /undefined|NaN/)
})

import { buyerPackDecision } from '../lib/commercial-terms'
test('Buyer Pack is free and open with no approved price; gated only when a terms version requires access', () => {
  const open = { accessRequired: false, price: null, currency: null }
  assert.deepEqual(buyerPackDecision(open, null, false), { allowed: true, reason: 'open' })
  const gated = { accessRequired: true, price: 15000, currency: 'NGN' }
  assert.equal(buyerPackDecision(gated, null, false).allowed, false)
  assert.equal(buyerPackDecision(gated, { status: 'granted', basis: 'manual_grant', format_version: 1, expires_at: null }, false).allowed, true)
  assert.equal(buyerPackDecision(gated, { status: 'requested', basis: null, format_version: 1, expires_at: null }, false).reason, 'pending')
  assert.equal(buyerPackDecision(gated, null, true).allowed, true)
})
