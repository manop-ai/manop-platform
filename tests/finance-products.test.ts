import test from 'node:test'
import assert from 'node:assert/strict'
import {
  matchFinanceProducts, verificationState, isStale, matchingEligibility, missingCriteria, validateProductInput,
  type FinanceProduct,
} from '../lib/finance-products'

const NOW = new Date('2026-10-19T12:00:00Z').getTime()
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString()

const prod = (o: Partial<FinanceProduct> = {}): FinanceProduct => ({
  id: 'p1', lender_name: 'Test Bank', product_name: 'Test Home Loan', product_type: 'mortgage', country_code: 'NG',
  cities_covered: [], min_rate_pct: 9.75, max_rate_pct: 9.75, max_ltv_pct: 80, min_tenor_years: null, max_tenor_years: 20,
  min_monthly_income_ngn: null, eligibility_notes: null, source_name: 'Official page', source_url: 'https://example.com',
  last_verified_at: daysAgo(10), status: 'active', created_at: daysAgo(10), updated_at: daysAgo(10),
  coverage_scope: 'nationwide', ...o,
})
const one = (p: FinanceProduct, c: any) => matchFinanceProducts([p], { country_code: 'NG', ...c }, NOW)[0]

// ── Freshness ──────────────────────────────────────────────────────────────
test('freshness: current, stale, invalid, missing and future dates are all distinguished', () => {
  assert.equal(verificationState(daysAgo(10), NOW), 'current')
  assert.equal(verificationState(daysAgo(181), NOW), 'stale')
  assert.equal(verificationState('not a date', NOW), 'invalid')
  assert.equal(verificationState('', NOW), 'invalid')
  assert.equal(verificationState(undefined, NOW), 'invalid')
  assert.equal(verificationState(new Date(NOW + 5 * 86400000).toISOString(), NOW), 'future')
})
test('freshness: an INVALID date no longer slips through (old check: NaN > threshold was false)', () => {
  assert.equal(isStale('garbage'), true)
  const m = one(prod({ last_verified_at: 'garbage' }), { ltv_pct: 60 })
  assert.equal(m.verdict, 'stale'); assert.equal(m.fits, false)
})
test('freshness: a future verification date is not accepted as current', () => {
  const m = one(prod({ last_verified_at: new Date(NOW + 30 * 86400000).toISOString() }), { ltv_pct: 60 })
  assert.equal(m.fits, false); assert.match(m.reasons[0], /future/)
})
test('stale product: excluded regardless of how well the numbers line up', () => {
  const m = one(prod({ last_verified_at: daysAgo(400) }), { ltv_pct: 10 })
  assert.equal(m.verdict, 'stale'); assert.equal(m.fits, false); assert.equal(m.stale, true)
})

// ── Eligibility to be matched at all ───────────────────────────────────────
test('withdrawn products are not returned; awaiting-confirmation and unsourced products are withheld', () => {
  assert.equal(matchFinanceProducts([prod({ status: 'withdrawn' })], { country_code: 'NG' }, NOW).length, 0)
  assert.equal(one(prod({ verification_status: 'awaiting_confirmation' }), { ltv_pct: 60 }).verdict, 'confirmation_required')
  assert.equal(matchingEligibility(prod({ source_name: '  ' }), NOW).eligible, false)
})

// ── The criteria the old matcher ignored or mishandled ─────────────────────
test('loan amount is now checked against published loan limits', () => {
  const p = prod({ min_loan_amount_ngn: 5_000_000, max_loan_amount_ngn: 100_000_000 })
  assert.equal(one(p, { ltv_pct: 60, loan_amount_ngn: 50_000_000 }).verdict, 'meets_recorded')
  const hi = one(p, { ltv_pct: 60, loan_amount_ngn: 150_000_000 })
  assert.equal(hi.verdict, 'does_not_meet'); assert.match(hi.reasons.join(' '), /above the recorded maximum/)
  assert.equal(one(p, { ltv_pct: 60, loan_amount_ngn: 1_000_000 }).verdict, 'does_not_meet')
})
test('tenor is checked against BOTH the minimum and the maximum', () => {
  const p = prod({ min_tenor_years: 5, max_tenor_years: 20 })
  assert.equal(one(p, { ltv_pct: 60, loan_tenor_years: 10 }).verdict, 'meets_recorded')
  assert.equal(one(p, { ltv_pct: 60, loan_tenor_years: 25 }).verdict, 'does_not_meet')
  assert.equal(one(p, { ltv_pct: 60, loan_tenor_years: 2 }).verdict, 'does_not_meet')
})
test('interest rates are scenario information, never a pass/fail eligibility test', () => {
  const m = one(prod({ min_rate_pct: 30, max_rate_pct: 40 }), { ltv_pct: 60 })
  assert.equal(m.verdict, 'meets_recorded')
  assert.ok(!m.checks.some(c => /rate/i.test(c.key)))
})
test('deposit, residency, employment and income currency are applied where recorded', () => {
  const p = prod({ min_deposit_pct: 20, allowed_residency: ['resident'], allowed_employment: ['salaried'], income_currencies: ['NGN'] })
  assert.equal(one(p, { ltv_pct: 60, deposit_pct: 25, residency: 'resident', employment: 'salaried', income_currency: 'NGN' }).verdict, 'meets_recorded')
  assert.equal(one(p, { ltv_pct: 60, deposit_pct: 10 }).verdict, 'does_not_meet')
  assert.equal(one(p, { ltv_pct: 60, residency: 'diaspora' }).verdict, 'does_not_meet')
  assert.equal(one(p, { ltv_pct: 60, employment: 'self_employed' }).verdict, 'does_not_meet')
})

// ── Not recorded is NOT the same as unrestricted ───────────────────────────
test('an empty city list is NOT nationwide: coverage is unknown unless the record says nationwide', () => {
  const unknown = one(prod({ coverage_scope: undefined, cities_covered: [] }), { ltv_pct: 60, city: 'Lekki' })
  const cov = unknown.checks.find(c => c.key === 'coverage')!
  assert.equal(cov.outcome, 'unknown'); assert.equal(cov.unknown_reason, 'product_record')
  const nation = one(prod({ coverage_scope: 'nationwide' }), { ltv_pct: 60, city: 'Lekki' })
  assert.equal(nation.checks.find(c => c.key === 'coverage')!.outcome, 'met')
})
test('listed cities: a city outside the list is a confirmed mismatch; no city given is listed as not assessed', () => {
  const p = prod({ coverage_scope: 'cities', cities_covered: ['Lagos', 'Abuja'] })
  assert.equal(one(p, { ltv_pct: 60, city: 'Kano' }).verdict, 'does_not_meet')
  assert.equal(one(p, { ltv_pct: 60, city: 'lagos' }).verdict, 'meets_recorded')
  const noCity = one(p, { ltv_pct: 60 })   // LTV met; the city was simply not given, so coverage is listed as not assessed
  assert.equal(noCity.verdict, 'meets_recorded')
  assert.ok(noCity.reasons.some(r => /Not assessed: City was not provided/.test(r)))
  assert.equal(one(p, {}).verdict, 'insufficient_information')
})
test('a product with nothing recorded is not falsely treated as fully eligible', () => {
  const bare = prod({ max_ltv_pct: null, max_tenor_years: null, coverage_scope: 'unknown' })
  const m = one(bare, { ltv_pct: 60, loan_tenor_years: 15, monthly_income_ngn: 500000 })
  assert.equal(m.verdict, 'insufficient_information'); assert.equal(m.fits, false)
})
test('with no usable buyer input at all the answer is "insufficient information", not a pass', () => {
  const m = one(prod(), {})   // product records a max LTV and tenor; buyer gave neither
  assert.equal(m.verdict, 'insufficient_information')
  assert.ok(m.checks.some(c => c.unknown_reason === 'buyer_input'))
})
test('"meets" with a recorded criterion left unchecked says so', () => {
  const m = one(prod(), { ltv_pct: 60 })   // tenor is recorded (20y) but the buyer gave none
  assert.equal(m.verdict, 'meets_recorded')
  assert.ok(m.reasons.some(r => /Not assessed: Tenor was not provided/.test(r)))
})
test('free-text property conditions are listed as NOT assessed, never as satisfied', () => {
  const m = one(prod({ property_eligibility: 'Property must have an existing registered title' }), { ltv_pct: 60 })
  assert.equal(m.verdict, 'meets_recorded')
  assert.ok(m.reasons.some(r => /Not assessed/.test(r)))
})
test('"meets" is only ever worded as meeting recorded criteria; never approval language', () => {
  const m = one(prod(), { ltv_pct: 60, loan_tenor_years: 15 })
  const text = [m.verdict, ...m.reasons].join(' ')
  assert.equal(m.verdict, 'meets_recorded')
  assert.doesNotMatch(text, /approved|pre-?qualified|eligible for|guarantee/i)
  assert.match(text, /not a lender decision/)
})
test('anything short of provider-confirmed is flagged as needing provider confirmation', () => {
  assert.equal(one(prod({ verification_status: 'researched_public' }), { ltv_pct: 60 }).needs_provider_confirmation, true)
  assert.equal(one(prod({ verification_status: 'provider_confirmed' }), { ltv_pct: 60 }).needs_provider_confirmation, false)
})
test('LTV over the published maximum is a confirmed mismatch; the product-type filter still works', () => {
  assert.equal(one(prod({ max_ltv_pct: 70 }), { ltv_pct: 85 }).verdict, 'does_not_meet')
  assert.equal(matchFinanceProducts([prod()], { country_code: 'NG', product_type: 'nhf' }, NOW).length, 0)
})
test('admin "missing criteria" view lists what MANOP has not recorded', () => {
  const m = missingCriteria(prod({ max_ltv_pct: null, min_monthly_income_ngn: null, coverage_scope: 'unknown' }))
  assert.ok(m.includes('Maximum LTV') && m.includes('Minimum monthly income') && m.some(x => /Coverage/.test(x)))
})

// ── Admin input validation ─────────────────────────────────────────────────
const good = { lender_name: 'FirstBank', product_name: 'MREIF Home Loan', product_type: 'mortgage', source_name: 'Official page', last_verified_at: '2026-10-19' }
test('intake: required fields, valid date and a known product type are enforced', () => {
  assert.equal(validateProductInput(good, { now: NOW }).ok, true)
  assert.equal(validateProductInput({ ...good, source_name: '' }, { now: NOW }).ok, false)
  assert.equal(validateProductInput({ ...good, product_type: 'loan_shark' }, { now: NOW }).ok, false)
  const bad = validateProductInput({ ...good, last_verified_at: 'nope' }, { now: NOW })
  assert.ok(bad.errors.some(e => /valid date/.test(e)))
  const fut = validateProductInput({ ...good, last_verified_at: '2027-05-01' }, { now: NOW })
  assert.ok(fut.errors.some(e => /future/.test(e)))
})
test('intake: numbers are range-checked and min cannot exceed max', () => {
  assert.equal(validateProductInput({ ...good, max_ltv_pct: 120 }, { now: NOW }).ok, false)
  assert.equal(validateProductInput({ ...good, max_rate_pct: -1 }, { now: NOW }).ok, false)
  assert.equal(validateProductInput({ ...good, min_tenor_years: 30, max_tenor_years: 10 }, { now: NOW }).ok, false)
  assert.equal(validateProductInput({ ...good, min_loan_amount_ngn: 9e6, max_loan_amount_ngn: 1e6 }, { now: NOW }).ok, false)
  assert.equal(validateProductInput({ ...good, max_ltv_pct: 'abc' }, { now: NOW }).ok, false)
})
test('intake: coverage must be explicit; free prose in the cities box is not silently stored as a city', () => {
  assert.equal(validateProductInput({ ...good, coverage_scope: 'cities', cities_covered: '' }, { now: NOW }).ok, false)
  const n = validateProductInput({ ...good, coverage_scope: 'nationwide', cities_covered: 'ignored' }, { now: NOW })
  assert.deepEqual(n.value.cities_covered, [])
  assert.equal(validateProductInput({ ...good, source_url: 'javascript:alert(1)' }, { now: NOW }).ok, false)
})
test('intake: a partial update only validates and returns the fields it carries', () => {
  const r = validateProductInput({ max_ltv_pct: 75 }, { partial: true, now: NOW })
  assert.equal(r.ok, true); assert.deepEqual(r.value, { max_ltv_pct: 75 })
})
