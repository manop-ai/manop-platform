// lib/commercial-terms.ts
//
// MANOP commercial model — pure logic shared by the requester UI, the API routes and the admin UI.
//
// Requesting an agreement creates no binding terms and no receivable. The rates that apply come from the APPROVED terms version
// linked to the agreement (agency: flat success fee on the qualifying transaction value; developer: the separate tiered schedule),
// snapshotted when the agreement is recorded as completed. Nothing here is legal approval of any template or rate.
// computeSuccessFee() is the one calculation path; its results are illustrative until a payment request is issued (see lib/fees.ts).
//
// LEGACY, kept so existing records still read: the older 'transaction_fee' (1.25%) and 'agency_commission_share' (25%) options and
// PROPOSED_*_RATE_PCT. New requests do not choose between them (agency commission sharing is superseded) and no new code should use them.
// Which transactions qualify and what is payable are defined by the agreement and its approved terms, not by this code.

import { COUNTRY_CURRENCY } from './location-taxonomy'

/** SUPERSEDED by the founder's tiered schedule (PROPOSED_SUCCESS_FEE_SCHEDULE below). Kept only so existing rows and tests still load. */
export const PROPOSED_FEE_RATE_PCT = 1.25
/** SUPERSEDED: MANOP does not take a share of agency commission by default. */
export const PROPOSED_SHARE_RATE_PCT = 25

export const OPTIONS = ['transaction_fee', 'agency_commission_share', 'needs_clarification'] as const
export type CommercialOption = (typeof OPTIONS)[number]
export const OPTION_LABEL: Record<CommercialOption, string> = {
  transaction_fee: 'MANOP transaction fee',
  agency_commission_share: 'Agency commission sharing',
  needs_clarification: 'I need clarification before choosing',
}

export const SUPPORTED_CURRENCIES = Array.from(new Set([...Object.values(COUNTRY_CURRENCY).map(c => c.code), 'USD']))

export const STATUSES = [
  'draft', 'submitted', 'information_required', 'under_review', 'clarification_requested',
  'ready_for_agreement_preparation', 'agreement_prepared', 'agreement_sent', 'awaiting_signature',
  'signed_copy_received', 'countersignature_pending', 'executed', 'declined', 'withdrawn',
] as const
export type RequestStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', information_required: 'Information required', under_review: 'Under review',
  clarification_requested: 'Clarification requested', ready_for_agreement_preparation: 'Ready for agreement preparation',
  agreement_prepared: 'Agreement prepared', agreement_sent: 'Agreement sent', awaiting_signature: 'Awaiting signature',
  signed_copy_received: 'Signed copy received', countersignature_pending: 'Signed copy accepted, ready to record',
  executed: 'Executed', declined: 'Declined', withdrawn: 'Withdrawn',
}

/** What the requester sees: plain, and never implies a binding position before execution. */
export const STATUS_EXPLANATION: Record<RequestStatus, string> = {
  draft: 'Saved but not yet submitted to MANOP.',
  submitted: 'Received by MANOP. No terms are agreed.',
  information_required: 'MANOP needs more information from you. Update your request and resubmit.',
  under_review: 'MANOP is reviewing your request. No terms are agreed.',
  clarification_requested: 'MANOP has questions about your request. Update it and resubmit.',
  ready_for_agreement_preparation: 'MANOP has what it needs to prepare an agreement. No terms are agreed yet.',
  agreement_prepared: 'MANOP has prepared an agreement for review. It is not binding until signed by all parties.',
  agreement_sent: 'MANOP has recorded that an agreement was sent to you. It is not binding until signed.',
  awaiting_signature: 'Waiting for your signed copy. The agreement is not binding until executed.',
  signed_copy_received: 'MANOP has received your signed copy and is checking it. This is not yet an executed agreement.',
  countersignature_pending: 'Your signed copy has been accepted. MANOP will record the agreement as completed.',
  executed: 'An agreement has been executed and recorded by MANOP.',
  declined: 'MANOP has declined this request.',
  withdrawn: 'You withdrew this request.',
}

/** Statuses in which the requester may edit and (re)submit. */
export const REQUESTER_EDITABLE: RequestStatus[] = ['draft', 'information_required', 'clarification_requested']
export const REQUESTER_WITHDRAWABLE: RequestStatus[] = ['draft', 'submitted', 'information_required', 'under_review', 'clarification_requested', 'ready_for_agreement_preparation', 'agreement_prepared']
export const TERMINAL: RequestStatus[] = ['executed', 'declined', 'withdrawn']

/** Admin-driven transitions. Requester transitions (submit / resubmit / withdraw) are handled by their own routes. */
export const ADMIN_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  draft: [],
  submitted: ['under_review', 'information_required', 'clarification_requested', 'declined'],
  under_review: ['information_required', 'clarification_requested', 'ready_for_agreement_preparation', 'declined'],
  information_required: ['under_review', 'declined'],
  clarification_requested: ['under_review', 'declined'],
  ready_for_agreement_preparation: ['agreement_prepared', 'information_required', 'declined'],
  agreement_prepared: ['agreement_sent', 'information_required', 'declined'],
  agreement_sent: ['awaiting_signature', 'agreement_prepared', 'declined'],
  awaiting_signature: ['agreement_prepared', 'declined'],
  // Moves into and out of these three happen through the document routes (signed-copy upload, review, record as completed),
  // never by a bare status change. 'executed' in particular can only be reached by recording the completed record.
  signed_copy_received: ['awaiting_signature', 'countersignature_pending', 'declined'],
  countersignature_pending: ['awaiting_signature', 'declined'],
  executed: [],
  declined: [],
  withdrawn: [],
}
/** The requester must be told why when MANOP asks for something. */
export const NEEDS_MESSAGE: RequestStatus[] = ['information_required', 'clarification_requested', 'declined']

export interface TransitionCheck { ok: boolean; error?: string }
export function checkAdminTransition(from: RequestStatus, to: RequestStatus, ctx: { message?: string | null; executedAt?: string | null; evidenceRef?: string | null; agreedOption?: string | null }): TransitionCheck {
  if (!(STATUSES as readonly string[]).includes(to)) return { ok: false, error: 'Unknown status.' }
  if (to === 'executed') return { ok: false, error: 'A request becomes Executed only by recording the accepted signed copy as completed (Agreement documents section), never by changing the status.' }
  if (!ADMIN_TRANSITIONS[from]?.includes(to)) return { ok: false, error: `A request that is "${STATUS_LABEL[from]}" cannot move to "${STATUS_LABEL[to]}".` }
  if (NEEDS_MESSAGE.includes(to) && !(ctx.message ?? '').trim()) return { ok: false, error: `Add a message for the requester explaining why the request is "${STATUS_LABEL[to]}".` }
  return { ok: true }
}

// ── Money ─────────────────────────────────────────────────────────────────────────────────────────
const toMinor = (n: number) => Math.round(n * 100)
const fromMinor = (m: number) => m / 100
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export interface CalcResult {
  status: 'calculated' | 'requires_information'
  option: 'transaction_fee' | 'agency_commission_share' | null
  currency: string | null
  amount: number | null            // the proposed MANOP amount
  agencyCommission: number | null  // Option B: commission as disclosed
  eligibleCommission: number | null // Option B: the part attributable (after sharing)
  formula: string
  missing: string[]
  notes: string[]
  /** Always false from this module: only an executed agreement can make anything binding. */
  binding: false
}

const base = (o: CalcResult['option']): CalcResult => ({ status: 'requires_information', option: o, currency: null, amount: null, agencyCommission: null, eligibleCommission: null, formula: '', missing: [], notes: [], binding: false })

function checkCurrency(r: CalcResult, currency: string | null | undefined): string | null {
  if (!currency) { r.missing.push('currency'); return null }
  const c = currency.trim().toUpperCase()
  if (!SUPPORTED_CURRENCIES.includes(c)) { r.missing.push(`a supported currency (${SUPPORTED_CURRENCIES.join(', ')}); "${currency}" is not supported`); return null }
  return c
}
function checkRate(r: CalcResult, name: string, v: number | null): number | null {
  if (v === null) { r.missing.push(name); return null }
  if (v < 0 || v > 100) { r.missing.push(`${name} between 0 and 100`); return null }
  return v
}

/** Option A: proposed MANOP fee = agreed qualifying transaction value × proposed fee rate. */
export function computeTransactionFee(i: { transactionValue: unknown; currency: string | null | undefined; feeRatePct: unknown }): CalcResult {
  const r = base('transaction_fee')
  r.formula = 'Proposed MANOP fee = agreed qualifying transaction value × proposed fee rate'
  const value = num(i.transactionValue)
  if (value === null) r.missing.push('agreed qualifying transaction value')
  else if (value < 0) r.missing.push('a transaction value of zero or more')
  const rate = checkRate(r, 'proposed fee rate', num(i.feeRatePct))
  const cur = checkCurrency(r, i.currency)
  if (r.missing.length || value === null || rate === null || cur === null) return r
  r.currency = cur
  r.amount = fromMinor(Math.round(toMinor(value) * rate / 100))
  r.status = 'calculated'
  r.notes.push('Proposed and illustrative. Not payable and not a receivable unless an executed agreement and its qualifying-event conditions are satisfied.')
  return r
}

export type CommissionType = 'percentage_of_value' | 'fixed_fee' | 'other'
export type CommissionScope = 'total' | 'portion' | 'unknown'

/** Option B: agency commission = commission base × rate; proposed MANOP share = eligible commission × sharing rate. */
export function computeAgencyShare(i: {
  commissionType: CommissionType | null | undefined
  transactionValue: unknown
  commissionRatePct: unknown
  commissionFixedAmount: unknown
  currency: string | null | undefined
  scope: CommissionScope | null | undefined
  shared: boolean | null | undefined
  retainedPct: unknown
  shareRatePct: unknown
}): CalcResult {
  const r = base('agency_commission_share')
  r.formula = 'Agency commission = commission base × agency commission rate; proposed MANOP share = eligible agency commission × proposed sharing rate'
  const cur = checkCurrency(r, i.currency)
  const shareRate = checkRate(r, 'proposed sharing rate', num(i.shareRatePct))

  let commission: number | null = null
  if (!i.commissionType) r.missing.push('how the agency commission is calculated (percentage, fixed fee or other)')
  else if (i.commissionType === 'other') r.missing.push('MANOP review: the commission basis is "other", so no figure is calculated automatically')
  else if (i.commissionType === 'fixed_fee') {
    const f = num(i.commissionFixedAmount)
    if (f === null || f < 0) r.missing.push('the fixed commission amount')
    else commission = f
  } else {
    const v = num(i.transactionValue)
    const rate = checkRate(r, 'agency commission rate', num(i.commissionRatePct))
    if (v === null || v < 0) r.missing.push('the commission base (transaction value)')
    if (v !== null && v >= 0 && rate !== null) commission = fromMinor(Math.round(toMinor(v) * rate / 100))
  }

  let eligible: number | null = null
  if (commission !== null) {
    if (!i.scope || i.scope === 'unknown') r.missing.push('whether the disclosed commission is the agency’s total commission or only the portion relevant to this transaction')
    else if (i.scope === 'portion') eligible = commission
    else if (i.shared === null || i.shared === undefined) r.missing.push('whether the commission is shared with another agent, broker or intermediary')
    else if (!i.shared) eligible = commission
    else {
      const kept = num(i.retainedPct)
      if (kept === null) r.missing.push('the share of the commission the agency retains after sharing it with an intermediary')
      else if (kept < 0 || kept > 100) r.missing.push('a retained share between 0 and 100')
      else eligible = fromMinor(Math.round(toMinor(commission) * kept / 100))
    }
  }
  if (r.missing.length || commission === null || eligible === null || shareRate === null || cur === null) return r
  r.currency = cur
  r.agencyCommission = commission
  r.eligibleCommission = eligible
  r.amount = fromMinor(Math.round(toMinor(eligible) * shareRate / 100))
  r.status = 'calculated'
  r.notes.push('Proposed and illustrative. The agency’s figures are self-reported and not verified by MANOP. Not payable unless an executed agreement and its conditions are satisfied.')
  return r
}

export interface RequestLike {
  requester_role: 'agency' | 'developer'
  preferred_option: CommercialOption | null
  currency: string | null
  illustrative_transaction_value: unknown
  proposed_fee_rate_pct: unknown
  proposed_share_rate_pct: unknown
  commission_type: CommissionType | null
  commission_rate_pct: unknown
  commission_fixed_amount: unknown
  commission_pct_scope: CommissionScope | null
  commission_shared: boolean | null
  commission_retained_pct: unknown
}

/** The proposal for the request's PREFERRED option only. The two options are never combined. */
export function proposalFor(q: RequestLike): CalcResult {
  if (q.preferred_option === 'transaction_fee') return computeTransactionFee({ transactionValue: q.illustrative_transaction_value, currency: q.currency, feeRatePct: q.proposed_fee_rate_pct })
  if (q.preferred_option === 'agency_commission_share') {
    return computeAgencyShare({ commissionType: q.commission_type, transactionValue: q.illustrative_transaction_value, commissionRatePct: q.commission_rate_pct, commissionFixedAmount: q.commission_fixed_amount, currency: q.currency, scope: q.commission_pct_scope, shared: q.commission_shared, retainedPct: q.commission_retained_pct, shareRatePct: q.proposed_share_rate_pct })
  }
  const r = base(null)
  r.missing.push(q.preferred_option === 'needs_clarification' ? 'a preferred option (the requester asked for clarification first)' : 'a preferred option')
  return r
}

// ── Validation & readiness ────────────────────────────────────────────────────────────────────────
export interface RequestInput {
  company_name?: string | null; requester_name?: string | null; requester_title?: string | null
  contact_email?: string | null; contact_phone?: string | null
  counterparty_name?: string | null; counterparty_role?: string | null
  preferred_option?: string | null; currency?: string | null; illustrative_transaction_value?: unknown
  commission_type?: string | null; commission_rate_pct?: unknown; commission_fixed_amount?: unknown
  commission_basis?: string | null; commission_pct_scope?: string | null; commission_payer?: string | null
  commission_shared?: boolean | null; commission_shared_details?: string | null; commission_retained_pct?: unknown
  commission_varies?: string[] | null; commission_notes?: string | null; disclosure_declined?: boolean | null
  requester_notes?: string | null; questions?: string | null; project_ids?: string[] | null
  opportunity_kind?: string | null; scope_note?: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Items still needed before MANOP can consider the request. Empty list = ready for commercial review. */
export function readinessGaps(i: RequestInput, role: 'agency' | 'developer'): string[] {
  const g: string[] = []
  if (!t(i.company_name)) g.push('Company or agency name')
  if (!t(i.requester_name)) g.push('Your name')
  if (!t(i.requester_title)) g.push('Your role in the company')
  if (!EMAIL.test(t(i.contact_email))) g.push('A valid business email')
  // A development or redevelopment request names the development(s). Agency-level and land requests need no single development.
  if (!i.project_ids?.length && (i.opportunity_kind === 'development' || i.opportunity_kind === 'redevelopment')) g.push('At least one development')
  if (i.preferred_option === 'agency_commission_share') {
    if (role === 'agency') {
      if (i.disclosure_declined) g.push('Commission disclosure (you indicated you cannot or will not disclose it, so this option cannot be considered yet)')
      else {
        if (!i.commission_type) g.push('How your commission is calculated')
        if (i.commission_type === 'percentage_of_value' && num(i.commission_rate_pct) === null) g.push('Your commission percentage')
        if (i.commission_type === 'fixed_fee' && num(i.commission_fixed_amount) === null) g.push('Your fixed commission amount')
        if (!t(i.commission_basis)) g.push('The basis on which the commission is calculated')
        if (!i.commission_pct_scope || i.commission_pct_scope === 'unknown') g.push('Whether this is your total commission or only the portion for this transaction')
        if (!t(i.commission_payer)) g.push('Who pays the commission')
        if (i.commission_shared === null || i.commission_shared === undefined) g.push('Whether the commission is shared with another agent or intermediary')
        if (i.commission_shared && !t(i.commission_shared_details)) g.push('Who the commission is shared with, and how')
        if (!i.commission_varies) g.push('Whether your commission varies by development, unit type, transaction or client')
        if (!i.currency) g.push('Currency')
      }
    } else if (!t(i.counterparty_name)) {
      g.push('The agency involved (its commission details must come from the agency)')
    }
  }
  if (i.preferred_option === 'transaction_fee' && role === 'agency' && !t(i.counterparty_name)) g.push('The developer you act for')
  return g
}

export function validateRequest(i: RequestInput, role: 'agency' | 'developer', mode: 'draft' | 'submit'): { ok: boolean; errors: string[]; gaps: string[] } {
  const errors: string[] = []
  if (i.preferred_option && !(OPTIONS as readonly string[]).includes(i.preferred_option)) errors.push('Unknown commercial option.')
  if (i.currency && !SUPPORTED_CURRENCIES.includes(i.currency.toUpperCase())) errors.push(`Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`)
  for (const [k, label] of [['commission_rate_pct', 'Commission percentage'], ['commission_retained_pct', 'Retained share']] as const) {
    const n = num(i[k]); if (i[k] !== null && i[k] !== undefined && i[k] !== '' && (n === null || n < 0 || n > 100)) errors.push(`${label} must be a number between 0 and 100.`)
  }
  for (const [k, label] of [['commission_fixed_amount', 'Fixed commission'], ['illustrative_transaction_value', 'Illustrative transaction value']] as const) {
    const n = num(i[k]); if (i[k] !== null && i[k] !== undefined && i[k] !== '' && (n === null || n < 0)) errors.push(`${label} must be zero or more.`)
  }
  if (i.commission_type && !['percentage_of_value', 'fixed_fee', 'other'].includes(i.commission_type)) errors.push('Unknown commission type.')
  if (i.commission_pct_scope && !['total', 'portion', 'unknown'].includes(i.commission_pct_scope)) errors.push('Unknown commission scope.')
  if (i.contact_email && !EMAIL.test(t(i.contact_email))) errors.push('Business email is not valid.')
  for (const k of ['requester_notes', 'questions', 'commission_notes', 'commission_shared_details', 'commission_basis'] as const) {
    if (t(i[k]).length > 4000) errors.push(`${k.replace(/_/g, ' ')} is too long (max 4000 characters).`)
  }
  const gaps = readinessGaps(i, role)
  // A draft may be incomplete. A submission may be incomplete ONLY about the commission disclosure
  // (it then stays "not ready for commercial review"); identity, contact and development are required.
  if (mode === 'submit') {
    const hard = ['Company or agency name', 'Your name', 'Your role in the company', 'A valid business email', 'At least one development', 'Your preferred option (or ask for clarification)']
    for (const h of hard) if (gaps.includes(h)) errors.push(`${h} is required.`)
  }
  return { ok: errors.length === 0, errors, gaps }
}

export const DISCLOSURE_STATUS_LABEL: Record<string, string> = {
  agency_supplied: 'Supplied by the agency (not verified)',
  developer_reported: 'Reported by the developer (not confirmed by the agency)',
  manop_reviewed: 'Reviewed by MANOP',
  counterparty_confirmed: 'Confirmed by the other contracting party',
  clarification_required: 'Clarification required',
  agreed_in_executed_agreement: 'Agreed in the executed agreement',
}

export function formatMoney(n: number | null | undefined, currency: string | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const sym = currency ? (Object.values(COUNTRY_CURRENCY).find(c => c.code === currency)?.symbol ?? (currency === 'USD' ? '$' : currency + ' ')) : ''
  return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

/** 12-char, unambiguous, human-readable reference e.g. AGR-7K2M9QXD */
export function newReference(rand: () => number = Math.random): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let s = ''
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(rand() * alphabet.length)]
  return `AGR-${s}`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// COMMERCIAL MODEL v2 — founder decisions. Everything below reads rates and prices from a VERSIONED TERMS RECORD
// (commercial_terms_versions) or from the snapshot an executed agreement kept. NO constant in this file is ever used to
// calculate a fee: the PROPOSED_* values only pre-fill a DRAFT version in the admin screen, for a person to review and approve.
//
// Five separate commercial concepts (never merged):
//   1. Agency Subscription Fee  2. MANOP success fee (paid by the developer)  3. agency commission (agency and the party
//   responsible under its mandate; MANOP does not pay it)  4. Buyer Pack access fee  5. Site Studio appraisal (no transaction fee)
// The earlier options "MANOP share of agency commission" and "1.25%" are SUPERSEDED (legacy functions above stay so rows still load).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════

export interface FeeTier { up_to: number | null; rate_pct: number }
export type FeeSchedule = FeeTier[]

/** PROPOSED starting schedule: 2% to 500m inclusive, 1.5% to 1bn inclusive, 1% above; the rate applies to the WHOLE value. Not approved. */
export const PROPOSED_SUCCESS_FEE_SCHEDULE: FeeSchedule = [
  { up_to: 500_000_000, rate_pct: 2 }, { up_to: 1_000_000_000, rate_pct: 1.5 }, { up_to: null, rate_pct: 1 },
]
/** PROPOSED, not final (founder: the price is not approved). Pre-fills a draft version only. */
// There is deliberately NO default agency subscription price: each subscription is assessed and proposed individually.
export const DEFAULT_QUALIFYING_MILESTONES = ['qualifying_payment_reported']

export function validateFeeSchedule(raw: unknown): { ok: boolean; errors: string[]; schedule: FeeSchedule } {
  const errors: string[] = []
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, errors: ['The fee schedule needs at least one tier.'], schedule: [] }
  const schedule: FeeSchedule = []
  let prev = 0
  raw.forEach((t, i) => {
    const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
    const rate = num(o.rate_pct)
    const up = o.up_to === null || o.up_to === undefined || o.up_to === '' ? null : num(o.up_to)
    if (rate === null || rate < 0 || rate > 100) errors.push(`Tier ${i + 1}: the rate must be between 0 and 100.`)
    const last = i === raw.length - 1
    if (last) { if (up !== null) errors.push('The last tier must be open-ended (no upper limit).') }
    else if (up === null || up <= prev) errors.push(`Tier ${i + 1}: the upper limit must be a number larger than the previous tier's.`)
    if (up !== null) prev = up
    if (rate !== null && !errors.length) schedule.push({ up_to: up, rate_pct: rate })
  })
  return { ok: errors.length === 0, errors, schedule: errors.length ? [] : schedule }
}

/** The rate for a value. Limits are INCLUSIVE (value <= up_to stays in that tier); the rate applies to the entire value. */
export function rateForValue(schedule: FeeSchedule, value: number): { rate_pct: number; tier_index: number } | null {
  for (let i = 0; i < schedule.length; i++) if (schedule[i].up_to === null || value <= (schedule[i].up_to as number)) return { rate_pct: schedule[i].rate_pct, tier_index: i }
  return null
}

export type RelationshipKind = 'sale' | 'jv' | 'redevelopment' | 'other'
export type FeeBasis = 'transaction_value' | 'agreed_fixed_amount' | 'agreed_other'
export interface SuccessFeeResult {
  status: 'calculated' | 'requires_information' | 'requires_review'
  basis: FeeBasis
  amount: number | null
  rate_pct: number | null
  tier_index: number | null
  currency: string | null
  formula: string
  missing: string[]
  notes: string[]
  /** Always false here. A calculation is a record for review; it is not an invoice and does not make a fee legally due. */
  binding: false
}

/** Success fee from the ACCEPTED agreement's own snapshot (never from a code constant). */
export function computeSuccessFee(i: {
  basis: FeeBasis; relationshipKind?: RelationshipKind; basisConfirmed?: boolean
  transactionValue: unknown; valueCurrency: string | null | undefined; feeCurrency: string | null | undefined
  schedule: unknown; fixedAmount?: unknown
}): SuccessFeeResult {
  const r: SuccessFeeResult = { status: 'requires_information', basis: i.basis, amount: null, rate_pct: null, tier_index: null, currency: null, formula: '', missing: [], notes: [], binding: false }
  const feeCur = (i.feeCurrency ?? '').toUpperCase()
  if (!feeCur || !SUPPORTED_CURRENCIES.includes(feeCur)) { r.missing.push('the fee currency recorded in the agreement'); return r }
  r.currency = feeCur

  if (i.basis === 'agreed_other') {
    r.status = 'requires_review'; r.formula = 'Fee basis is a bespoke arrangement described in the agreement'
    r.notes.push('The agreed basis is not a standard calculation, so no amount is calculated automatically. An admin must review it against the agreement.')
    return r
  }
  if (i.basis === 'agreed_fixed_amount') {
    const f = num(i.fixedAmount)
    r.formula = 'Fee = the fixed amount stated in the agreement'
    if (f === null || f < 0) { r.missing.push('the fixed fee amount agreed in the agreement'); return r }
    r.amount = fromMinor(Math.round(toMinor(f))); r.status = 'calculated'
    r.notes.push('Fixed fee as agreed. Whether and when it is due depends on the agreed trigger and its evidence.')
    return r
  }
  r.formula = 'Fee = the rate for the tier containing the qualifying transaction value × the ENTIRE transaction value'
  const sch = validateFeeSchedule(i.schedule)
  if (!sch.ok) { r.missing.push('a valid fee schedule in the agreement'); return r }
  const v = num(i.transactionValue)
  if (v === null || v <= 0) r.missing.push('the qualifying transaction value')
  const valCur = (i.valueCurrency ?? '').toUpperCase()
  if (valCur && valCur !== feeCur) r.missing.push(`the transaction value in ${feeCur} (it is ${valCur}; MANOP does not convert currencies automatically)`)
  if (!valCur) r.missing.push('the currency of the transaction value')
  if (r.missing.length || v === null) return r
  if ((i.relationshipKind === 'jv' || i.relationshipKind === 'redevelopment') && !i.basisConfirmed) {
    r.status = 'requires_review'
    r.notes.push('A JV or redevelopment has no conventional purchase price. Confirm that this value is the explicitly agreed fee basis before any fee is calculated. No percentage is applied to speculative future value.')
    return r
  }
  const t = rateForValue(sch.schedule, v)
  if (!t) { r.missing.push('a tier covering this value'); return r }
  r.rate_pct = t.rate_pct; r.tier_index = t.tier_index
  r.amount = fromMinor(Math.round(toMinor(v) * t.rate_pct / 100)); r.status = 'calculated'
  r.notes.push('Calculated from the accepted agreement. A record for review: not an invoice, and not a statement that a fee is legally due.')
  return r
}

// ── Agency Subscription ────────────────────────────────────────────────────────────────────────────
export type SubscriptionPhase = 'awaiting_payment' | 'payment_confirmed_awaiting_approval' | 'approved_not_active' | 'active' | 'expired' | 'suspended' | 'declined'
export interface SubscriptionRow { payment_status: string; approval_status: string; activation_status: string; period_start: string | null; period_end: string | null; payment_reference?: string | null }

/** Registration (data_partners), payment, approval, activation, expiry and suspension are distinct; this derives the one a person reads. */
export function subscriptionPhase(s: SubscriptionRow, today: Date = new Date()): SubscriptionPhase {
  if (s.approval_status === 'declined') return 'declined'
  if (s.activation_status === 'suspended') return 'suspended'
  if (s.activation_status === 'active') return s.period_end && new Date(s.period_end) < new Date(today.toISOString().slice(0, 10)) ? 'expired' : 'active'
  if (s.payment_status !== 'payment_confirmed') return 'awaiting_payment'
  return s.approval_status === 'approved' ? 'approved_not_active' : 'payment_confirmed_awaiting_approval'
}
export const SUBSCRIPTION_PHASE_LABEL: Record<SubscriptionPhase, string> = {
  awaiting_payment: 'Awaiting payment', payment_confirmed_awaiting_approval: 'Payment confirmed, awaiting MANOP approval',
  approved_not_active: 'Approved, not yet activated', active: 'Active', expired: 'Expired', suspended: 'Suspended', declined: 'Declined',
}
export function canActivateSubscription(s: SubscriptionRow): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (s.payment_status !== 'payment_confirmed') reasons.push('Payment has not been confirmed.')
  if (!s.payment_reference) reasons.push('A payment reference is required.')
  if (s.approval_status !== 'approved') reasons.push('The subscription has not been approved.')
  return { ok: reasons.length === 0, reasons }
}
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10)
}

// ── Buyer Pack access ───────────────────────────────────────────────────────────────────────────────
export const BUYER_PACK_FORMAT_VERSION = 1
export interface BuyerPackPolicy { accessRequired: boolean; price: number | null; currency: string | null }
export interface BuyerPackAccessRow { status: string; basis: string | null; format_version: number; expires_at: string | null }

/** May this person download the pack? Open until the founder approves paid access; then a recorded grant for THIS development and format is needed. */
export function buyerPackDecision(policy: BuyerPackPolicy, access: BuyerPackAccessRow | null, isAdmin: boolean, now: Date = new Date()): { allowed: boolean; reason: 'open' | 'admin' | 'granted' | 'access_required' | 'pending' | 'revoked' | 'expired' | 'format_changed' } {
  if (isAdmin) return { allowed: true, reason: 'admin' }
  if (!policy.accessRequired) return { allowed: true, reason: 'open' }
  if (!access) return { allowed: false, reason: 'access_required' }
  if (access.status === 'requested') return { allowed: false, reason: 'pending' }
  if (access.status === 'revoked') return { allowed: false, reason: 'revoked' }
  if (access.format_version !== BUYER_PACK_FORMAT_VERSION) return { allowed: false, reason: 'format_changed' }
  if (access.expires_at && new Date(access.expires_at) < now) return { allowed: false, reason: 'expired' }
  return { allowed: access.status === 'granted', reason: 'granted' }
}