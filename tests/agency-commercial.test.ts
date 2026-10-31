import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agencyTermsFromVersion, eligibilityFor, electionCoveringDate, endDateForReplaced, buildAcceptanceStatement,
  computeAgencySuccessFee, checkFeeObligation, validateEntitlement, type ElectionRow,
} from '../lib/agency-commercial'
import { computeSuccessFee } from '../lib/commercial-terms'

const ent = { includes: ['Submit developments for review'], limits: ['No exclusivity'], excludes: ['Confidential documents'], extra_charges: [] }
const version = (over: Record<string, any> = {}) => ({
  id: 'v1', version_label: 'v1-2026', status: 'approved', effective_from: '2026-10-01', legal_review_status: 'not_reviewed',
  success_fee_schedule: [{ up_to: 500_000_000, rate_pct: 2 }, { up_to: 1_000_000_000, rate_pct: 1.5 }, { up_to: null, rate_pct: 1 }], fee_currency: 'NGN',
  agency_success_fee_commitment_months: 12,
  agency_success_fee_schedule: [{ up_to: null, rate_pct: 1.5 }], agency_fee_payer: 'agency',
  agency_entitlements: { subscription: ent, success_fee: ent }, ...over,
})
const TODAY = '2026-10-22'
const terms = (o = {}) => agencyTermsFromVersion(version(o), TODAY)
const agency = { active: true }

test('no approved terms: neither route can be accepted', () => {
  const t = agencyTermsFromVersion(null, TODAY)
  for (const model of ['subscription', 'success_fee'] as const) {
    const e = eligibilityFor({ model, terms: t, agency, elections: [], subscription: null, today: TODAY })
    assert.equal(e.ok, false)
  }
})

test('draft or future-dated terms are not approved', () => {
  assert.equal(terms({ status: 'draft' }).approved, false)
  assert.equal(terms({ effective_from: '2026-12-01' }).approved, false)
})

test('a route with no defined entitlements cannot be accepted', () => {
  const t = terms({ agency_entitlements: { subscription: ent } })
  assert.equal(eligibilityFor({ model: 'subscription', terms: t, agency, elections: [], subscription: null, today: TODAY }).ok, true)
  const s = eligibilityFor({ model: 'success_fee', terms: t, agency, elections: [], subscription: null, today: TODAY })
  assert.equal(s.ok, false)
  assert.match(s.reasons.join(' '), /not yet defined/)
})

test('entitlements need an inclusion and a limit or exclusion', () => {
  assert.equal(validateEntitlement({ includes: ['x'] }).ok, false)
  assert.equal(validateEntitlement({ includes: [], limits: ['y'] }).ok, false)
  assert.equal(validateEntitlement({ includes: ['x'], excludes: ['y'] }).ok, true)
})

test('missing agency rate or commitment blocks the success-fee route only', () => {
  const t = terms({ agency_success_fee_schedule: null })
  assert.match(eligibilityFor({ model: 'success_fee', terms: t, agency, elections: [], subscription: null, today: TODAY }).reasons.join(' '), /rate has not been approved/)
  const t2 = terms({ agency_success_fee_commitment_months: null })
  assert.match(eligibilityFor({ model: 'success_fee', terms: t2, agency, elections: [], subscription: null, today: TODAY }).reasons.join(' '), /commitment period/)
  // a subscription never depends on a standard price: there is none
  assert.equal(eligibilityFor({ model: 'subscription', terms: t, agency, elections: [], subscription: null, today: TODAY }).ok, true)
})

test('success fee is not offered while a subscription is active, and the later date is explained', () => {
  const sub = { payment_status: 'payment_confirmed', approval_status: 'approved', activation_status: 'active', period_start: '2026-09-01', period_end: '2027-08-31', payment_reference: 'R1' }
  const e = eligibilityFor({ model: 'success_fee', terms: terms(), agency, elections: [], subscription: sub, today: TODAY })
  assert.equal(e.ok, false)
  assert.equal(e.effectiveFrom, '2027-09-01')
})

test('an expired subscription does not block the success-fee route', () => {
  const sub = { payment_status: 'payment_confirmed', approval_status: 'approved', activation_status: 'active', period_start: '2025-01-01', period_end: '2025-12-31', payment_reference: 'R1' }
  assert.equal(eligibilityFor({ model: 'success_fee', terms: terms(), agency, elections: [], subscription: sub, today: TODAY }).ok, true)
})

test('an unpaid subscription request does not count as active but is flagged', () => {
  const sub = { payment_status: 'awaiting_payment', approval_status: 'pending', activation_status: 'inactive', period_start: null, period_end: null }
  const e = eligibilityFor({ model: 'success_fee', terms: terms(), agency, elections: [], subscription: sub, today: TODAY })
  assert.equal(e.ok, true)
  assert.match(e.notes.join(' '), /unfinished Agency Subscription/)
})

test('choosing the route that is already active, or already pending, is refused', () => {
  const act: ElectionRow = { id: 'a', model: 'success_fee', status: 'active', effective_from: '2026-10-01', effective_to: null }
  assert.equal(eligibilityFor({ model: 'success_fee', terms: terms(), agency, elections: [act], subscription: null, today: TODAY }).ok, false)
  const pend: ElectionRow = { id: 'p', model: 'subscription', status: 'proposed', effective_from: null, effective_to: null }
  assert.equal(eligibilityFor({ model: 'subscription', terms: terms(), agency, elections: [pend], subscription: null, today: TODAY }).ok, false)
})

test('switching from success fee to subscription is allowed and says what happens to the old route', () => {
  const act: ElectionRow = { id: 'a', model: 'success_fee', status: 'active', effective_from: '2026-10-01', effective_to: null }
  const e = eligibilityFor({ model: 'subscription', terms: terms(), agency, elections: [act], subscription: null, today: TODAY })
  assert.equal(e.ok, true)
  assert.match(e.notes.join(' '), /already triggered stay under the success-fee route/)
})

test('an inactive agency cannot choose a route', () => {
  assert.equal(eligibilityFor({ model: 'subscription', terms: terms(), agency: { active: false }, elections: [], subscription: null, today: TODAY }).ok, false)
})

test('a model change never reaches back: the election in force on the TRIGGER date governs', () => {
  const els: ElectionRow[] = [
    { id: 'old', model: 'success_fee', status: 'ended', effective_from: '2026-01-01', effective_to: endDateForReplaced('2026-10-01') },
    { id: 'new', model: 'subscription', status: 'active', effective_from: '2026-10-01', effective_to: null },
  ]
  assert.equal(electionCoveringDate(els, '2026-09-30')?.id, 'old')
  assert.equal(electionCoveringDate(els, '2026-10-01')?.id, 'new')
  assert.equal(electionCoveringDate(els, '2025-12-31'), null)
  assert.equal(endDateForReplaced('2026-10-01'), '2026-09-30')
})

test('agency success fee uses the agency schedule: flat 1.5%, entire value, tier limits do not apply', () => {
  const t = terms()
  const f = (v: number) => computeAgencySuccessFee({ schedule: t.successFee!.schedule, feeCurrency: 'NGN', transactionValue: v, valueCurrency: 'NGN' })
  assert.equal(f(300_000_000).amount, 4_500_000)
  assert.equal(f(2_000_000_000).amount, 30_000_000)
  assert.equal(f(300_000_000).status, 'calculated')
  assert.equal(f(300_000_000).rate_pct, 1.5)
})

test('the developer schedule is untouched and is not replaced by the agency one', () => {
  const dev = version().success_fee_schedule
  const d = computeSuccessFee({ basis: 'transaction_value', transactionValue: 300_000_000, valueCurrency: 'NGN', feeCurrency: 'NGN', schedule: dev })
  assert.equal(d.rate_pct, 2)
  assert.equal(d.amount, 6_000_000)
  const b = computeSuccessFee({ basis: 'transaction_value', transactionValue: 1_000_000_000, valueCurrency: 'NGN', feeCurrency: 'NGN', schedule: dev })
  assert.equal(b.rate_pct, 1.5) // inclusive upper limit
})

test('currency mismatch and missing value are not calculated or converted', () => {
  const sch = terms().successFee!.schedule
  assert.equal(computeAgencySuccessFee({ schedule: sch, feeCurrency: 'NGN', transactionValue: 5, valueCurrency: 'USD' }).status, 'requires_information')
  assert.equal(computeAgencySuccessFee({ schedule: sch, feeCurrency: 'NGN', transactionValue: null, valueCurrency: 'NGN' }).status, 'requires_information')
})

test('acceptance statement carries version, date, price or rate, payer and limits', () => {
  const t = terms()
  const s = buildAcceptanceStatement('success_fee', t, '2026-10-22')
  assert.match(s, /v1-2026/); assert.match(s, /1\.5%/); assert.match(s, /No subscription fee/); assert.match(s, /Initial commitment: 12 months/); assert.match(s, /Registering, submitting a development/); assert.match(s, /Excludes: Confidential documents/)
  assert.doesNotMatch(s, /approved for finance|guarantee/i)
})

test('duplicate fee calculation for the same transaction is refused; different payer needs a documented arrangement', () => {
  const ex = [{ id: 'c1', status: 'proposed', payer: 'developer' as const, development_id: 'd1', deal_reference: 'ML-1' }]
  assert.equal(checkFeeObligation({ development_id: 'd1', deal_reference: 'ML-1', payer: 'developer', existing: ex }).ok, false)
  const other = checkFeeObligation({ development_id: 'd1', deal_reference: 'ML-1', payer: 'agency', existing: ex })
  assert.equal(other.ok, false); assert.match(other.error!, /documented, agreed arrangement/)
  assert.equal(checkFeeObligation({ development_id: 'd1', deal_reference: 'ML-2', payer: 'agency', existing: ex }).ok, true)
  assert.equal(checkFeeObligation({ development_id: 'd1', deal_reference: 'ML-1', payer: 'developer', existing: [{ ...ex[0], status: 'superseded' }] }).ok, true)
})
