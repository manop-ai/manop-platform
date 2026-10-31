import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMortgagePayment, calculateAffordability, validateAffordabilityInputs, getFinanceSuitabilityLabel, LEGACY_SUITABILITY_LABELS,
  calculateInvestmentCashflow, validateInvestmentInputs, calculateUnitPaymentPlan, describeUnitPaymentTerms, PAYMENT_TERMS_CONFIRMATION_LINE,
} from '../lib/finance-intelligence'
import { validateAnalysisSave, describeSaveFailure, summariseAffordability } from '../lib/finance-analysis'

const near = (a: number, b: number, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`)
const base = { property_price_ngn: 100_000_000, deposit_available_ngn: 30_000_000, fees_ngn: 2_000_000, interest_rate_pct: 18, loan_tenor_years: 15 }

// ── Repayment maths ────────────────────────────────────────────────────────
test('zero-interest repayment is principal / months', () => {
  near(calculateMortgagePayment(120_000_000, 0, 10), 1_000_000)
})
test('standard mortgage repayment matches the amortising-loan formula', () => {
  // 70M at 18% p.a. over 15 years: r = 0.015, n = 180
  const r = 0.015, n = 180, expected = (70_000_000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  near(calculateMortgagePayment(70_000_000, 18, 15), expected)
  near(calculateMortgagePayment(70_000_000, 18, 15), 1_128_000, 5_000) // sanity: about ₦1.13M a month
})

// ── Affordability: deposits, balances, cash ────────────────────────────────
test('affordability separates price, deposit applied, balance, repayment and up-front cash', () => {
  const o = calculateAffordability(base)
  assert.equal(o.deposit_applied_ngn, 30_000_000)
  assert.equal(o.mortgage_requirement_ngn, 70_000_000)
  assert.equal(o.outstanding_balance_ngn, 70_000_000)
  assert.equal(o.required_equity_ngn, 30_000_000)
  near(o.ltv_pct, 70)
  assert.equal(o.cash_requirement_ngn, 32_000_000)      // deposit + the fees entered
  assert.equal(o.fees_included_ngn, 2_000_000)
  near(o.total_repayment_ngn, o.indicative_monthly_repayment_ngn * 180)
  near(o.total_interest_ngn!, o.total_repayment_ngn - 70_000_000)
})
test('different deposit sizes change the balance and the repayment, not the price', () => {
  const small = calculateAffordability({ ...base, deposit_available_ngn: 10_000_000 })
  const big = calculateAffordability({ ...base, deposit_available_ngn: 50_000_000 })
  assert.ok(small.mortgage_requirement_ngn > big.mortgage_requirement_ngn)
  assert.ok(small.indicative_monthly_repayment_ngn > big.indicative_monthly_repayment_ngn)
  near(small.ltv_pct, 90); near(big.ltv_pct, 50)
})
test('a deposit larger than the price is rejected by validation, and never inflates the cash requirement', () => {
  assert.ok(validateAffordabilityInputs({ ...base, deposit_available_ngn: 150_000_000 }).some(e => /more than the property price/.test(e)))
  const o = calculateAffordability({ ...base, deposit_available_ngn: 150_000_000 })
  assert.equal(o.deposit_applied_ngn, 100_000_000)
  assert.equal(o.excess_deposit_ngn, 50_000_000)
  assert.equal(o.cash_requirement_ngn, 102_000_000)      // price + fees, NOT 152M
  assert.equal(o.mortgage_requirement_ngn, 0); assert.equal(o.indicative_monthly_repayment_ngn, 0)
})
test('validation rejects zero/negative price, NaN, impossible rates and zero or invalid tenors', () => {
  assert.equal(validateAffordabilityInputs(base).length, 0)
  assert.ok(validateAffordabilityInputs({ ...base, property_price_ngn: 0 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, property_price_ngn: -5 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, property_price_ngn: NaN }).length)
  assert.ok(validateAffordabilityInputs({ ...base, deposit_available_ngn: -1 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, fees_ngn: -1 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, interest_rate_pct: -2 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, interest_rate_pct: 400 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, interest_rate_pct: Infinity }).length)
  assert.ok(validateAffordabilityInputs({ ...base, loan_tenor_years: 0 }).length)
  assert.ok(validateAffordabilityInputs({ ...base, loan_tenor_years: NaN }).length)
  assert.equal(validateAffordabilityInputs({ ...base, interest_rate_pct: 0 }).length, 0)   // zero interest is a valid scenario
})
test('affordability labels describe the calculation and never imply a lender decision', () => {
  for (const v of [10, 50, 60, 70, 85, 95, null, NaN, -1]) {
    const l = getFinanceSuitabilityLabel(v as any)
    assert.doesNotMatch(l, /suitable candidate|likely|approved|eligible|qualif/i)
  }
  assert.equal(getFinanceSuitabilityLabel(null), 'Insufficient information to assess')
  assert.equal(getFinanceSuitabilityLabel(60), 'Moderate loan share indicated: lender review required')
  assert.ok(LEGACY_SUITABILITY_LABELS['Mortgage Suitable Candidate'])   // old saved rows still display
})

// ── Investment: installment deposit is no longer paid twice ────────────────
const inv = { purchase_price_ngn: 100_000_000, monthly_rent_ngn: 600_000, vacancy_pct: 10, operating_expenses_pct: 20, financing_structure: 'installment' as const, installment_deposit_pct: 30, installment_duration_months: 24 }
test('installment: only the BALANCE after the deposit is spread over the duration', () => {
  const o = calculateInvestmentCashflow(inv)
  near(o.monthly_debt_service_ngn, (100_000_000 * 0.7) / 24)          // 2,916,667 — not price/24 = 4,166,667
  assert.equal(o.equity_in_ngn, 30_000_000)
  assert.notEqual(Math.round(o.monthly_debt_service_ngn), Math.round(100_000_000 / 24))
})
test('installment: a missing duration yields no invented schedule and is reported by validation', () => {
  const o = calculateInvestmentCashflow({ ...inv, installment_duration_months: undefined })
  assert.equal(o.monthly_debt_service_ngn, 0)
  assert.ok(validateInvestmentInputs({ ...inv, installment_duration_months: undefined }).some(e => /duration/.test(e)))
})
test('investment: negative cash flow gives a not-viable verdict and a DSCR below 1', () => {
  const o = calculateInvestmentCashflow({ ...inv, monthly_rent_ngn: 300_000 })
  assert.ok(o.annual_cashflow_ngn < 0); assert.equal(o.verdict, 'notviable'); assert.ok(o.dscr! < 1)
})
test('investment: missing or zero rent is reported, never defaulted to a made-up rent', () => {
  assert.ok(validateInvestmentInputs({ ...inv, monthly_rent_ngn: 0 }).some(e => /does not assume/.test(e)))
  assert.ok(validateInvestmentInputs({ ...inv, monthly_rent_ngn: undefined }).length)
  assert.ok(validateInvestmentInputs({ ...inv, vacancy_pct: 150 }).length)
  assert.equal(validateInvestmentInputs(inv).length, 0)
})
test('investment: cash structure carries no debt and mortgage structure uses the deposit once', () => {
  const cash = calculateInvestmentCashflow({ ...inv, financing_structure: 'cash' })
  assert.equal(cash.monthly_debt_service_ngn, 0); assert.equal(cash.dscr, null)
  const m = calculateInvestmentCashflow({ ...inv, financing_structure: 'mortgage', down_payment_pct: 30, interest_rate_pct: 18, loan_term_years: 15 })
  assert.equal(m.equity_in_ngn, 30_000_000)
  near(m.monthly_debt_service_ngn, calculateMortgagePayment(70_000_000, 18, 15))
})

// ── Unit payment plan (real schema: deposit_pct + installment_months) ──────
test('unit plan: a 0% deposit is valid (the old truthiness check rejected it)', () => {
  const p = calculateUnitPaymentPlan({ price_ngn: 60_000_000, deposit_pct: 0, installment_months: 12 })!
  assert.equal(p.deposit_ngn, 0); assert.equal(p.balance_ngn, 60_000_000); near(p.monthly_installment_ngn, 5_000_000)
})
test('unit plan: invalid or missing inputs are not calculated', () => {
  assert.equal(calculateUnitPaymentPlan({ price_ngn: 60e6, deposit_pct: 30, installment_months: 0 }), null)
  assert.equal(calculateUnitPaymentPlan({ price_ngn: 60e6, deposit_pct: 130, installment_months: 12 }), null)
  assert.equal(calculateUnitPaymentPlan({ price_ngn: 60e6, deposit_pct: -5, installment_months: 12 }), null)
  assert.equal(calculateUnitPaymentPlan({ price_ngn: 0, deposit_pct: 30, installment_months: 12 }), null)
  assert.equal(calculateUnitPaymentPlan({ price_ngn: NaN, deposit_pct: 30, installment_months: 12 }), null)
  assert.equal(calculateUnitPaymentPlan({ price_ngn: 60e6, deposit_pct: undefined as any, installment_months: 12 }), null)
})
test('unit plan: normal case', () => {
  const p = calculateUnitPaymentPlan({ price_ngn: 100_000_000, deposit_pct: 30, installment_months: 24 })!
  assert.equal(p.deposit_ngn, 30_000_000); assert.equal(p.balance_ngn, 70_000_000); near(p.monthly_installment_ngn, 70_000_000 / 24)
})
test('The Lavender case: a 30% deposit with no recorded schedule shows the confirmation line and NO monthly figure', () => {
  const t = describeUnitPaymentTerms({ price_ngn: 85_000_000, deposit_pct: 30, installment_months: null })
  assert.equal(t.kind, 'terms_recorded_schedule_unconfirmed')
  assert.equal(t.headline, PAYMENT_TERMS_CONFIRMATION_LINE)
  assert.equal(t.headline, 'Payment terms recorded; detailed schedule requires confirmation.')
  assert.equal(t.plan, null)
  near(t.deposit_ngn!, 25_500_000)
  assert.doesNotMatch(`${t.detail}`, /per month|a month|monthly/i)
})
test('a recorded duration is only ever an INDICATIVE equal-instalment illustration', () => {
  const t = describeUnitPaymentTerms({ price_ngn: 100_000_000, deposit_pct: 30, installment_months: 24 })
  assert.equal(t.kind, 'indicative_equal_installments')
  assert.match(t.headline, /^Indicative/)
  assert.ok(t.caveats.some(c => /developer has not confirmed/.test(c)))
})
test('no payment terms at all says so; 0% deposit with a duration still illustrates', () => {
  assert.equal(describeUnitPaymentTerms({ price_ngn: 50e6 }).kind, 'none_recorded')
  assert.equal(describeUnitPaymentTerms({ price_ngn: 60e6, deposit_pct: 0, installment_months: 12 }).kind, 'indicative_equal_installments')
})

// ── Saving a scenario ──────────────────────────────────────────────────────
const goodSave = { analysis_type: 'buyer_affordability', property_id: null, inputs: { a: 1 }, outputs: { b: 2 } }
test('save validation: type whitelist, object payloads, valid ids and no NaN in the stored numbers', () => {
  assert.equal(validateAnalysisSave(goodSave).ok, true)
  assert.equal(validateAnalysisSave({ ...goodSave, analysis_type: 'lender_decision' }).ok, false)
  assert.equal(validateAnalysisSave({ ...goodSave, inputs: 'x' }).ok, false)
  assert.equal(validateAnalysisSave({ ...goodSave, property_id: 'not-a-uuid' }).ok, false)
  assert.equal(validateAnalysisSave({ ...goodSave, outputs: { ltv: NaN } }).ok, false)
  assert.equal(validateAnalysisSave(null).ok, false)
})
test('save validation never accepts an owner from the body (user_id is set server-side from the token)', () => {
  const v = validateAnalysisSave({ ...goodSave, user_id: 'someone-else' })
  assert.equal(v.ok, true); assert.equal('user_id' in (v.value as object), false)
})
test('database failures are explained, not hidden, with the raw code kept', () => {
  assert.match(describeSaveFailure({ code: 'PGRST204', message: "Could not find the 'user_id' column of 'finance_analyses' in the schema cache" }), /missing a column.*phase16_verify/)
  assert.match(describeSaveFailure({ code: '42501', message: 'new row violates row-level security policy' }), /row-level security/)
  assert.match(describeSaveFailure({ code: '23514', message: 'check constraint' }), /not allowed/)
  assert.match(describeSaveFailure({ code: 'XX000', message: 'boom' }), /boom \[XX000\]/)
})
test('the request note carries the declared figures when the scenario could not be saved', () => {
  const s = summariseAffordability({ property_price_ngn: 100e6, deposit_available_ngn: 30e6, interest_rate_pct: 18, loan_tenor_years: 15 }, { mortgage_requirement_ngn: 70e6, ltv_pct: 70, indicative_monthly_repayment_ngn: 1_128_000 })
  assert.match(s, /Price ₦100,000,000/); assert.match(s, /LTV 70%/); assert.match(s, /rate assumed 18%/)
})
