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
  cash_requirement_ngn: number
}

export function calculateLTV(propertyPriceNgn: number, mortgageRequirementNgn: number): number {
  if (propertyPriceNgn <= 0) return 0
  return (mortgageRequirementNgn / propertyPriceNgn) * 100
}

export function calculateRequiredEquity(propertyPriceNgn: number, mortgageRequirementNgn: number): number {
  return Math.max(propertyPriceNgn - mortgageRequirementNgn, 0)
}

export function calculateAffordability(inputs: AffordabilityInputs): AffordabilityOutputs {
  const mortgageRequirement = Math.max(inputs.property_price_ngn - inputs.deposit_available_ngn, 0)
  const ltv = calculateLTV(inputs.property_price_ngn, mortgageRequirement)
  const monthlyRepayment = calculateMortgagePayment(mortgageRequirement, inputs.interest_rate_pct, inputs.loan_tenor_years)
  const totalRepayment = monthlyRepayment * inputs.loan_tenor_years * 12
  const requiredEquity = calculateRequiredEquity(inputs.property_price_ngn, mortgageRequirement)

  return {
    required_equity_ngn: requiredEquity,
    mortgage_requirement_ngn: mortgageRequirement,
    ltv_pct: ltv,
    indicative_monthly_repayment_ngn: monthlyRepayment,
    total_repayment_ngn: totalRepayment,
    cash_requirement_ngn: inputs.deposit_available_ngn + inputs.fees_ngn,
  }
}

// Advisor-pack labels only — MANOP analytical language, never a lender
// decision. Never emit "Approved," "Eligible," or "Guaranteed" from this
// function; those only ever come from an actual stored lender decision
// (a future finance_products / lender-decision record), never from this
// calculation layer.
export type FinanceSuitabilityLabel =
  | 'Mortgage Suitable Candidate'
  | 'Possible — Lender Review Required'
  | 'High Equity Required'
  | 'Developer Payment Plan Likely'
  | 'Cash Buyer Likely'
  | 'Finance Status Unknown'

export function getFinanceSuitabilityLabel(ltvPct: number | null): FinanceSuitabilityLabel {
  if (ltvPct == null) return 'Finance Status Unknown'
  if (ltvPct <= 50) return 'Mortgage Suitable Candidate'
  if (ltvPct <= 70) return 'Possible — Lender Review Required'
  if (ltvPct <= 90) return 'High Equity Required'
  return 'Developer Payment Plan Likely'
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
    const durationMonths = inputs.installment_duration_months ?? 1
    monthlyDebt = inputs.purchase_price_ngn / durationMonths
    const depositPct = inputs.installment_deposit_pct ?? 30
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

// ─── Payment Plan Intelligence (genuinely new — Phase 4) ────────────────
// Depends on the Reviewed Developments payment-plan schema, which this
// audit did not find yet. Shaped here so Phase 4 has a target signature;
// do not wire this up until that schema is confirmed with the Reviewed
// Developments / User Platform track.

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