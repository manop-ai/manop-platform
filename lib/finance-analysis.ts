// lib/finance-analysis.ts
//
// One validated shape for saving a finance scenario (Buyer Affordability, Investment Intelligence, Payment Plan,
// Development Finance), used by POST /api/finance-analyses. Pure functions: no I/O.
//
// WHY THIS EXISTS. Scenarios used to be written straight from the browser with sb.from('finance_analyses').insert(...)
// in three places (FinancingModal, the calculator, and a site route), each swallowing a failure with a generic or
// silent message. The modal even continued to the "confirm" step on failure, so a financing REQUEST could succeed
// while its SCENARIO silently did not save. The real database error (missing column, RLS, bad payload) was never
// shown to anyone. Saving now goes through one server route that returns the exact cause, and the request flow
// records honestly whether the scenario was saved.

export const ANALYSIS_TYPES = ['buyer_affordability', 'investment_intelligence', 'payment_plan', 'development_finance'] as const
export type AnalysisType = typeof ANALYSIS_TYPES[number]

export interface AnalysisSaveInput {
  analysis_type: AnalysisType
  property_id: string | null
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  input_provenance: 'user_stated'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_JSON_CHARS = 60_000

export function validateAnalysisSave(body: any): { ok: boolean; errors: string[]; value: AnalysisSaveInput | null } {
  const errors: string[] = []
  if (!body || typeof body !== 'object') return { ok: false, errors: ['Request body must be an object.'], value: null }
  if (!ANALYSIS_TYPES.includes(body.analysis_type)) errors.push(`analysis_type must be one of: ${ANALYSIS_TYPES.join(', ')}.`)
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v)
  if (!isObj(body.inputs)) errors.push('inputs must be an object.')
  if (!isObj(body.outputs)) errors.push('outputs must be an object.')
  if (body.property_id != null && !(typeof body.property_id === 'string' && UUID.test(body.property_id))) errors.push('property_id must be a valid id or empty.')
  if (errors.length === 0) {
    try {
      if (JSON.stringify(body.inputs).length + JSON.stringify(body.outputs).length > MAX_JSON_CHARS) errors.push('The scenario is too large to save.')
    } catch { errors.push('The scenario could not be read.') }
  }
  // A non-finite number in the outputs means the calculation was not valid; saving it would store a broken record.
  const hasBadNumber = (v: unknown): boolean => {
    if (typeof v === 'number') return !Number.isFinite(v)
    if (Array.isArray(v)) return v.some(hasBadNumber)
    if (v && typeof v === 'object') return Object.values(v as object).some(hasBadNumber)
    return false
  }
  if (errors.length === 0 && (hasBadNumber(body.inputs) || hasBadNumber(body.outputs))) errors.push('The scenario contains a number that is not valid (NaN or infinite); it was not saved.')
  if (errors.length) return { ok: false, errors, value: null }
  return {
    ok: true, errors: [],
    value: { analysis_type: body.analysis_type, property_id: body.property_id ?? null, inputs: body.inputs, outputs: body.outputs, input_provenance: 'user_stated' },
  }
}

// Turn a database error into words a person (and Joel, reading the screen) can act on. The raw code is kept so
// the cause is never hidden.
export function describeSaveFailure(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return 'Unknown error.'
  const code = e.code || ''
  const msg = e.message || ''
  if (code === '42703' || code === 'PGRST204' || /column .*(does not exist|schema cache)|could not find the .* column/i.test(msg))
    return `The finance_analyses table is missing a column this save needs (${msg}). Run sql/phase16_verify.sql block 3 and send the result.`
  if (code === '42P01' || code === 'PGRST205') return 'The finance_analyses table was not found in this database.'
  if (code === '42501' || /row-level security/i.test(msg)) return `The database refused this save under its row-level security rules (${msg}).`
  if (code === '23514') return `The database rejected a value as not allowed (${msg}).`
  if (code === '23502') return `A required column was empty (${msg}).`
  return `${msg || 'The save failed.'}${code ? ` [${code}]` : ''}`
}

// Compact text for a request or note, so an admin still has the scenario in front of them if the analysis row could
// not be saved. Built only from the user's own numbers; nothing is added.
export function summariseAffordability(inputs: Record<string, any>, outputs: Record<string, any>): string {
  const n = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? `₦${Math.round(v).toLocaleString('en-NG')}` : 'n/a')
  const p = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? `${Number(v.toFixed(1))}%` : 'n/a')
  return [
    `Price ${n(inputs.property_price_ngn)}`, `deposit ${n(inputs.deposit_available_ngn)}`,
    `rate assumed ${p(inputs.interest_rate_pct)}`, `tenor ${inputs.loan_tenor_years ?? 'n/a'} years`,
    `balance ${n(outputs.mortgage_requirement_ngn)}`, `LTV ${p(outputs.ltv_pct)}`, `indicative monthly ${n(outputs.indicative_monthly_repayment_ngn)}`,
  ].join(', ')
}