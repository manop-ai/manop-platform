// lib/construction-appraisal.ts
//
// The residual land value calculation, built from the model in
// MANOP_Site_Appraisal_Calculator.xlsx. Pure functions — no I/O —
// so the API route can call this and store the result, and any
// future consumer (e.g. a batch recompute job) can reuse it without
// duplicating the formula.
//
// VIABILITY THRESHOLDS ARE ILLUSTRATIVE DEFAULTS. The source
// spreadsheet doesn't specify exact tier boundaries anywhere — only
// six example outcomes. These are reasonable round numbers chosen to
// roughly match those examples, not a recovered "true" formula.
// Expect to adjust them as MANOP accumulates real deal outcomes.
//
// LANGUAGE NOTE: this keeps "Recommendation"-style output (Strong /
// Viable / Thin margin / Renegotiate / Reject) deliberately, per
// Joel's explicit decision — this is the developer's own tool,
// computed from inputs THEY entered, not a MANOP claim about the
// site. That's a different situation from the evidence-ledger
// language rules elsewhere in this codebase, which govern MANOP's
// own assertions about a site's evidence and review status.

export interface UnitMixRow {
  label: string
  units: number
  sale_price_ngn: number
  build_area_sqm: number
}

export interface AppraisalInputs {
  landowner_asking_price_ngn: number | null
  landowner_jv_expectation_pct: number | null
  unit_mix: UnitMixRow[]
  build_cost_per_sqm_ngn: number
  other_development_costs_ngn: number
  contingency_pct: number
  debt_funding_pct: number
  interest_rate_pct: number
  loan_period_months: number
  developer_profit_target_pct: number
  sales_downside_pct: number
  cost_upside_pct: number
}

export interface AppraisalOutputs {
  gross_development_value_ngn: number
  gross_floor_area_sqm: number
  construction_cost_ngn: number
  contingency_amount_ngn: number
  finance_cost_ngn: number
  developer_profit_allowance_ngn: number
  total_costs_excl_land_ngn: number
  residual_land_value_ngn: number
  residual_margin_pct: number | null
  landowner_jv_expectation_value_ngn: number | null
  viability_label: string
  sensitivity_results: { scenario: string; residual_land_value_ngn: number; margin_pct: number | null; viability_label: string }[]
}

export function getViabilityLabel(marginPct: number | null): string {
  if (marginPct == null) return 'Not calculated — no asking price entered'
  if (marginPct >= 0.10) return 'Strong candidate'
  if (marginPct >= 0) return 'Viable — check risks'
  if (marginPct >= -0.20) return 'Thin margin'
  if (marginPct >= -0.80) return 'Renegotiate'
  return 'Reject / not viable'
}

// Core calculation, parameterized by two sensitivity multipliers so
// the same function computes the base case AND every scenario in the
// sensitivity table — one formula, not six copies of it.
function calculate(
  inputs: AppraisalInputs,
  salesMultiplier: number,
  costMultiplier: number,
): { gdv: number; gfa: number; constructionCost: number; contingency: number; finance: number; profit: number; totalCosts: number; rlv: number; margin: number | null } {
  const gdv = inputs.unit_mix.reduce((sum, row) => sum + row.units * row.sale_price_ngn, 0) * salesMultiplier
  const gfa = inputs.unit_mix.reduce((sum, row) => sum + row.units * row.build_area_sqm, 0)

  const constructionCost = inputs.build_cost_per_sqm_ngn * gfa * costMultiplier
  const contingency = (inputs.contingency_pct / 100) * constructionCost
  const otherCosts = inputs.other_development_costs_ngn * costMultiplier

  // Assumes average 50% drawdown of the debt facility over the loan
  // period — matches the source spreadsheet's own stated assumption.
  const debtAmount = (inputs.debt_funding_pct / 100) * (constructionCost + contingency + otherCosts)
  const finance = (inputs.interest_rate_pct / 100) * debtAmount * (inputs.loan_period_months / 12) * 0.5

  const profit = (inputs.developer_profit_target_pct / 100) * gdv

  const totalCosts = constructionCost + contingency + otherCosts + finance + profit
  const rlv = gdv - totalCosts

  const margin = inputs.landowner_asking_price_ngn
    ? (rlv - inputs.landowner_asking_price_ngn) / inputs.landowner_asking_price_ngn
    : null

  return { gdv, gfa, constructionCost, contingency, finance, profit, totalCosts, rlv, margin }
}

export function computeAppraisal(inputs: AppraisalInputs): AppraisalOutputs {
  const base = calculate(inputs, 1, 1)
  const salesDown = calculate(inputs, 1 - inputs.sales_downside_pct / 100, 1)
  const costsUp = calculate(inputs, 1, 1 + inputs.cost_upside_pct / 100)
  const both = calculate(inputs, 1 - inputs.sales_downside_pct / 100, 1 + inputs.cost_upside_pct / 100)
  const salesUp = calculate(inputs, 1 + inputs.sales_downside_pct / 100, 1)
  const costsDown = calculate(inputs, 1, 1 - inputs.cost_upside_pct / 100)

  const jvValue = inputs.landowner_jv_expectation_pct != null
    ? (inputs.landowner_jv_expectation_pct / 100) * base.gdv
    : null

  return {
    gross_development_value_ngn: base.gdv,
    gross_floor_area_sqm: base.gfa,
    construction_cost_ngn: base.constructionCost,
    contingency_amount_ngn: base.contingency,
    finance_cost_ngn: base.finance,
    developer_profit_allowance_ngn: base.profit,
    total_costs_excl_land_ngn: base.totalCosts,
    residual_land_value_ngn: base.rlv,
    residual_margin_pct: base.margin,
    landowner_jv_expectation_value_ngn: jvValue,
    viability_label: getViabilityLabel(base.margin),
    sensitivity_results: [
      { scenario: 'Base Case', residual_land_value_ngn: base.rlv, margin_pct: base.margin, viability_label: getViabilityLabel(base.margin) },
      { scenario: `Sales Down ${inputs.sales_downside_pct}%`, residual_land_value_ngn: salesDown.rlv, margin_pct: salesDown.margin, viability_label: getViabilityLabel(salesDown.margin) },
      { scenario: `Costs Up ${inputs.cost_upside_pct}%`, residual_land_value_ngn: costsUp.rlv, margin_pct: costsUp.margin, viability_label: getViabilityLabel(costsUp.margin) },
      { scenario: 'Sales Down + Costs Up', residual_land_value_ngn: both.rlv, margin_pct: both.margin, viability_label: getViabilityLabel(both.margin) },
      { scenario: `Sales Up ${inputs.sales_downside_pct}%`, residual_land_value_ngn: salesUp.rlv, margin_pct: salesUp.margin, viability_label: getViabilityLabel(salesUp.margin) },
      { scenario: `Costs Down ${inputs.cost_upside_pct}%`, residual_land_value_ngn: costsDown.rlv, margin_pct: costsDown.margin, viability_label: getViabilityLabel(costsDown.margin) },
    ],
  }
}