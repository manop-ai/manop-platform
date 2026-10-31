// lib/finance-products.ts
//
// PHASE 8 / 17 — Mortgage / Product Intelligence. Pure functions, no I/O — same pattern as
// lib/finance-intelligence.ts and lib/construction-appraisal.ts, so an API route, the admin UI,
// FinancingModal and any future consumer all reuse the same logic.
//
// WHAT THIS IS NOT: a lending decision. This module never emits "Approved", "Pre-qualified" or
// "Eligible". A ProductMatch says a buyer's own numbers meet the PUBLISHED criteria MANOP has recorded
// and checked, as of the date MANOP last verified them. The lender still underwrites and decides.
//
// THREE DISTINCT OUTCOMES FOR EVERY CRITERION (CriterionCheck):
//   met      - the buyer's input satisfies a criterion MANOP has recorded
//   not_met  - the buyer's input breaks a criterion MANOP has recorded (a confirmed mismatch)
//   unknown  - it could not be assessed: either the buyer has not supplied the input
//              (reason 'buyer_input') or MANOP has not recorded the criterion (reason 'product_record').
// "Not recorded" is never treated as "no restriction".
//
// FRESHNESS: 180 days is MANOP's own re-verification policy, not a lender expiry date. A verification date
// that is missing, unparseable or in the future is treated as NOT current (the old check let an invalid date
// through because NaN > threshold is false).

export type FinanceProductType = 'mortgage' | 'nhf' | 'diaspora_remittance' | 'developer_plan'
export const PRODUCT_TYPES: FinanceProductType[] = ['mortgage', 'nhf', 'diaspora_remittance', 'developer_plan']

// Where the information came from. NOT the same as "a source URL exists".
export type VerificationStatus = 'researched_public' | 'third_party' | 'provider_confirmed' | 'awaiting_confirmation'
export const VERIFICATION_STATUSES: VerificationStatus[] = ['researched_public', 'third_party', 'provider_confirmed', 'awaiting_confirmation']
export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  researched_public: 'Researched from a public source',
  third_party: 'Recorded from a third-party source',
  provider_confirmed: 'Confirmed directly by the provider',
  awaiting_confirmation: 'Awaiting confirmation (not used for matching)',
}

export type CoverageScope = 'nationwide' | 'cities' | 'unknown'
export type RateType = 'fixed' | 'variable' | 'unknown'

export interface FinanceProduct {
  id: string
  lender_name: string
  product_name: string
  product_type: FinanceProductType
  country_code: string
  cities_covered: string[]
  min_rate_pct: number | null
  max_rate_pct: number | null
  max_ltv_pct: number | null
  min_tenor_years: number | null
  max_tenor_years: number | null
  min_monthly_income_ngn: number | null
  eligibility_notes: string | null
  source_name: string
  source_url: string | null
  last_verified_at: string
  status: 'active' | 'withdrawn'
  created_at: string
  updated_at: string

  // ── Added by sql/phase17_finance_product_register.sql. All optional: rows created before it have none. ──
  currency_code?: string | null
  description?: string | null
  application_channel?: string | null
  coverage_scope?: CoverageScope | null
  min_loan_amount_ngn?: number | null
  max_loan_amount_ngn?: number | null
  rate_type?: RateType | null
  min_deposit_pct?: number | null
  fees_notes?: string | null
  repayment_structure?: string | null
  allowed_residency?: string[] | null      // e.g. ['resident','diaspora']; null = not recorded
  allowed_employment?: string[] | null     // e.g. ['salaried','self_employed']; null = not recorded
  income_currencies?: string[] | null      // e.g. ['NGN']; null = not recorded
  employment_notes?: string | null
  property_eligibility?: string | null
  required_documents?: string | null
  source_date?: string | null
  verification_status?: VerificationStatus | null
  internal_notes?: string | null
  follow_up_owner?: string | null
  next_follow_up_at?: string | null
}

// MANOP policy default, not a recovered fact.
export const STALENESS_THRESHOLD_DAYS = 180
const DAY_MS = 24 * 60 * 60 * 1000

export type VerificationState = 'current' | 'stale' | 'invalid' | 'future'

export function verificationState(lastVerifiedAt: string | null | undefined, now: number = Date.now(), thresholdDays: number = STALENESS_THRESHOLD_DAYS): VerificationState {
  if (typeof lastVerifiedAt !== 'string' || lastVerifiedAt.trim() === '') return 'invalid'
  const t = new Date(lastVerifiedAt).getTime()
  if (!Number.isFinite(t)) return 'invalid'
  if (t > now + DAY_MS) return 'future'              // a day of slack for time zones
  return now - t > thresholdDays * DAY_MS ? 'stale' : 'current'
}

// True for anything that is not a usable, current verification (stale, missing, unparseable or future).
export function isStale(lastVerifiedAt: string, thresholdDays: number = STALENESS_THRESHOLD_DAYS): boolean {
  return verificationState(lastVerifiedAt, Date.now(), thresholdDays) !== 'current'
}

export function daysSinceVerified(lastVerifiedAt: string, now: number = Date.now()): number | null {
  const t = new Date(lastVerifiedAt).getTime()
  return Number.isFinite(t) ? Math.floor((now - t) / DAY_MS) : null
}

// ── Can this product be shown to a buyer as a comparison at all? ──────────────────────────────────────
export interface MatchingEligibility { eligible: boolean; reason: string | null }

export function matchingEligibility(p: FinanceProduct, now: number = Date.now()): MatchingEligibility {
  if (p.status !== 'active') return { eligible: false, reason: 'Withdrawn' }
  if (!p.source_name || !p.source_name.trim()) return { eligible: false, reason: 'No source recorded' }
  if (p.verification_status === 'awaiting_confirmation') return { eligible: false, reason: 'Awaiting confirmation' }
  const v = verificationState(p.last_verified_at, now)
  if (v === 'stale') return { eligible: false, reason: `Last verified more than ${STALENESS_THRESHOLD_DAYS} days ago` }
  if (v === 'invalid') return { eligible: false, reason: 'Verification date missing or invalid' }
  if (v === 'future') return { eligible: false, reason: 'Verification date is in the future' }
  return { eligible: true, reason: null }
}

// Which published criteria MANOP has NOT recorded for this product (admin "missing criteria" view).
export function missingCriteria(p: FinanceProduct): string[] {
  const m: string[] = []
  const scope = p.coverage_scope ?? (p.cities_covered?.length ? 'cities' : 'unknown')
  if (scope === 'unknown') m.push('Coverage (nationwide or cities)')
  if (p.max_ltv_pct == null) m.push('Maximum LTV')
  if (p.max_tenor_years == null) m.push('Maximum tenor')
  if (p.min_monthly_income_ngn == null) m.push('Minimum monthly income')
  if (p.min_loan_amount_ngn == null && p.max_loan_amount_ngn == null) m.push('Loan amount limits')
  if (p.min_rate_pct == null && p.max_rate_pct == null) m.push('Interest rate')
  return m
}

// ── Matching ──────────────────────────────────────────────────────────────────────────────────────────
export interface SuitabilityCriteria {
  country_code: string
  city?: string | null
  ltv_pct?: number | null
  loan_amount_ngn?: number | null
  monthly_income_ngn?: number | null
  loan_tenor_years?: number | null
  deposit_pct?: number | null
  residency?: string | null         // 'resident' | 'diaspora'
  employment?: string | null        // 'salaried' | 'self_employed' ...
  income_currency?: string | null   // 'NGN' | 'USD' ...
  product_type?: FinanceProductType | null // when set, only compare against this type
}

export type CheckOutcome = 'met' | 'not_met' | 'unknown'
export interface CriterionCheck {
  key: string
  outcome: CheckOutcome
  text: string
  unknown_reason?: 'buyer_input' | 'product_record'
}

export type MatchVerdict =
  | 'meets_recorded'          // every criterion MANOP could check is met
  | 'does_not_meet'           // at least one recorded criterion is broken
  | 'insufficient_information'// nothing (or something needed) could be assessed
  | 'stale'                   // verification not current: withdrawn from matching
  | 'confirmation_required'   // no source, or awaiting confirmation: withdrawn from matching

export const VERDICT_LABEL: Record<MatchVerdict, string> = {
  meets_recorded: 'Meets the recorded criteria checked',
  does_not_meet: 'Does not meet a recorded criterion',
  insufficient_information: 'Insufficient information to assess',
  stale: 'Product information is stale',
  confirmation_required: 'Provider confirmation required',
}

export interface ProductMatch {
  product: FinanceProduct
  verdict: MatchVerdict
  fits: boolean               // === (verdict === 'meets_recorded'); kept for existing consumers
  stale: boolean              // verification not current
  needs_provider_confirmation: boolean // anything short of provider_confirmed
  checks: CriterionCheck[]
  reasons: string[]           // plain-language lines; always at least one
}

const present = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const fmtN = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`
const lc = (s: string) => s.trim().toLowerCase()

function listCheck(key: string, label: string, recorded: string[] | null | undefined, given: string | null | undefined): CriterionCheck | null {
  const hasRecord = Array.isArray(recorded) && recorded.length > 0
  const hasGiven = !!given && given.trim() !== ''
  if (!hasRecord && !hasGiven) return null
  if (hasRecord && !hasGiven) return { key, outcome: 'unknown', unknown_reason: 'buyer_input', text: `${label} was not provided; this product records ${recorded!.join(', ')}` }
  if (!hasRecord) return { key, outcome: 'unknown', unknown_reason: 'product_record', text: `MANOP has not recorded this product's ${label.toLowerCase()} requirement` }
  return recorded!.map(lc).includes(lc(given!))
    ? { key, outcome: 'met', text: `${label} (${given}) is within the recorded ${recorded!.join(', ')}` }
    : { key, outcome: 'not_met', text: `${label} (${given}) is not among the recorded ${recorded!.join(', ')}` }
}

// A numeric ceiling/floor check. `kind` 'max': buyer value must be <= limit. 'min': buyer value must be >= limit.
function limitCheck(key: string, label: string, kind: 'max' | 'min', limit: number | null | undefined, given: number | null | undefined, fmt: (n: number) => string): CriterionCheck | null {
  const hasLimit = present(limit), hasGiven = present(given)
  if (!hasLimit && !hasGiven) return null
  if (hasLimit && !hasGiven) return { key, outcome: 'unknown', unknown_reason: 'buyer_input', text: `${label} was not provided; this product records a ${kind === 'max' ? 'maximum' : 'minimum'} of ${fmt(limit as number)}` }
  if (!hasLimit) return { key, outcome: 'unknown', unknown_reason: 'product_record', text: `MANOP has not recorded a ${kind === 'max' ? 'maximum' : 'minimum'} for ${label.toLowerCase()}` }
  const ok = kind === 'max' ? (given as number) <= (limit as number) : (given as number) >= (limit as number)
  return ok
    ? { key, outcome: 'met', text: `${label} ${fmt(given as number)} is within the recorded ${kind === 'max' ? 'maximum' : 'minimum'} of ${fmt(limit as number)}` }
    : { key, outcome: 'not_met', text: `${label} ${fmt(given as number)} is ${kind === 'max' ? 'above the recorded maximum' : 'below the recorded minimum'} of ${fmt(limit as number)}` }
}

export function checkProduct(p: FinanceProduct, c: SuitabilityCriteria): CriterionCheck[] {
  const checks: CriterionCheck[] = []
  const push = (x: CriterionCheck | null) => { if (x) checks.push(x) }
  const pct = (n: number) => `${Number(n.toFixed(1))}%`
  const yrs = (n: number) => `${n} years`

  // country
  checks.push(p.country_code === c.country_code
    ? { key: 'country', outcome: 'met', text: `Recorded for ${c.country_code}` }
    : { key: 'country', outcome: 'not_met', text: `Not recorded for ${c.country_code}` })

  // coverage: an empty city list is NOT nationwide unless the record says so
  const scope: CoverageScope = p.coverage_scope ?? (p.cities_covered?.length ? 'cities' : 'unknown')
  if (scope === 'nationwide') {
    checks.push({ key: 'coverage', outcome: 'met', text: 'Recorded as nationwide' })
  } else if (scope === 'cities') {
    if (!c.city) checks.push({ key: 'coverage', outcome: 'unknown', unknown_reason: 'buyer_input', text: `City was not provided; this product records ${p.cities_covered.join(', ')}` })
    else if (p.cities_covered.some(x => lc(x) === lc(c.city!))) checks.push({ key: 'coverage', outcome: 'met', text: `${c.city} is a recorded city` })
    else checks.push({ key: 'coverage', outcome: 'not_met', text: `${c.city} is not among the recorded cities (${p.cities_covered.join(', ')})` })
  } else if (c.city) {
    checks.push({ key: 'coverage', outcome: 'unknown', unknown_reason: 'product_record', text: 'MANOP has not recorded where this product is available' })
  }

  push(limitCheck('ltv', 'LTV', 'max', p.max_ltv_pct, c.ltv_pct, pct))
  push(limitCheck('income', 'Monthly income', 'min', p.min_monthly_income_ngn, c.monthly_income_ngn, fmtN))
  push(limitCheck('loan_max', 'Loan amount', 'max', p.max_loan_amount_ngn, c.loan_amount_ngn, fmtN))
  push(limitCheck('loan_min', 'Loan amount', 'min', p.min_loan_amount_ngn, c.loan_amount_ngn, fmtN))
  push(limitCheck('tenor_max', 'Tenor', 'max', p.max_tenor_years, c.loan_tenor_years, yrs))
  push(limitCheck('tenor_min', 'Tenor', 'min', p.min_tenor_years, c.loan_tenor_years, yrs))
  push(limitCheck('deposit', 'Deposit', 'min', p.min_deposit_pct, c.deposit_pct, pct))
  push(listCheck('residency', 'Residency', p.allowed_residency, c.residency))
  push(listCheck('employment', 'Employment type', p.allowed_employment, c.employment))
  push(listCheck('income_currency', 'Income currency', p.income_currencies, c.income_currency))

  // Free-text conditions can't be evaluated by MANOP: say so rather than imply they are satisfied.
  if (p.property_eligibility && p.property_eligibility.trim()) {
    checks.push({ key: 'property', outcome: 'unknown', unknown_reason: 'product_record', text: 'Property and development conditions are recorded as text and have not been assessed against this property' })
  }
  return checks
}

export function matchFinanceProducts(products: FinanceProduct[], criteria: SuitabilityCriteria, now: number = Date.now()): ProductMatch[] {
  return products
    .filter(p => p.status === 'active')
    .filter(p => !criteria.product_type || p.product_type === criteria.product_type)
    .map(p => {
      const elig = matchingEligibility(p, now)
      const v = verificationState(p.last_verified_at, now)
      const stale = v !== 'current'
      const needs = p.verification_status !== 'provider_confirmed'
      const checks = elig.eligible ? checkProduct(p, criteria) : []
      const reasons: string[] = []
      let verdict: MatchVerdict

      if (!elig.eligible) {
        verdict = stale ? 'stale' : 'confirmation_required'
        reasons.push(`${elig.reason}: withdrawn from matching until MANOP re-verifies or confirms it`)
      } else {
        const notMet = checks.filter(k => k.outcome === 'not_met')
        const met = checks.filter(k => k.outcome === 'met')
        const needInput = checks.filter(k => k.outcome === 'unknown' && k.unknown_reason === 'buyer_input')
        if (notMet.length) { verdict = 'does_not_meet'; notMet.forEach(k => reasons.push(k.text)) }
        // Country and coverage alone say where a product exists, not whether the buyer's numbers fit it.
        else if (met.filter(k => k.key !== 'country' && k.key !== 'coverage').length === 0) {
          verdict = 'insufficient_information'
          needInput.forEach(k => reasons.push(k.text))
          if (!needInput.length) reasons.push('MANOP has not recorded enough criteria for this product to assess your numbers')
        } else {
          verdict = 'meets_recorded'
          reasons.push('Your inputs meet the criteria MANOP has recorded and checked for this product')
        }
        // What was NOT checked is always listed, so "meets" is never read as "meets everything".
        needInput.forEach(k => { if (verdict === 'meets_recorded') reasons.push(`Not assessed: ${k.text}`) })
        checks.filter(k => k.outcome === 'unknown' && k.unknown_reason === 'product_record').forEach(k => reasons.push(`Not assessed: ${k.text}`))
        if (verdict === 'meets_recorded') reasons.push('This is not a lender decision; the lender sets the final eligibility and terms')
      }
      if (reasons.length === 0) reasons.push(VERDICT_LABEL[verdict])
      return { product: p, verdict, fits: verdict === 'meets_recorded', stale, needs_provider_confirmation: needs, checks, reasons }
    })
}

// ── Admin input validation (shared by the POST and PATCH routes and the form) ─────────────────────────
export interface ProductInputResult { ok: boolean; errors: string[]; value: Record<string, unknown> }

const str = (v: unknown, max = 2000): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const numOrNull = (v: unknown): number | null | 'bad' => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 'bad'
}
const strList = (v: unknown): string[] | null => {
  if (v === null || v === undefined) return null
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const out = arr.map(x => String(x).trim()).filter(Boolean)
  return out.length ? out : null
}
const validDate = (v: unknown, now: number): 'ok' | 'invalid' | 'future' => {
  if (typeof v !== 'string' || !Number.isFinite(new Date(v).getTime())) return 'invalid'
  return new Date(v).getTime() > now + DAY_MS ? 'future' : 'ok'
}

// `partial` = PATCH/update: only fields present in the body are validated and returned.
export function validateProductInput(body: Record<string, any>, opts: { partial?: boolean; now?: number } = {}): ProductInputResult {
  const now = opts.now ?? Date.now()
  const partial = !!opts.partial
  const errors: string[] = []
  const value: Record<string, unknown> = {}
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  const reqText = (k: string, label: string) => {
    if (partial && !has(k)) return
    const s = str(body[k], 300)
    if (!s) errors.push(`${label} is required.`); else value[k] = s
  }
  reqText('lender_name', 'Lender / provider')
  reqText('product_name', 'Product name')
  reqText('source_name', 'Source')

  if (!partial || has('product_type')) {
    if (!PRODUCT_TYPES.includes(body.product_type)) errors.push(`Product type must be one of: ${PRODUCT_TYPES.join(', ')}.`)
    else value.product_type = body.product_type
  }
  if (!partial || has('country_code')) {
    const cc = str(body.country_code ?? 'NG', 2)?.toUpperCase()
    if (!cc || !/^[A-Z]{2}$/.test(cc)) errors.push('Country must be a two-letter code such as NG.'); else value.country_code = cc
  }
  if (!partial || has('last_verified_at')) {
    const d = validDate(body.last_verified_at, now)
    if (d === 'invalid') errors.push('Last verified must be a valid date.')
    else if (d === 'future') errors.push('Last verified cannot be in the future.')
    else value.last_verified_at = new Date(body.last_verified_at).toISOString()
  }
  if (has('source_date') && body.source_date) {
    const d = validDate(body.source_date, now)
    if (d !== 'ok') errors.push('Source date must be a valid date that is not in the future.')
    else value.source_date = new Date(body.source_date).toISOString().slice(0, 10)
  } else if (has('source_date')) value.source_date = null
  if (has('source_url') && body.source_url) {
    const u = str(body.source_url, 1000)
    if (!u || !/^https?:\/\/\S+$/i.test(u)) errors.push('Source URL must start with http:// or https://.'); else value.source_url = u
  } else if (has('source_url')) value.source_url = null

  const range = (k: string, label: string, lo: number, hi: number) => {
    if (!has(k)) return
    const n = numOrNull(body[k])
    if (n === 'bad') { errors.push(`${label} must be a number.`); return }
    if (n !== null && (n < lo || n > hi)) { errors.push(`${label} must be between ${lo} and ${hi}.`); return }
    value[k] = n
  }
  range('min_rate_pct', 'Minimum interest rate', 0, 100)
  range('max_rate_pct', 'Maximum interest rate', 0, 100)
  range('max_ltv_pct', 'Maximum LTV', 0, 100)
  range('min_deposit_pct', 'Minimum deposit', 0, 100)
  range('min_tenor_years', 'Minimum tenor', 0, 60)
  range('max_tenor_years', 'Maximum tenor', 0, 60)
  range('min_monthly_income_ngn', 'Minimum monthly income', 0, 1e12)
  range('min_loan_amount_ngn', 'Minimum loan amount', 0, 1e13)
  range('max_loan_amount_ngn', 'Maximum loan amount', 0, 1e13)
  const pair = (lo: string, hi: string, label: string) => {
    if (typeof value[lo] === 'number' && typeof value[hi] === 'number' && (value[lo] as number) > (value[hi] as number)) errors.push(`Minimum ${label} cannot exceed the maximum.`)
  }
  pair('min_rate_pct', 'max_rate_pct', 'interest rate'); pair('min_tenor_years', 'max_tenor_years', 'tenor'); pair('min_loan_amount_ngn', 'max_loan_amount_ngn', 'loan amount')

  if (has('coverage_scope')) {
    if (!['nationwide', 'cities', 'unknown'].includes(body.coverage_scope)) errors.push('Coverage must be nationwide, cities or unknown.')
    else value.coverage_scope = body.coverage_scope
  }
  if (has('cities_covered') || has('coverage_scope')) {
    const cities = strList(body.cities_covered) ?? []
    if (body.coverage_scope === 'cities' && cities.length === 0) errors.push('List at least one city, or choose nationwide / not recorded.')
    value.cities_covered = body.coverage_scope === 'nationwide' ? [] : cities
  }
  if (has('rate_type')) {
    if (body.rate_type && !['fixed', 'variable', 'unknown'].includes(body.rate_type)) errors.push('Rate type must be fixed, variable or unknown.')
    else value.rate_type = body.rate_type || null
  }
  if (has('verification_status')) {
    if (body.verification_status && !VERIFICATION_STATUSES.includes(body.verification_status)) errors.push('Verification status is not recognised.')
    else value.verification_status = body.verification_status || null
  }
  for (const k of ['currency_code']) if (has(k)) value[k] = str(body[k], 8)?.toUpperCase() ?? null
  for (const k of ['description', 'application_channel', 'fees_notes', 'repayment_structure', 'employment_notes', 'property_eligibility', 'required_documents', 'eligibility_notes', 'internal_notes', 'follow_up_owner'])
    if (has(k)) value[k] = str(body[k], k === 'description' || k.endsWith('notes') || k === 'property_eligibility' || k === 'required_documents' ? 4000 : 300)
  for (const k of ['allowed_residency', 'allowed_employment', 'income_currencies']) if (has(k)) value[k] = strList(body[k])
  if (has('next_follow_up_at')) {
    if (body.next_follow_up_at && !Number.isFinite(new Date(body.next_follow_up_at).getTime())) errors.push('Follow-up date is not a valid date.')
    else value.next_follow_up_at = body.next_follow_up_at ? new Date(body.next_follow_up_at).toISOString().slice(0, 10) : null
  }
  return { ok: errors.length === 0, errors, value }
}

// Columns a BUYER-facing response may carry. internal_notes, follow_up_owner and next_follow_up_at are MANOP-internal
// and must never reach the public route (the table's RLS lets anyone read active rows, so the route has to choose columns).
export const PUBLIC_PRODUCT_COLUMNS_LEGACY =
  'id, lender_name, product_name, product_type, country_code, cities_covered, min_rate_pct, max_rate_pct, max_ltv_pct, min_tenor_years, max_tenor_years, min_monthly_income_ngn, eligibility_notes, source_name, source_url, last_verified_at, status, created_at, updated_at'
export const PUBLIC_PRODUCT_COLUMNS_EXTENDED = PUBLIC_PRODUCT_COLUMNS_LEGACY +
  ', currency_code, description, application_channel, coverage_scope, min_loan_amount_ngn, max_loan_amount_ngn, rate_type, min_deposit_pct, fees_notes, repayment_structure, allowed_residency, allowed_employment, income_currencies, employment_notes, property_eligibility, required_documents, source_date, verification_status'

export function isMissingColumnError(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false
  return e.code === '42703' || e.code === 'PGRST204' || /column .*(does not exist|schema cache)|could not find the .* column/i.test(e.message || '')
}

// The columns that existed before phase 17: used to retry a save when the register migration has not run.
export const LEGACY_PRODUCT_COLUMNS = [
  'lender_name', 'product_name', 'product_type', 'country_code', 'cities_covered', 'min_rate_pct', 'max_rate_pct',
  'max_ltv_pct', 'min_tenor_years', 'max_tenor_years', 'min_monthly_income_ngn', 'eligibility_notes',
  'source_name', 'source_url', 'last_verified_at', 'status',
]