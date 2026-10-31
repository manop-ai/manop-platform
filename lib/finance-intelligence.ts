// lib/finance-intelligence.ts
//
// Shared MANOP Finance Intelligence calculation engine. Pure functions,
// no I/O — same pattern as lib/construction-appraisal.ts, so API routes
// can call these and persist the result, and any future consumer (batch
// recompute, reports) reuses them without duplicating a formula.
//
// PROVENANCE: calculateMortgagePayment and the Investment Intelligence
// yield/cash-on-cash math below are lifted verbatim from
// app/calculator/page.tsx (previously "Deal Analyzer" / calcMortgageMonthly
// and the inline analyze() calculations) — not rewritten. Per Joel's
// instruction, tested behaviour is preserved; app/calculator/page.tsx
// should be migrated to import from here rather than keep a private copy,
// as part of Phase 3 (Investment Intelligence persistence).
//
// EVIDENCE: this module does not decide evidence_status or confidence —
// those come from lib/site-intelligence.ts's existing EvidenceStatus and
// Confidence enums, applied by the caller. This module also never emits
// "approved," "qualified," or similar lender-decision language — see
// FinanceSuitabilityLabel below for the only labels this layer is allowed
// to produce.

// ─── Mortgage / repayment math ──────────────────────────────────────────
// Extracted from app/calculator/page.tsx: calcMortgageMonthly. Standard
// amortizing-loan monthly-payment formula. Unchanged.

export function calculateMortgagePayment(
  principal: number,
  annualRatePct: number,
  years: number,
): number {
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0 || n === 0) return n === 0 ? 0 : principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ─── Buyer Affordability (genuinely new — Phase 2) ──────────────────────

export interface AffordabilityInputs {
  property_price_ngn: number
  deposit_available_ngn: number
  fees_ngn: number
  interest_rate_pct: number
  loan_tenor_years: number
}

export interface AffordabilityOutputs {
  required_equity_ngn: number
  mortgage_requirement_ngn: number
  ltv_pct: number
  indicative_monthly_repayment_ngn: number
  total_repayment_ngn: number
  // Cash needed up front: the deposit actually applied to the price PLUS the fees entered. (Capped at the price:
  // a "deposit" above the price used to be counted in full, overstating the cash needed.)
  cash_requirement_ngn: number
  // Added to make the figures separable (older saved analyses simply lack them):
  deposit_applied_ngn?: number        // deposit actually applied to the price
  fees_included_ngn?: number          // fees counted in cash_requirement_ngn
  excess_deposit_ngn?: number         // deposit entered beyond the price (not needed)
  outstanding_balance_ngn?: number    // purchase balance left after the deposit (= mortgage_requirement_ngn here)
  total_interest_ngn?: number         // total_repayment_ngn - mortgage_requirement_ngn
}

// What the affordability figures include and leave out. Shown next to the numbers so they are not read as a quote.
export const AFFORDABILITY_ASSUMPTIONS = [
  'Indicative repayment uses the standard amortising-loan formula on the amount left after your deposit, at the rate and tenor you entered.',
  'Fees: only the fees you entered are counted in the cash needed up front. Legal, valuation, agency, stamp duty, insurance and any lender charges are not added unless you enter them.',
  'The repayment excludes insurance, taxes and other charges, and a variable rate can change it.',
  'This is a preliminary scenario from your own inputs. A lender decides eligibility, the rate and the amount after its own review.',
]

// Returns plain-language problems; an empty list means the inputs can be calculated. NaN, Infinity, negatives,
// a zero price, an impossible rate, a non-positive tenor and a deposit above the price are all rejected.
export function validateAffordabilityInputs(i: Partial<AffordabilityInputs>): string[] {
  const errs: string[] = []
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (!fin(i.property_price_ngn) || i.property_price_ngn <= 0) errs.push('Enter a property price above zero.')
  if (!fin(i.deposit_available_ngn) || i.deposit_available_ngn < 0) errs.push('Deposit cannot be negative.')
  else if (fin(i.property_price_ngn) && i.property_price_ngn > 0 && i.deposit_available_ngn > i.property_price_ngn) errs.push('Deposit cannot be more than the property price.')
  if (!fin(i.fees_ngn) || i.fees_ngn < 0) errs.push('Fees cannot be negative.')
  if (!fin(i.interest_rate_pct) || i.interest_rate_pct < 0 || i.interest_rate_pct > 100) errs.push('Interest rate must be between 0% and 100%.')
  if (!fin(i.loan_tenor_years) || i.loan_tenor_years <= 0 || i.loan_tenor_years > 50) errs.push('Loan tenor must be above 0 and no more than 50 years.')
  return errs
}

export function calculateLTV(propertyPriceNgn: number, mortgageRequirementNgn: number): number {
  if (propertyPriceNgn <= 0) return 0
  return (mortgageRequirementNgn / propertyPriceNgn) * 100
}

export function calculateRequiredEquity(propertyPriceNgn: number, mortgageRequirementNgn: number): number {
  return Math.max(propertyPriceNgn - mortgageRequirementNgn, 0)
}

// Callers should run validateAffordabilityInputs first and show its messages; this function does not guess for bad input.
export function calculateAffordability(inputs: AffordabilityInputs): AffordabilityOutputs {
  const deposit = Math.max(inputs.deposit_available_ngn, 0)
  const depositApplied = Math.min(deposit, Math.max(inputs.property_price_ngn, 0))
  const fees = Math.max(inputs.fees_ngn, 0)
  const mortgageRequirement = Math.max(inputs.property_price_ngn - depositApplied, 0)
  const ltv = calculateLTV(inputs.property_price_ngn, mortgageRequirement)
  const monthlyRepayment = mortgageRequirement === 0
    ? 0
    : calculateMortgagePayment(mortgageRequirement, inputs.interest_rate_pct, inputs.loan_tenor_years)
  const totalRepayment = monthlyRepayment * inputs.loan_tenor_years * 12
  const requiredEquity = calculateRequiredEquity(inputs.property_price_ngn, mortgageRequirement)

  return {
    required_equity_ngn: requiredEquity,
    mortgage_requirement_ngn: mortgageRequirement,
    ltv_pct: ltv,
    indicative_monthly_repayment_ngn: monthlyRepayment,
    total_repayment_ngn: totalRepayment,
    cash_requirement_ngn: depositApplied + fees,
    deposit_applied_ngn: depositApplied,
    fees_included_ngn: fees,
    excess_deposit_ngn: Math.max(deposit - depositApplied, 0),
    outstanding_balance_ngn: mortgageRequirement,
    total_interest_ngn: Math.max(totalRepayment - mortgageRequirement, 0),
  }
}

// Advisor-pack labels only — MANOP analytical language, never a lender
// decision. Never emit "Approved," "Eligible," or "Guaranteed" from this
// function; those only ever come from an actual stored lender decision
// (a future finance_products / lender-decision record), never from this
// calculation layer.
// LABELS DESCRIBE THE CALCULATION, NOT A LENDER OUTCOME. The earlier names ("Mortgage Suitable Candidate",
// "Developer Payment Plan Likely") read as a verdict on the buyer; they are renamed to say what was actually computed.
// The thresholds (50 / 70 / 90 % loan-to-value) are MANOP model assumptions for grouping scenarios, not lender rules
// or universal financial standards, and not advice. Stored analyses written before this rename carry the old strings;
// LEGACY_SUITABILITY_LABELS maps them for display.
export type FinanceSuitabilityLabel =
  | 'Lower loan share indicated: lender review still required'
  | 'Moderate loan share indicated: lender review required'
  | 'High equity contribution indicated'
  | 'Very high loan share indicated: a developer plan or larger deposit may be worth exploring'
  | 'Insufficient information to assess'

export function getFinanceSuitabilityLabel(ltvPct: number | null): FinanceSuitabilityLabel {
  if (ltvPct == null || !Number.isFinite(ltvPct) || ltvPct < 0) return 'Insufficient information to assess'
  if (ltvPct <= 50) return 'Lower loan share indicated: lender review still required'
  if (ltvPct <= 70) return 'Moderate loan share indicated: lender review required'
  if (ltvPct <= 90) return 'High equity contribution indicated'
  return 'Very high loan share indicated: a developer plan or larger deposit may be worth exploring'
}

export const LEGACY_SUITABILITY_LABELS: Record<string, string> = {
  'Mortgage Suitable Candidate': 'Lower loan share indicated: lender review still required',
  'Possible — Lender Review Required': 'Moderate loan share indicated: lender review required',
  'High Equity Required': 'High equity contribution indicated',
  'Developer Payment Plan Likely': 'Very high loan share indicated: a developer plan or larger deposit may be worth exploring',
  'Cash Buyer Likely': 'Insufficient information to assess',
  'Finance Status Unknown': 'Insufficient information to assess',
}

// ─── Investment Intelligence (Phase 3 — math extracted from the existing
// Deal Analyzer's analyze() function, unchanged) ─────────────────────────

export interface InvestmentCashflowInputs {
  purchase_price_ngn: number
  monthly_rent_ngn: number
  vacancy_pct: number
  operating_expenses_pct: number
  financing_structure: 'cash' | 'mortgage' | 'installment'
  down_payment_pct?: number       // required for 'mortgage'
  interest_rate_pct?: number      // required for 'mortgage'
  loan_term_years?: number        // required for 'mortgage'
  installment_deposit_pct?: number // required for 'installment'; Deal Analyzer default is 30
  installment_duration_months?: number // required for 'installment'
}

export interface InvestmentCashflowOutputs {
  annual_gross_rent_ngn: number
  effective_rent_ngn: number
  net_operating_income_ngn: number
  gross_yield_pct: number
  cap_rate_pct: number
  annual_debt_service_ngn: number
  monthly_debt_service_ngn: number
  annual_cashflow_ngn: number
  monthly_cashflow_ngn: number
  cash_on_cash_pct: number
  equity_in_ngn: number
  dscr: number | null
  verdict: 'viable' | 'borderline' | 'notviable'
}

// Same thresholds as the existing getVerdict() in app/calculator/page.tsx —
// unchanged so historical analyses don't reclassify on migration.
export function getInvestmentVerdict(cashflow: number, cashOnCashPct: number, grossYieldPct: number): 'viable' | 'borderline' | 'notviable' {
  if (grossYieldPct >= 6 && cashOnCashPct >= 5 && cashflow > 0) return 'viable'
  if (grossYieldPct >= 4 && cashflow > 0) return 'borderline'
  return 'notviable'
}

export function calculateInvestmentCashflow(inputs: InvestmentCashflowInputs): InvestmentCashflowOutputs {
  const annualGross = inputs.monthly_rent_ngn * 12
  const effective = annualGross * (1 - inputs.vacancy_pct / 100)
  const noi = effective * (1 - inputs.operating_expenses_pct / 100)
  const grossYield = (annualGross / inputs.purchase_price_ngn) * 100
  const capRate = (noi / inputs.purchase_price_ngn) * 100

  let monthlyDebt = 0
  let equityIn = inputs.purchase_price_ngn

  if (inputs.financing_structure === 'mortgage') {
    const downPct = inputs.down_payment_pct ?? 0
    const loanAmount = inputs.purchase_price_ngn * (1 - downPct / 100)
    monthlyDebt = calculateMortgagePayment(loanAmount, inputs.interest_rate_pct ?? 0, inputs.loan_term_years ?? 0)
    equityIn = inputs.purchase_price_ngn * (downPct / 100)
  } else if (inputs.financing_structure === 'installment') {
    // FIX: this used to divide the FULL price by the duration while also counting the deposit as equity, so the
    // deposit was paid twice in the model (once up front, once inside every instalment). Only the balance after
    // the deposit is spread over the duration. Whether a developer really spreads the balance equally is NOT
    // known from the data; this is an indicative model, and callers must say so.
    // A missing duration used to default to ONE month (debt = the whole price); it now yields no instalment and
    // validateInvestmentInputs() reports it, rather than inventing a schedule.
    const durationMonths = inputs.installment_duration_months ?? 0
    const depositPct = inputs.installment_deposit_pct ?? 30
    const balance = inputs.purchase_price_ngn * (1 - depositPct / 100)
    monthlyDebt = durationMonths > 0 ? balance / durationMonths : 0
    equityIn = inputs.purchase_price_ngn * (depositPct / 100)
  } else {
    monthlyDebt = 0
    equityIn = inputs.purchase_price_ngn
  }

  const annualDebt = monthlyDebt * 12
  const annualCashflow = noi - annualDebt
  const cashOnCash = equityIn > 0 ? (annualCashflow / equityIn) * 100 : 0
  const dscr = annualDebt > 0 ? noi / annualDebt : null
  const verdict = getInvestmentVerdict(annualCashflow, cashOnCash, grossYield)

  return {
    annual_gross_rent_ngn: annualGross,
    effective_rent_ngn: effective,
    net_operating_income_ngn: noi,
    gross_yield_pct: grossYield,
    cap_rate_pct: capRate,
    annual_debt_service_ngn: annualDebt,
    monthly_debt_service_ngn: monthlyDebt,
    annual_cashflow_ngn: annualCashflow,
    monthly_cashflow_ngn: annualCashflow / 12,
    cash_on_cash_pct: cashOnCash,
    equity_in_ngn: equityIn,
    dscr,
    verdict,
  }
}

// Plain-language problems with an investment scenario. No rental value, vacancy or expense is ever invented:
// a missing or non-positive rent is reported, not defaulted.
export function validateInvestmentInputs(i: Partial<InvestmentCashflowInputs>): string[] {
  const errs: string[] = []
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (!fin(i.purchase_price_ngn) || i.purchase_price_ngn <= 0) errs.push('Enter a purchase price above zero.')
  if (!fin(i.monthly_rent_ngn) || i.monthly_rent_ngn <= 0) errs.push('Enter the expected monthly rent: MANOP does not assume one.')
  if (!fin(i.vacancy_pct) || i.vacancy_pct < 0 || i.vacancy_pct > 100) errs.push('Vacancy must be between 0% and 100%.')
  if (!fin(i.operating_expenses_pct) || i.operating_expenses_pct < 0 || i.operating_expenses_pct > 100) errs.push('Operating expenses must be between 0% and 100% of rent.')
  if (i.financing_structure === 'mortgage') {
    if (!fin(i.down_payment_pct) || i.down_payment_pct < 0 || i.down_payment_pct > 100) errs.push('Down payment must be between 0% and 100%.')
    if (!fin(i.interest_rate_pct) || i.interest_rate_pct < 0 || i.interest_rate_pct > 100) errs.push('Interest rate must be between 0% and 100%.')
    if (!fin(i.loan_term_years) || i.loan_term_years <= 0 || i.loan_term_years > 50) errs.push('Loan term must be above 0 and no more than 50 years.')
  } else if (i.financing_structure === 'installment') {
    if (!fin(i.installment_deposit_pct) || i.installment_deposit_pct < 0 || i.installment_deposit_pct > 100) errs.push('Installment deposit must be between 0% and 100%.')
    if (!fin(i.installment_duration_months) || i.installment_duration_months <= 0) errs.push('Enter the installment duration in months: MANOP does not assume one.')
  }
  return errs
}

export const INVESTMENT_VERDICT_NOTE =
  'The viable / borderline / not-viable bands (gross yield 6% and 4%, cash-on-cash 5%, positive cash flow) are MANOP model assumptions for sorting scenarios. They are not market standards, a forecast or investment advice. Change the assumptions and the result changes.'

// DSCR interpretation bands from the advisor pack — explicitly treated as
// assumptions requiring validation, not universal financial truth. Do not
// auto-convert to a hard "good/bad" rating; the caller decides how much
// weight to give this alongside cap rate / cash-on-cash for the same deal.
export function describeDSCR(dscr: number | null): string {
  if (dscr == null) return 'Not applicable — no debt service in this structure'
  if (dscr >= 1.3) return 'Strong rental cover'
  if (dscr >= 1.0) return 'Thin but covered'
  return 'Buyer funds shortfall — estimated rental income may not fully cover repayments'
}

// ─── Payment Plan Intelligence, real schema (Phase 4, 2026-10-03) ───────
// The Reviewed Developments payment-plan schema is now confirmed by
// reading developer_unit_types directly (see app/development/[id]/page.tsx's
// own query and app/agency/developments/page.tsx's bulk-upload form): it
// is exactly two columns — deposit_pct and installment_months — not the
// richer reservation-fee/frequency/completion-balance shape speculated
// below under PaymentPlanInputs. That richer shape stays as a target for
// if/when developers start entering more granular plan data; it is not
// wired to anything because that data doesn't exist yet. This function
// is the one that actually runs today, against what's actually stored.

export interface UnitPaymentPlanInputs {
  price_ngn: number
  deposit_pct: number           // developer_unit_types.deposit_pct
  installment_months: number    // developer_unit_types.installment_months
}

export interface UnitPaymentPlanOutputs {
  deposit_ngn: number
  balance_ngn: number
  monthly_installment_ngn: number
  installment_months: number
  payment_pressure: 'Low' | 'Medium' | 'High'
}

export function calculateUnitPaymentPlan(inputs: UnitPaymentPlanInputs): UnitPaymentPlanOutputs | null {
  // Validate explicitly instead of by truthiness: a 0% deposit is a valid plan (the old `!deposit_pct` test rejected it),
  // while a missing, negative, non-finite or >100% value, or a missing/zero duration, is not calculable.
  const fin = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  if (!fin(inputs.price_ngn) || inputs.price_ngn <= 0) return null
  if (!fin(inputs.deposit_pct) || inputs.deposit_pct < 0 || inputs.deposit_pct > 100) return null
  if (!fin(inputs.installment_months) || inputs.installment_months <= 0) return null
  const deposit = inputs.price_ngn * (inputs.deposit_pct / 100)
  const balance = Math.max(inputs.price_ngn - deposit, 0)
  const monthly = balance / inputs.installment_months

  // Same rough-indicator methodology/thresholds as calculatePaymentPlanBurden
  // below, applied to the data that's actually available. Flagged there
  // as needing validation against real buyer income-band data before
  // Phase 4 treats it as more than an indicator — same caveat applies here.
  const pressure: UnitPaymentPlanOutputs['payment_pressure'] =
    monthly > inputs.price_ngn * 0.03 ? 'High' :
    monthly > inputs.price_ngn * 0.015 ? 'Medium' : 'Low'

  return {
    deposit_ngn: deposit,
    balance_ngn: balance,
    monthly_installment_ngn: monthly,
    installment_months: inputs.installment_months,
    payment_pressure: pressure,
  }
}

// What may honestly be SHOWN to a buyer for a unit's payment terms. The schema holds only deposit_pct and
// installment_months; nothing records whether the balance really is equal monthly instalments, or who confirmed
// the terms. So:
//   - nothing recorded            -> say so, ask the developer;
//   - deposit only                -> "Payment terms recorded; detailed schedule requires confirmation." (e.g. a
//                                    deposit with a milestone-based balance: NO monthly figure is invented);
//   - deposit + months            -> an INDICATIVE equal-instalment illustration, clearly labelled as such.
// Official terms change only through the developer/admin process (see sql/phase18 proposal), never because a
// buyer edited a calculator input.
export type PaymentTermsKind = 'none_recorded' | 'terms_recorded_schedule_unconfirmed' | 'indicative_equal_installments'
export type PaymentTermsStatus = 'developer_provided' | 'manop_reviewed' | 'awaiting_confirmation'

export interface PaymentTermsDescription {
  kind: PaymentTermsKind
  headline: string
  detail: string | null
  deposit_ngn: number | null
  plan: UnitPaymentPlanOutputs | null
  caveats: string[]
}

export const PAYMENT_TERMS_CONFIRMATION_LINE = 'Payment terms recorded; detailed schedule requires confirmation.'

export function describeUnitPaymentTerms(u: {
  price_ngn?: number | null
  deposit_pct?: number | null
  installment_months?: number | null
  terms_status?: PaymentTermsStatus | null
}): PaymentTermsDescription {
  const has = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  const price = has(u.price_ngn) && u.price_ngn > 0 ? u.price_ngn : null
  const depositPct = has(u.deposit_pct) && u.deposit_pct >= 0 && u.deposit_pct <= 100 ? u.deposit_pct : null
  const months = has(u.installment_months) && u.installment_months > 0 ? u.installment_months : null
  const caveats: string[] = ['The developer must confirm its payment terms before you rely on them.']
  if (u.terms_status === 'awaiting_confirmation') caveats.push('MANOP has asked the developer to confirm these terms.')
  if (u.terms_status === 'developer_provided') caveats.push('Terms as provided by the developer.')
  if (u.terms_status === 'manop_reviewed') caveats.push('Terms reviewed by MANOP against developer-supplied documents.')

  if (depositPct == null && months == null) {
    return { kind: 'none_recorded', headline: 'No payment terms recorded for this unit.', detail: 'Ask the developer through MANOP what deposit and payment structure applies.', deposit_ngn: null, plan: null, caveats }
  }
  const depositNgn = price != null && depositPct != null ? price * (depositPct / 100) : null
  if (depositPct != null && months == null) {
    return {
      kind: 'terms_recorded_schedule_unconfirmed',
      headline: PAYMENT_TERMS_CONFIRMATION_LINE,
      detail: `${depositPct}% deposit recorded${depositNgn != null ? ` (about ₦${Math.round(depositNgn).toLocaleString('en-NG')})` : ''}. The structure of the balance has not been recorded, so no instalment schedule is shown.`,
      deposit_ngn: depositNgn, plan: null, caveats,
    }
  }
  const plan = price != null && depositPct != null && months != null
    ? calculateUnitPaymentPlan({ price_ngn: price, deposit_pct: depositPct, installment_months: months }) : null
  if (!plan) {
    return { kind: 'terms_recorded_schedule_unconfirmed', headline: PAYMENT_TERMS_CONFIRMATION_LINE, detail: 'A deposit or duration is recorded but the figures cannot be calculated from what is on file.', deposit_ngn: depositNgn, plan: null, caveats }
  }
  caveats.unshift(`Indicative only: this spreads the balance equally over ${months} months. The developer has not confirmed that this is the payment schedule.`)
  return {
    kind: 'indicative_equal_installments',
    headline: `Indicative: ${depositPct}% deposit, then the balance spread over ${months} months`,
    detail: `Deposit about ₦${Math.round(plan.deposit_ngn).toLocaleString('en-NG')}; balance ₦${Math.round(plan.balance_ngn).toLocaleString('en-NG')}; about ₦${Math.round(plan.monthly_installment_ngn).toLocaleString('en-NG')} a month if spread equally.`,
    deposit_ngn: plan.deposit_ngn, plan, caveats,
  }
}

// ─── Payment Plan Intelligence, richer target shape (aspirational) ─────
// Depends on a reservation-fee/frequency/completion-balance payment-plan
// schema that does NOT exist in developer_unit_types today — confirmed,
// not assumed, by reading the actual table and its only two consumers
// (the Reviewed Development detail page and the agency bulk-upload
// form). Kept here as a target signature for if that data model grows;
// not wired to anything until it does. Use calculateUnitPaymentPlan
// above for what can actually run against today's schema.

export interface PaymentPlanInputs {
  price_ngn: number
  reservation_fee_ngn: number
  initial_deposit_ngn: number
  instalment_amount_ngn: number
  instalment_frequency_months: number
  number_of_instalments: number
  completion_balance_ngn: number
}

export interface PaymentPlanOutputs {
  initial_cash_requirement_ngn: number
  periodic_cash_burden_ngn: number
  total_buyer_cash_requirement_ngn: number
  completion_cash_requirement_ngn: number
  payment_pressure: 'Low' | 'Medium' | 'High'
}

export function calculatePaymentPlanBurden(inputs: PaymentPlanInputs): PaymentPlanOutputs {
  const initialCash = inputs.reservation_fee_ngn + inputs.initial_deposit_ngn
  const totalInstalments = inputs.instalment_amount_ngn * inputs.number_of_instalments
  const totalCash = initialCash + totalInstalments + inputs.completion_balance_ngn

  // Placeholder methodology — Phase 4 should validate this against real
  // buyer income-band data before it's shown to users as more than a
  // rough indicator. Do not treat this threshold as authoritative.
  const monthlyEquivalent = inputs.instalment_amount_ngn / inputs.instalment_frequency_months
  const pressure: PaymentPlanOutputs['payment_pressure'] =
    monthlyEquivalent > inputs.price_ngn * 0.03 ? 'High' :
    monthlyEquivalent > inputs.price_ngn * 0.015 ? 'Medium' : 'Low'

  return {
    initial_cash_requirement_ngn: initialCash,
    periodic_cash_burden_ngn: inputs.instalment_amount_ngn,
    total_buyer_cash_requirement_ngn: totalCash,
    completion_cash_requirement_ngn: inputs.completion_balance_ngn,
    payment_pressure: pressure,
  }
}