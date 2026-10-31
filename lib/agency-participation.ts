// lib/agency-participation.ts
//
// Pure rules for the simple, controlled agency participation model:
//
//   registration -> MANOP approval -> active Agency Subscription ->
//   (per deal) representative letter -> listing party accepts -> access.
//
// Each step is a SEPARATE fact. A registration form, a payment, an uploaded letter
// or user-editable metadata never proves approval or deal authorization. Nothing in
// this file creates, assigns or implies commission: commission is a matter between
// the parties under their own agreement, recorded elsewhere (Commercial/Documents).
//
// No I/O here. The API routes load the facts; these functions decide; the tests prove them.

import type { Party } from './deal-room'

/** data_partners.verification_status values that mean "approved by MANOP". Admin sets this on /admin/verification. */
export const AGENCY_APPROVED_STATUSES = ['approved']

export type AuthorizationStatus = 'requested' | 'accepted' | 'rejected' | 'revoked' | 'withdrawn'
export const AUTHORIZATION_STATUSES: AuthorizationStatus[] = ['requested', 'accepted', 'rejected', 'revoked', 'withdrawn']
export const AUTHORIZATION_LABEL: Record<AuthorizationStatus, string> = {
  requested: 'Awaiting the listing party’s decision',
  accepted: 'Accepted',
  rejected: 'Rejected',
  revoked: 'Revoked',
  withdrawn: 'Withdrawn by the agency',
}

export interface SubscriptionFacts {
  /** 'pending_payment' | 'active' | 'expired' | 'suspended' (Commercial/Documents owns this record) */
  status: string | null
  starts_at: string | null
  expires_at: string | null
}
export interface AgencyStanding {
  /** data_partners.verification_status, as MANOP recorded it */
  verification_status: string | null
  subscription: SubscriptionFacts | null
}

export type EligibilityCode =
  | 'ok' | 'not_approved' | 'no_subscription' | 'subscription_not_active' | 'subscription_not_started' | 'subscription_expired'

export interface Eligibility { ok: boolean; code: EligibilityCode; reason: string }

export function assessAgencyEligibility(s: AgencyStanding, now: Date = new Date()): Eligibility {
  if (!s.verification_status || !AGENCY_APPROVED_STATUSES.includes(s.verification_status)) {
    return { ok: false, code: 'not_approved', reason: 'Your agency has not been approved by MANOP yet.' }
  }
  const sub = s.subscription
  if (!sub) return { ok: false, code: 'no_subscription', reason: 'An active Agency Subscription is required to take part in deals.' }
  if (sub.status !== 'active') return { ok: false, code: 'subscription_not_active', reason: 'Your Agency Subscription is not active.' }
  if (sub.starts_at && new Date(sub.starts_at) > now) return { ok: false, code: 'subscription_not_started', reason: 'Your Agency Subscription has not started yet.' }
  // An active subscription must carry an expiry: open-ended access is never assumed.
  if (!sub.expires_at || new Date(sub.expires_at) <= now) return { ok: false, code: 'subscription_expired', reason: 'Your Agency Subscription has expired.' }
  return { ok: true, code: 'ok', reason: '' }
}

// ─── Requesting to represent a buyer ─────────────────────────────────────

export interface RequestInput {
  requestingAgencyId: string
  /** the original listing agency for this opportunity, if the listing party is an agency */
  listingAgencyId: string | null
  standing: AgencyStanding
  opportunityPublished: boolean
  letterRef: string | null | undefined
  buyerName: string | null | undefined
  buyerEmail: string | null | undefined
  buyerPhone: string | null | undefined
  buyerConsentConfirmed: boolean
  now?: Date
}

/** Returns an error message, or null when the agency may submit this request. */
export function validateRepresentationRequest(i: RequestInput): string | null {
  const e = assessAgencyEligibility(i.standing, i.now)
  if (!e.ok) return e.reason
  if (!i.opportunityPublished) return 'This opportunity is not available.'
  if (i.listingAgencyId && i.listingAgencyId === i.requestingAgencyId) {
    return 'Your agency is the listing agent for this opportunity, so it does not need to request representation.'
  }
  if (!(i.letterRef ?? '').trim()) return 'Attach your agency representative letter for this buyer.'
  if (!(i.buyerName ?? '').trim()) return 'Enter the buyer’s name.'
  if (!(i.buyerEmail ?? '').trim() && !(i.buyerPhone ?? '').trim()) return 'Enter the buyer’s phone or email.'
  if (!i.buyerConsentConfirmed) return 'Confirm that the buyer has authorised you to introduce them to MANOP and the listing party.'
  return null
}

// ─── Does an authorization grant access RIGHT NOW? ───────────────────────

export interface AuthorizationFacts {
  status: AuthorizationStatus
  agency_id: string
  expires_at: string | null
}

/**
 * Access is the conjunction of ALL of: the authorization was accepted, has not been
 * revoked/withdrawn/rejected, has not expired, AND the agency is still approved and
 * subscribed today. Losing any one of them removes access immediately.
 */
export function authorizationGrantsAccess(a: AuthorizationFacts | null, callerAgencyId: string | null, standing: AgencyStanding, now: Date = new Date()): boolean {
  if (!a || !callerAgencyId || a.agency_id !== callerAgencyId) return false
  if (a.status !== 'accepted') return false
  if (a.expires_at && new Date(a.expires_at) <= now) return false
  return assessAgencyEligibility(standing, now).ok
}

// ─── Decisions ───────────────────────────────────────────────────────────

export type Decision = 'accept' | 'reject' | 'revoke' | 'withdraw'
/** Parties allowed to decide: the listing side of the opportunity, or MANOP admin. Never the requesting agency, never the buyer. */
const DECIDERS: Party[] = ['developer', 'agency', 'landowner', 'admin']

export interface DecisionInput {
  decision: Decision
  /** the caller's role on the introduction as resolved from database facts ('buyer_agent' is never a decider) */
  party: Party | null
  callerAgencyId: string | null
  authorization: AuthorizationFacts
  note?: string | null
  expiresAt?: string | null
  now?: Date
}

export function validateDecision(i: DecisionInput): string | null {
  const a = i.authorization
  const now = i.now ?? new Date()
  const isRequester = !!i.callerAgencyId && i.callerAgencyId === a.agency_id

  if (i.decision === 'withdraw') {
    if (!isRequester) return 'Only the requesting agency can withdraw its own request.'
    if (a.status !== 'requested' && a.status !== 'accepted') return 'This request is already closed.'
    return null
  }

  // accept / reject / revoke
  if (isRequester) return 'An agency cannot decide on its own request.'
  if (!i.party || !DECIDERS.includes(i.party)) return 'Only the listing party or MANOP can decide on this request.'

  if (i.decision === 'accept' || i.decision === 'reject') {
    if (a.status !== 'requested') return 'This request has already been decided.'
  }
  if (i.decision === 'revoke' && a.status !== 'accepted') return 'Only an accepted authorization can be revoked.'
  if ((i.decision === 'reject' || i.decision === 'revoke') && (i.note ?? '').trim().length < 5) {
    return 'Record the reason for this decision.'
  }
  if (i.decision === 'accept' && i.expiresAt) {
    const d = new Date(i.expiresAt)
    if (Number.isNaN(d.getTime()) || d <= now) return 'The expiry date must be in the future.'
  }
  return null
}

export const DECISION_RESULT: Record<Exclude<Decision, 'withdraw'> | 'withdraw', AuthorizationStatus> = {
  accept: 'accepted', reject: 'rejected', revoke: 'revoked', withdraw: 'withdrawn',
}

// ─── Listing party ───────────────────────────────────────────────────────

export interface ListingFacts {
  submitting_agency_id: string | null
  developer_id: string | null
  landowner_user_id: string | null
}
/** Who originally listed the opportunity. An agency listing keeps the developer relationship but the AGENCY is the listing agent. */
export function listingParty(o: ListingFacts): 'agency' | 'developer' | 'landowner' | 'manop' {
  if (o.submitting_agency_id) return 'agency'
  if (o.developer_id) return 'developer'
  if (o.landowner_user_id) return 'landowner'
  return 'manop'
}

// ─── Duplicate listings ──────────────────────────────────────────────────

const STOP = new Set(['the', 'a', 'an', 'by', 'of', 'at', 'estate', 'estates', 'residence', 'residences', 'court', 'phase', 'ph', 'apartments', 'apartment', 'homes', 'gardens', 'towers', 'tower', 'villas', 'villa'])
export function normaliseName(n: string | null | undefined): string {
  return (n ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w)).join(' ')
}
export interface DevelopmentIdentity { id?: string; name: string | null; city?: string | null; neighborhood?: string | null; developer_id?: string | null }

/**
 * Flags a LIKELY duplicate for human review; it never decides. Same normalised name in the
 * same city, or a name that contains the other's (>=2 significant words) with the same
 * neighbourhood. Conservative on purpose: a false flag costs a review, a miss costs a competing listing.
 */
export function likelyDuplicateDevelopment(a: DevelopmentIdentity, b: DevelopmentIdentity): boolean {
  const na = normaliseName(a.name), nb = normaliseName(b.name)
  if (!na || !nb) return false
  const sameCity = !!a.city && !!b.city && a.city.trim().toLowerCase() === b.city.trim().toLowerCase()
  const sameHood = !!a.neighborhood && !!b.neighborhood && a.neighborhood.trim().toLowerCase() === b.neighborhood.trim().toLowerCase()
  if (na === nb && (sameCity || sameHood)) return true
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (sameHood && short.split(' ').length >= 2 && long.includes(short)) return true
  return false
}
