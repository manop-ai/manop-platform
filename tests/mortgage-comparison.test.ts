import test from 'node:test'
import assert from 'node:assert/strict'
import { compareProducts, comparisonSummary } from '../lib/mortgage-comparison'

const m = (name: string, verdict: any, lo: number | null, hi: number | null): any => ({ product: { lender_name: name, product_name: 'Home Loan', min_rate_pct: lo, max_rate_pct: hi }, verdict, fits: verdict === 'meets_recorded', stale: verdict === 'stale', needs_provider_confirmation: true, checks: [], reasons: ['x'] })
const sc = { loanNgn: 180_000_000, tenorYears: 20 }

test('products that meet recorded criteria come first, then lowest indicative repayment', () => {
  const r = compareProducts([m('B', 'meets_recorded', 12, 14), m('X', 'does_not_meet', 5, 6), m('A', 'meets_recorded', 9.75, 9.75), m('S', 'stale', 4, 4)], sc)
  assert.deepEqual(r.map(x => x.match.product.lender_name), ['A', 'B', 'S', 'X'])
  assert.equal(r[0].group, 'worth_asking'); assert.equal(r[2].group, 'not_current'); assert.equal(r[3].group, 'does_not_fit')
})

test('repayment is an arithmetic illustration at the recorded rate; missing rate is not invented', () => {
  const [a, b] = compareProducts([m('A', 'meets_recorded', 10, 12), m('N', 'meets_recorded', null, null)], sc)
  assert.ok(a.monthlyLow! > 0 && a.monthlyHigh! > a.monthlyLow!)
  assert.equal(a.totalLow, a.monthlyLow! * 240)
  assert.equal(b.monthlyLow, null); assert.equal(b.rateText, 'Rate not recorded')
})

test('no loan or term means no repayment figure', () => {
  const [a] = compareProducts([m('A', 'meets_recorded', 10, 10)], { loanNgn: 0, tenorYears: 20 })
  assert.equal(a.monthlyLow, null)
})

test('summary never says best or approved and states what it is', () => {
  const s = comparisonSummary(compareProducts([m('A', 'meets_recorded', 9.75, 9.75)], sc))
  assert.match(s, /illustration, not a quote or a lender decision/)
  assert.doesNotMatch(s, /\bbest\b|approved|pre-qualified|recommend/i)
  assert.match(comparisonSummary(compareProducts([m('X', 'does_not_meet', 5, 6)], sc)), /None of the products/)
  assert.match(comparisonSummary([]), /no current product records/)
})
