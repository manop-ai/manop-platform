import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInternalSummary, buildDeveloperRequest, buildPartnerEnquiry, missingInformation, nextAction, fromFinancingRequest, fromIntroduction } from '../lib/request-handover'

const lead = {
  id: 'abcdef12-0000', manop_lead_id: 'ML-1001', name: 'Ada Obi', email: 'ada@x.com', phone: '0803', created_at: '2026-10-19T10:00:00Z',
  stage: 'new', routing_status: 'manop_operator', unit_type_label: '2-bed', unit_price_ngn: 55000000, unit_price_status: 'unconfirmed',
  request_purpose: 'payment_plan', note: 'Payment terms shown to buyer: 30% deposit · consent acknowledged', attribution_acknowledged_at: null,
}

test('developer request never includes buyer identity without recorded consent', () => {
  const r = fromIntroduction(lead, { developer: { company_name: 'Lavender Ltd', auth_user_id: null, email: null }, project: { name: 'The Lavender', city: 'Lagos' } })
  const t = buildDeveloperRequest(r, { shareBuyerWithDeveloper: true })
  assert.ok(!t.includes('Ada Obi') && !t.includes('ada@x.com') && !t.includes('0803'))
  assert.match(t, /ML-1001/)
})

test('developer request includes buyer only when consent recorded and requested', () => {
  const r = fromIntroduction({ ...lead, attribution_acknowledged_at: '2026-10-19' }, {})
  assert.ok(buildDeveloperRequest(r, { shareBuyerWithDeveloper: true }).includes('Ada Obi'))
  assert.ok(!buildDeveloperRequest(r).includes('Ada Obi'))
})

test('partner enquiry withholds contact by default and uses first name only', () => {
  const r = fromFinancingRequest({ id: 'aaaabbbb-1', buyer_name: 'Ada Obi', buyer_email: 'ada@x.com', buyer_phone: '0803', financing_type: 'mortgage', status: 'submitted', loan_amount_requested: 20000000 })
  const t = buildPartnerEnquiry(r)
  assert.ok(!t.includes('ada@x.com') && !t.includes('0803') && !t.includes('Obi'))
  assert.match(t, /withheld/)
  assert.ok(buildPartnerEnquiry(r, { shareContactWithPartner: true }).includes('ada@x.com'))
})

test('internal summary flags unsaved scenario, missing info, and never says approved', () => {
  const r = fromFinancingRequest({ id: 'aaaabbbb-1', buyer_name: 'Ada', buyer_email: 'a@x.com', financing_type: 'mortgage', status: 'submitted', notes: 'Scenario NOT saved. Declared figures: price 50m.' })
  const s = buildInternalSummary(r)
  assert.match(s, /NOT saved/)
  assert.ok(missingInformation(r).some(x => /phone/i.test(x)))
  assert.ok(!/pre-?qualified|approved for/i.test(s.replace('not a lender decision, an approval', '')))
})

test('unclaimed developer yields MANOP-handled next action and no invented contact', () => {
  const r = fromIntroduction(lead, { developer: { company_name: 'Lavender Ltd', auth_user_id: null, email: null } })
  assert.match(nextAction(r), /not claimed/)
  assert.ok(missingInformation(r).some(x => /developer/i.test(x)))
  assert.match(buildInternalSummary(r), /Developer contact on file.*: not recorded/)
})
