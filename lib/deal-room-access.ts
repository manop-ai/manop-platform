// lib/deal-room-access.ts
//
// Pure rules for WHO a caller is on an introduction and WHO is responsible
// to MANOP. No I/O: the API routes load the facts from the database, these
// functions decide, and tests/deal-room-access.test.ts proves the rules.
//
// Principles (from the founder's commercial brief):
//  - Authority comes from facts MANOP holds (ownership of the opportunity, a
//    mandate on file), never from the request body, user_metadata, or the
//    fact that an account pays an Agency Subscription Fee. A subscription is
//    not authority to act for a developer or landowner.
//  - Acknowledging an introduction never makes the acknowledger the payer.
//  - Responsibility for MANOP's success fee comes from an EXECUTED agreement
//    (owned by the Commercial/Documents workstream). Until one identifies the
//    payer, it is "unresolved" — an admin may record a decision with a reason.

import type { Party } from './deal-room'

export interface OpportunityFacts {
  kind: 'project' | 'site' | 'general'
  developer_id: string | null
  submitting_agency_id: string | null
  /** sites.submitted_by_user_id when entry_source = 'landowner' */
  landowner_user_id: string | null
  mandate_document_url: string | null
  /** MANOP has reviewed and published the development/site */
  published: boolean
}

export interface CallerFacts {
  userId: string
  isAdmin: boolean
  developerAccountId: string | null
  agencyId: string | null
  /** true only when this caller's agency holds an ACCEPTED, unexpired authorization for this lead and is still approved + subscribed (decided on the server) */
  buyerAgentGranted?: boolean
}

export interface PartyResolution {
  party: Party | null
  /** why no party was granted (shown to the caller) */
  reason?: string
}

/** The facts about a lead that decide who may see it. */
export interface LeadFacts {
  user_id: string | null
  developer_id: string | null
  /** set at creation (sql/phase14): where the introduction was routed */
  routing_status?: string | null
  /** set when MANOP routes the introduction to the developer/partner in charge (the column is named 'referred' since phase15) */
  referred_to_developer_at?: string | null
  /** set at creation (sql/phase28) on every development/site introduction: nobody on the seller side sees it until MANOP routes it */
  manop_routing_required?: boolean | null
}

/**
 * Every new development or site introduction is held by MANOP until an admin ROUTES it to the developer or partner in charge.
 * (Older introductions, and ones MANOP held because the development had no claimed account, follow the earlier rules.)
 * A developer who later claims an account does NOT thereby gain a held introduction. Until it is routed, only the buyer and MANOP see it.
 * Once routed, the partner sees the details and ACKNOWLEDGES (approves) the introduction in the Deal Room; acknowledging is receipt only.
 * Leads without a recorded routing (created before phase 14) keep their earlier behaviour.
 */
export const heldByManop = (l: LeadFacts) => (l.routing_status === 'manop_operator' || l.manop_routing_required === true) && !l.referred_to_developer_at

export function resolveParty(lead: LeadFacts, opp: OpportunityFacts, c: CallerFacts): PartyResolution {
  if (lead.user_id && lead.user_id === c.userId) return { party: 'buyer' }
  if (c.isAdmin) return { party: 'admin' }

  const held = heldByManop(lead)
  if (held && (c.developerAccountId || c.agencyId || c.buyerAgentGranted || (opp.landowner_user_id && opp.landowner_user_id === c.userId))) {
    return { party: null, reason: 'MANOP is reviewing this introduction and has not routed it yet.' }
  }
  const ownerDev = opp.developer_id ?? lead.developer_id
  if (c.developerAccountId && ownerDev && c.developerAccountId === ownerDev) return { party: 'developer' }

  if (opp.landowner_user_id && opp.landowner_user_id === c.userId) return { party: 'landowner' }

  if (c.agencyId && opp.submitting_agency_id && c.agencyId === opp.submitting_agency_id) {
    // Being the submitting agency is not enough on its own: a mandate must be on file.
    if (!opp.mandate_document_url) return { party: null, reason: 'No mandate is on file for this opportunity, so the agency cannot act on it yet.' }
    if (!opp.published) return { party: null, reason: 'This opportunity has not been reviewed and published by MANOP.' }
    return { party: 'agency' }
  }
  if (c.buyerAgentGranted) return { party: 'buyer_agent' }
  return { party: null, reason: 'You are not a party to this introduction.' }
}

// ─── Responsible party ───────────────────────────────────────────────────

export type PayerParty = 'developer' | 'agency'

export interface CoveringAgreement {
  id: string
  /** must be an executed agreement; anything else is ignored */
  status: string
  /** who the executed agreement says pays MANOP's success fee, if it says */
  fee_payer: PayerParty | null
}

export interface ResponsibleResolution {
  party: PayerParty | null
  source: 'existing' | 'agreement' | 'admin_decision' | 'unresolved'
  reason: string
}

export function resolveResponsibleParty(i: {
  existing: PayerParty | null
  covering: CoveringAgreement | null
}): ResponsibleResolution {
  if (i.existing) return { party: i.existing, source: 'existing', reason: 'Already recorded; it is never overwritten by a later acknowledgement.' }
  if (i.covering && i.covering.status === 'executed') {
    if (i.covering.fee_payer === 'developer' || i.covering.fee_payer === 'agency') {
      return { party: i.covering.fee_payer, source: 'agreement', reason: `Identified by executed agreement ${i.covering.id}.` }
    }
    return { party: null, source: 'unresolved', reason: 'The executed agreement does not name a paying party.' }
  }
  return { party: null, source: 'unresolved', reason: 'No executed agreement covers this introduction, so no party is recorded as responsible.' }
}

/** Admin may record a decision only with a reason; never both parties, never an unknown value. */
export function validateAdminResponsibility(party: unknown, reason: unknown, existing: PayerParty | null): string | null {
  if (party !== 'developer' && party !== 'agency') return 'Responsible party must be "developer" or "agency".'
  if (typeof reason !== 'string' || reason.trim().length < 10) return 'Record the reason for this decision (at least a short sentence).'
  if (existing && existing !== party) return 'A different responsible party is already recorded. Resolve it with a documented correction, not an overwrite.'
  return null
}

// ─── Referral to the developer ───────────────────────────────────────────

/**
 * An admin hands a MANOP-held introduction to the developer. Allowed only when the developer has an
 * account that someone actually holds, the buyer agreed to their details being shared with the
 * developer, and it has not been referred already. Returns a refusal reason, or null if allowed.
 * Referring is a MANOP decision recorded with who and when; it is not an agreement and not a fee event.
 */
export function validateReferral(i: {
  party: string | null
  lead: { developer_id: string | null; project_id?: string | null; attribution_acknowledged_at?: string | null; referred_to_developer_at?: string | null }
  developerClaimed: boolean
}): string | null {
  if (i.party !== 'admin') return 'Only MANOP admin can refer an introduction to the developer.'
  if (!i.lead.project_id) return 'Only development introductions can be referred to a developer.'
  if (!i.lead.developer_id) return 'This development has no developer account to refer to.'
  if (i.lead.referred_to_developer_at) return 'This introduction has already been referred to the developer.'
  if (!i.developerClaimed) return 'The developer has not claimed their account yet, so there is nobody to refer this to. MANOP keeps it.'
  if (!i.lead.attribution_acknowledged_at) return 'The buyer has not agreed to their details being shared with the developer, so it cannot be referred.'
  return null
}


// ─── Routing (MANOP sends a held introduction to the partner in charge) ───────────────────────────────────

export type RouteRecipient = 'developer' | 'agency' | 'landowner'
/** Who would receive it, from facts about the opportunity (never from the request body). Null = nobody can receive it yet, so MANOP keeps it. */
export function routeRecipient(i: { developerClaimed: boolean; opp: OpportunityFacts }): RouteRecipient | null {
  if (i.opp.developer_id && i.developerClaimed) return 'developer'
  if (i.opp.submitting_agency_id && i.opp.mandate_document_url && i.opp.kind !== 'general') return 'agency'
  if (i.opp.landowner_user_id) return 'landowner'
  return null
}

/** Returns a refusal reason, or null if the admin may route it now. Routing is a MANOP decision: not an agreement, not a fee event. */
export function validateRouting(i: {
  party: string | null
  lead: { project_id?: string | null; site_id?: string | null; attribution_acknowledged_at?: string | null; referred_to_developer_at?: string | null }
  recipient: RouteRecipient | null
}): string | null {
  if (i.party !== 'admin') return 'Only MANOP admin can route an introduction.'
  if (!i.lead.project_id && !i.lead.site_id) return 'A general enquiry has no developer or partner to route to. MANOP handles it.'
  if (i.lead.referred_to_developer_at) return 'This introduction has already been routed.'
  if (!i.lead.attribution_acknowledged_at) return 'The enquirer has not given consent to share their details, so it cannot be routed.'
  if (!i.recipient) return 'Nobody can receive this yet (no claimed developer account, no submitting agency with a mandate on file, no landowner). MANOP keeps it.'
  return null
}