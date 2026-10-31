// lib/agency-commercial.ts
//
// Agency commercial model: two ALTERNATIVE routes, chosen explicitly and recorded.
//   subscription  an Agency Subscription (price/period from the approved terms version; payment and approval are separate admin steps)
//   success_fee   no subscription; MANOP's agency success fee on a qualifying closed transaction, at the AGENCY schedule stored in the
//                 same approved terms version (never copied from the developer schedule, never hard-coded here)
// Pure functions only. Nothing here charges, invoices or marks anything paid; every calculation is non-binding.
//
// NOT DECIDED (so nothing here invents it): what each route includes/excludes (entitlements come from the terms version and a
// route cannot be accepted until they are defined), the treatment of a fee on a later-cancelled deal, and whether legal review must be
// cleared before approval. Each is surfaced as a visible note or blocker rather than assumed.

import { computeSuccessFee, validateFeeSchedule, subscriptionPhase, type FeeSchedule, type SuccessFeeResult } from './commercial-terms'
import { transitionEligibility } from './agency-subscription-request'

export const AGENCY_MODELS = ['subscription', 'success_fee'] as const
export type AgencyModel = (typeof AGENCY_MODELS)[number]
export const AGENCY_MODEL_LABEL: Record<AgencyModel, string> = { subscription: 'Custom Agency Subscription', success_fee: 'Transaction success fee' }

export const ELECTION_STATUSES = ['proposed', 'active', 'ended', 'withdrawn'] as const
export type ElectionStatus = (typeof ELECTION_STATUSES)[number]

export interface Entitlement { includes: string[]; limits: string[]; excludes: string[]; extra_charges: string[] }

export interface AgencyTerms {
  id: string | null
  versionLabel: string | null
  approved: boolean
  effectiveFrom: string | null
  legalReviewStatus: string | null
  subscription: { price: number; currency: string; periodMonths: number } | null
  successFee: { schedule: FeeSchedule; currency: string; payer: string; commitmentMonths: number | null } | null
  entitlements: Partial<Record<AgencyModel, Entitlement>>
}

export interface ElectionRow {
  id: string
  model: AgencyModel
  status: ElectionStatus
  effective_from: string | null
  effective_to: string | null
  subscription_id?: string | null
  commitment_end?: string | null
  early_transition_authorized_at?: string | null
  early_transition_reason?: string | null
}

const clean = (a: unknown): string[] => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()) : [])

/** An entitlement is "defined" only when MANOP has stated at least what is included and at least one limit or exclusion. */
export function validateEntitlement(raw: unknown): { ok: boolean; errors: string[]; value: Entitlement | null } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const v: Entitlement = { includes: clean(o.includes), limits: clean(o.limits), excludes: clean(o.excludes), extra_charges: clean(o.extra_charges) }
  const errors: string[] = []
  if (!v.includes.length) errors.push('State at least one thing the route includes.')
  if (!v.limits.length && !v.excludes.length) errors.push('State at least one limit or exclusion, so the agency sees what it is not getting.')
  return { ok: errors.length === 0, errors, value: errors.length ? null : v }
}

/** Build the agency-facing terms view from a terms-version row. Missing pieces stay null: nothing is assumed. */
export function agencyTermsFromVersion(v: Record<string, any> | null, today: string = new Date().toISOString().slice(0, 10)): AgencyTerms {
  if (!v) return { id: null, versionLabel: null, approved: false, effectiveFrom: null, legalReviewStatus: null, subscription: null, successFee: null, entitlements: {} }
  const sch = v.agency_success_fee_schedule != null ? validateFeeSchedule(v.agency_success_fee_schedule) : null
  const ent: AgencyTerms['entitlements'] = {}
  for (const m of AGENCY_MODELS) { const e = validateEntitlement(v.agency_entitlements?.[m]); if (e.ok && e.value) ent[m] = e.value }
  return {
    id: v.id ?? null, versionLabel: v.version_label ?? null,
    approved: v.status === 'approved' && !!v.effective_from && v.effective_from <= today,
    effectiveFrom: v.effective_from ?? null, legalReviewStatus: v.legal_review_status ?? null,
    subscription: v.agency_subscription_price != null ? { price: Number(v.agency_subscription_price), currency: v.agency_subscription_currency ?? 'NGN', periodMonths: Number(v.agency_subscription_period_months ?? 12) } : null,
    successFee: sch?.ok ? { schedule: sch.schedule, currency: v.fee_currency ?? 'NGN', payer: v.agency_fee_payer ?? 'agency', commitmentMonths: v.agency_success_fee_commitment_months != null ? Number(v.agency_success_fee_commitment_months) : null } : null,
    entitlements: ent,
  }
}

export interface AgencyFacts { active: boolean | null | undefined }
export interface SubscriptionFacts { payment_status: string; approval_status: string; activation_status: string; period_start: string | null; period_end: string | null; payment_reference?: string | null }

export interface Eligibility {
  ok: boolean
  reasons: string[]            // why the route cannot be chosen now (empty when ok)
  notes: string[]              // things the agency must be told, even when ok
  effectiveFrom: string | null // the date the route would take effect if accepted today
}

const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const live = (e: ElectionRow) => e.status === 'active' || e.status === 'proposed'

export function eligibilityFor(i: {
  model: AgencyModel; terms: AgencyTerms; agency: AgencyFacts; elections: ElectionRow[]; subscription: SubscriptionFacts | null; today?: string
}): Eligibility {
  const today = i.today ?? new Date().toISOString().slice(0, 10)
  const reasons: string[] = []; const notes: string[] = []
  let effectiveFrom: string | null = today
  if (i.agency.active === false) reasons.push('This agency account is not active.')
  if (!i.terms.approved) reasons.push('MANOP has not yet approved commercial terms for agencies, so no route can be accepted yet.')
  if (i.terms.approved && i.terms.legalReviewStatus !== 'cleared') notes.push('These terms have not been marked as legally reviewed.')
  // Entitlements: the success-fee route needs them defined in the approved terms. A custom subscription's inclusions are stated in the
  // proposal MANOP issues, so it does not wait on a terms-version entitlement text.
  if (i.model === 'success_fee' && !i.terms.entitlements[i.model]) reasons.push(`MANOP has not yet defined what the ${AGENCY_MODEL_LABEL[i.model]} route includes and excludes, so it cannot be accepted yet.`)

  const current = i.elections.find(e => e.status === 'active') ?? null
  const pending = i.elections.find(e => e.status === 'proposed') ?? null
  if (pending && pending.model === i.model) reasons.push('You already have a pending selection of this route.')
  if (current && current.model === i.model) reasons.push('This route is already active for your agency.')

  if (i.model === 'subscription') {
    // There is no universal subscription price: an agency requests a custom proposal. Eligibility here only covers the commitment.
    const t = transitionEligibility(current ? { model: current.model, status: current.status, commitment_end: current.commitment_end ?? null, early_transition_authorized_at: current.early_transition_authorized_at ?? null, early_transition_reason: current.early_transition_reason ?? null } : null, today)
    if (!t.ok && t.reason) reasons.push(t.reason)
    if (current?.model === 'success_fee' && t.ok) notes.push('Your success-fee route stays in force until a custom subscription is accepted, paid, approved and active. It then ends the day before the subscription starts. Fees already triggered stay under the success-fee route.')
  } else {
    if (!i.terms.successFee) reasons.push('The agency success-fee rate has not been approved yet.')
    else if (!i.terms.successFee.commitmentMonths) reasons.push('MANOP has not yet defined the initial commitment period for the success-fee route, so it cannot be accepted yet.')
    const phase = i.subscription ? subscriptionPhase(i.subscription as any, new Date(today + 'T00:00:00Z')) : null
    if (phase === 'active') {
      reasons.push('You have an active Agency Subscription. The success-fee route is not offered while it is active.')
      if (i.subscription?.period_end) { effectiveFrom = addDays(i.subscription.period_end, 1); notes.push(`You can choose the success-fee route for after your subscription ends on ${i.subscription.period_end}.`) }
    }
    if (phase && ['awaiting_payment', 'payment_confirmed_awaiting_approval', 'approved_not_active'].includes(phase)) {
      notes.push('You have an unfinished Agency Subscription request. It cannot be activated while the success-fee route is active.')
    }
  }
  return { ok: reasons.length === 0, reasons, notes, effectiveFrom }
}

/** The election that governs a transaction is the one in force on the date its qualifying event was TRIGGERED, not the date a fee is calculated. */
export function electionCoveringDate(elections: ElectionRow[], date: string): ElectionRow | null {
  const hits = elections.filter(e => (e.status === 'active' || e.status === 'ended') && e.effective_from && e.effective_from <= date && (!e.effective_to || date <= e.effective_to))
  if (hits.length === 0) return null
  hits.sort((a, b) => (b.effective_from as string).localeCompare(a.effective_from as string))
  return hits[0]
}

/** When a new election becomes active, the one it replaces ends the day before. Never edits the past. */
export function endDateForReplaced(newEffectiveFrom: string): string { return addDays(newEffectiveFrom, -1) }

/** What the agency is shown and asked to accept, kept verbatim as acceptance evidence together with the terms snapshot. */
export function buildAcceptanceStatement(model: AgencyModel, terms: AgencyTerms, effectiveFrom: string): string {
  const e = terms.entitlements[model]
  const lines: string[] = [`Route: ${AGENCY_MODEL_LABEL[model]}`, `Commercial terms version: ${terms.versionLabel ?? 'not set'}`, `Takes effect: ${effectiveFrom}`]
  if (model === 'success_fee' && terms.successFee) {
    lines.push(`Rate: ${terms.successFee.schedule.map(t => `${t.rate_pct}%${t.up_to === null ? ' (above the previous limit)' : ` up to and including ${t.up_to.toLocaleString('en-NG')}`}`).join('; ')}, applied to the entire qualifying closed transaction value.`)
    lines.push(`Payer: ${terms.successFee.payer}. No subscription fee applies to this route.`)
    if (terms.successFee.commitmentMonths) lines.push(`Initial commitment: ${terms.successFee.commitmentMonths} months from ${effectiveFrom}. After that you may ask MANOP for a custom subscription; the change is not automatic and needs MANOP\u2019s proposal, your acceptance, verified payment and approval.`)
    lines.push('A fee arises only on a qualifying transaction event under the applicable agreement. Registering, submitting a development, receiving an enquiry or arranging a viewing creates no fee.')
  }
  if (e) { lines.push(`Includes: ${e.includes.join('; ')}`); if (e.limits.length) lines.push(`Limits: ${e.limits.join('; ')}`); if (e.excludes.length) lines.push(`Excludes: ${e.excludes.join('; ')}`); if (e.extra_charges.length) lines.push(`Additional charges: ${e.extra_charges.join('; ')}`) }
  lines.push('This is a record of commercial terms. A fee is calculated only from a qualifying event and is not an invoice until MANOP issues one.')
  return lines.join('\n')
}

/** Agency success fee from the schedule SNAPSHOT of the accepted election. */
export function computeAgencySuccessFee(i: { schedule: unknown; feeCurrency: string; transactionValue: unknown; valueCurrency: string }): SuccessFeeResult {
  return computeSuccessFee({ basis: 'transaction_value', transactionValue: i.transactionValue, valueCurrency: i.valueCurrency, feeCurrency: i.feeCurrency, schedule: i.schedule })
}

// ── Duplicate / double-charge guard ───────────────────────────────────────────────────────────────
export interface ExistingObligation { id: string; status: string; payer: 'developer' | 'agency' | null; development_id: string | null; deal_reference: string | null }

/**
 * May a new fee calculation be recorded for this transaction? One standard obligation per transaction: a second proposed/confirmed/disputed
 * record for the same development and deal reference is refused, and a different payer is refused unless a documented arrangement exists.
 */
export function checkFeeObligation(i: {
  development_id: string | null; deal_reference: string | null; payer: 'developer' | 'agency' | null
  existing: ExistingObligation[]; documentedArrangement?: string | null
}): { ok: boolean; error?: string; supersedes?: string } {
  const same = i.existing.filter(x => x.status !== 'superseded' && (x.development_id ?? null) === (i.development_id ?? null) && (x.deal_reference ?? '') === (i.deal_reference ?? ''))
  if (!same.length) return { ok: true }
  const other = same.find(x => x.payer && i.payer && x.payer !== i.payer)
  if (other && !(i.documentedArrangement ?? '').trim()) return { ok: false, error: 'A fee is already recorded for this transaction against a different paying party. Charging both parties needs a documented, agreed arrangement; record it first.' }
  return { ok: false, error: 'A fee calculation already exists for this transaction. Mark the earlier one as superseded if it is being replaced.', supersedes: same[0].id }
}