// lib/deal-room.ts
//
// Pure logic for the MANOP Deal Room: introduction milestones, who may
// do what to them, how a milestone's confirmation status is DERIVED, and
// whether the recorded facts are enough to treat a fee as a candidate.
//
// No I/O in this file on purpose — the API route (app/api/deal-room),
// DealRoomPanel and tests/deal-room.test.ts all import the same rules, so
// what the UI offers, what the server accepts and what the tests prove
// cannot drift apart.
//
// Design rules (from the Deal Room brief):
//  - lead_milestones is APPEND-ONLY. A correction is a new row, never an
//    edit, so the audit trail can't be rewritten after the fact.
//  - A self-reported milestone is never presented as verified. Status
//    comes from who has said what; silence is never confirmation.
//  - MANOP records milestones needed to administer its own commercial
//    agreement. It does not track the buyer's instalment schedule.
//  - No commission rate or legal trigger is hardcoded here.

export type Party = 'buyer' | 'developer' | 'agency' | 'landowner' | 'buyer_agent' | 'admin' | 'system'
export type Side = 'buyer' | 'seller'

export const MILESTONES = [
  'introduction_created',
  'introduction_acknowledged',
  'information_supplied',
  'viewing_arranged',
  'viewing_completed',
  'offer_submitted',
  'agreement_executed',
  'qualifying_payment_reported',
  'outcome_confirmed',
  'outcome_cancelled',
  'repeat_enquiry_received',
  'responsible_party_recorded',
  'agency_representation_requested',
  'agency_representation_accepted',
  'agency_representation_rejected',
  'agency_representation_ended',
] as const
export type Milestone = typeof MILESTONES[number]

export const ACTIONS = ['report', 'confirm', 'dispute', 'evidence', 'retract', 'request_confirmation'] as const
export type Action = typeof ACTIONS[number]

export const MILESTONE_LABEL: Record<Milestone, string> = {
  introduction_created: 'Introduction created',
  introduction_acknowledged: 'Introduction acknowledged',
  information_supplied: 'Information supplied',
  viewing_arranged: 'Viewing or site visit arranged',
  viewing_completed: 'Viewing or site visit completed',
  offer_submitted: 'Offer or reservation submitted',
  agreement_executed: 'Purchase agreement reported as executed',
  qualifying_payment_reported: 'Qualifying payment reported',
  outcome_confirmed: 'Transaction outcome confirmed',
  outcome_cancelled: 'Transaction cancelled',
  repeat_enquiry_received: 'Repeat enquiry received',
  responsible_party_recorded: 'Responsible party recorded by MANOP',
  agency_representation_requested: 'Agency asked to represent the buyer',
  agency_representation_accepted: 'Agency representation accepted',
  agency_representation_rejected: 'Agency representation rejected',
  agency_representation_ended: 'Agency representation revoked or withdrawn',
}

// Milestones only the platform itself may write (never via the API).
export const SYSTEM_ONLY: Milestone[] = [
  'introduction_created', 'repeat_enquiry_received', 'responsible_party_recorded',
  'agency_representation_requested', 'agency_representation_accepted', 'agency_representation_rejected', 'agency_representation_ended',
]

// Order used for the timeline and for the "what comes next" hint.
export const TIMELINE_ORDER: Milestone[] = [
  'introduction_created', 'introduction_acknowledged', 'information_supplied',
  'viewing_arranged', 'viewing_completed', 'offer_submitted',
  'agreement_executed', 'qualifying_payment_reported',
  'outcome_confirmed', 'outcome_cancelled',
]

// CANDIDATE qualifying trigger — "binding purchase agreement executed plus an
// agreed initial payment". The brief is explicit that this is a candidate
// model, not an approved universal rule. Kept as data, not logic, so the
// founder's final decision changes one constant.
export const QUALIFYING_MILESTONES: Milestone[] = ['agreement_executed', 'qualifying_payment_reported']

// The commercial terms version a developer/agency would accept on
// acknowledgement. null = no terms have been activated, which is the honest
// state until the founder and a lawyer approve actual wording. While null the
// UI says so and an acknowledgement is receipt-only — it is never recorded as
// acceptance of fee terms that do not exist.
export const ACTIVE_COMMERCIAL_TERMS_VERSION: string | null = null

export interface MilestoneRow {
  id: string
  lead_id: string
  milestone: Milestone
  action: Action
  party_role: Party
  actor_user_id: string | null
  event_date: string | null
  evidence_ref: string | null
  note: string | null
  target_id: string | null
  created_at: string
}

export function sideOf(party: Party): Side | null {
  // An accepted buyer's agent speaks for the buyer side of the deal.
  if (party === 'buyer' || party === 'buyer_agent') return 'buyer'
  if (party === 'developer' || party === 'agency' || party === 'landowner') return 'seller'
  return null
}

// What each party may report themselves. A buyer cannot report the developer's
// acknowledgement; a developer cannot report the buyer's cancellation; admin
// only records outcomes after resolving a discrepancy.
const REPORTABLE: Record<Exclude<Party, 'system'>, Milestone[]> = {
  buyer: [
    'information_supplied', 'viewing_arranged', 'viewing_completed', 'offer_submitted',
    'agreement_executed', 'qualifying_payment_reported', 'outcome_cancelled',
  ],
  developer: [
    'introduction_acknowledged', 'information_supplied', 'viewing_arranged', 'viewing_completed',
    'offer_submitted', 'agreement_executed', 'qualifying_payment_reported',
    'outcome_confirmed', 'outcome_cancelled',
  ],
  agency: [
    'introduction_acknowledged', 'information_supplied', 'viewing_arranged', 'viewing_completed',
    'offer_submitted', 'agreement_executed', 'qualifying_payment_reported',
    'outcome_confirmed', 'outcome_cancelled',
  ],
  // A landowner is the seller on a site/land/JV/redevelopment introduction. Participation is not
  // payment responsibility: see resolveResponsibleParty in lib/deal-room-access.ts.
  landowner: [
    'introduction_acknowledged', 'information_supplied', 'viewing_arranged', 'viewing_completed',
    'offer_submitted', 'agreement_executed', 'qualifying_payment_reported',
    'outcome_confirmed', 'outcome_cancelled',
  ],
  // A buyer's agent acts only for the buyer it represents and reports what the buyer may report.
  buyer_agent: [
    'information_supplied', 'viewing_arranged', 'viewing_completed', 'offer_submitted',
    'agreement_executed', 'qualifying_payment_reported', 'outcome_cancelled',
  ],
  admin: ['outcome_confirmed', 'outcome_cancelled'],
}

export function canPerform(party: Party, action: Action, milestone: Milestone): { ok: boolean; reason?: string } {
  if (party === 'system') return { ok: false, reason: 'The platform writes its own events; they cannot be submitted.' }
  if (SYSTEM_ONLY.includes(milestone)) return { ok: false, reason: 'That event is recorded by MANOP automatically.' }

  if (action === 'report') {
    return REPORTABLE[party].includes(milestone)
      ? { ok: true }
      : { ok: false, reason: `${party} cannot report "${MILESTONE_LABEL[milestone]}".` }
  }
  if (action === 'confirm' || action === 'dispute') {
    // introduction_acknowledged is a receipt by the seller side; nothing for
    // the buyer to dispute.
    if (milestone === 'introduction_acknowledged' && party === 'buyer') {
      return { ok: false, reason: 'Acknowledgement is the receiving party’s own statement.' }
    }
    return { ok: true } // state check (is there something from the other side?) happens in validateAction
  }
  // evidence / retract / request_confirmation — any real party may attempt;
  // the target/ownership checks are in validateAction.
  return { ok: true }
}

// ─── Derived state ───────────────────────────────────────────────────────

export type MilestoneStatus =
  | 'not_reported'
  | 'reported_by_buyer'
  | 'reported_by_developer'   // developer or authorised agency
  | 'reported_by_admin'
  | 'confirmed_by_both'
  | 'admin_resolved'
  | 'disputed'

export const STATUS_LABEL: Record<MilestoneStatus, string> = {
  not_reported: 'Not reported',
  reported_by_buyer: 'Reported by buyer — awaiting developer/agency',
  reported_by_developer: 'Reported by developer/agency — awaiting buyer',
  reported_by_admin: 'Recorded by MANOP',
  confirmed_by_both: 'Confirmed by both parties',
  admin_resolved: 'Resolved by MANOP',
  disputed: 'Disputed',
}

export interface MilestoneState {
  milestone: Milestone
  status: MilestoneStatus
  eventDate: string | null
  evidenceCount: number
  confirmationRequested: boolean
  lastActivityAt: string | null
  liveReportIds: string[]
}

export function deriveStates(rows: MilestoneRow[]): Record<string, MilestoneState> {
  const byMilestone = new Map<Milestone, MilestoneRow[]>()
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) {
    if (!byMilestone.has(r.milestone)) byMilestone.set(r.milestone, [])
    byMilestone.get(r.milestone)!.push(r)
  }

  const out: Record<string, MilestoneState> = {}
  byMilestone.forEach((list, milestone) => {
    let live: { id: string; side: Side | 'admin'; date: string | null }[] = []
    let confirmSides = new Set<Side>()
    let disputed = false
    let disputedBy: Side | 'admin' | null = null
    let adminResolved = false
    let evidenceCount = 0
    let requested = false

    for (const r of list) {
      const side: Side | 'admin' | null = r.party_role === 'admin' ? 'admin' : sideOf(r.party_role)
      switch (r.action) {
        case 'report':
          if (!side) break
          if (disputed) {
            // A correction after a dispute: the corrected statement stands alone
            // and must be confirmed again — a correction is not an agreement.
            disputed = false; disputedBy = null; adminResolved = false
            confirmSides = new Set(); live = live.filter(l => l.side === side)
          }
          live.push({ id: r.id, side, date: r.event_date })
          requested = false
          break
        case 'confirm':
          if (!side) break
          if (side === 'admin') { adminResolved = true; disputed = false; disputedBy = null }
          else {
            confirmSides.add(side)
            if (disputedBy === side) { disputed = false; disputedBy = null }
          }
          requested = false
          break
        case 'dispute':
          if (!side) break
          disputed = true; disputedBy = side; adminResolved = false
          break
        case 'evidence':
          evidenceCount += 1
          break
        case 'retract':
          live = live.filter(l => l.id !== r.target_id)
          break
        case 'request_confirmation':
          requested = true
          break
      }
    }

    const sides = new Set<Side>()
    live.forEach(l => { if (l.side !== 'admin') sides.add(l.side as Side) })
    confirmSides.forEach(s => sides.add(s))
    const adminReported = live.some(l => l.side === 'admin')

    let status: MilestoneStatus = 'not_reported'
    if (disputed) status = 'disputed'
    else if (adminResolved) status = 'admin_resolved'
    else if (sides.has('buyer') && sides.has('seller')) status = 'confirmed_by_both'
    else if (sides.has('buyer')) status = 'reported_by_buyer'
    else if (sides.has('seller')) status = 'reported_by_developer'
    else if (adminReported) status = 'reported_by_admin'

    const latestLive = live.length ? live[live.length - 1] : null
    out[milestone] = {
      milestone,
      status,
      eventDate: latestLive?.date ?? null,
      evidenceCount,
      confirmationRequested: requested && (status === 'reported_by_buyer' || status === 'reported_by_developer'),
      lastActivityAt: list[list.length - 1].created_at,
      liveReportIds: live.map(l => l.id),
    }
  })
  return out
}

// ─── Server-side validation of a proposed action ─────────────────────────

export interface ProposedAction {
  party: Party
  actorUserId: string
  action: Action
  milestone: Milestone
  targetId?: string | null
}

// Returns an error string or null. Pure: the caller passes the rows it loaded.
export function validateAction(p: ProposedAction, rows: MilestoneRow[]): string | null {
  const perm = canPerform(p.party, p.action, p.milestone)
  if (!perm.ok) return perm.reason || 'Not permitted.'

  const states = deriveStates(rows)
  const st = states[p.milestone]
  const mySide: Side | 'admin' | null = p.party === 'admin' ? 'admin' : sideOf(p.party)

  if (p.action === 'report') {
    if (st && st.status === 'disputed') return null // correcting a disputed report is allowed
    return null
  }

  if (p.action === 'confirm' || p.action === 'dispute') {
    if (!st || st.status === 'not_reported') return 'Nothing has been reported for that milestone yet.'
    if (p.party === 'admin') return null
    const otherSideReported = rows.some(r =>
      r.milestone === p.milestone && r.action === 'report' && sideOf(r.party_role) !== null &&
      sideOf(r.party_role) !== mySide && st.liveReportIds.includes(r.id))
    if (!otherSideReported && p.action === 'confirm') return 'There is no report from the other party to confirm.'
    if (!otherSideReported && p.action === 'dispute') return 'There is no report from the other party to dispute.'
    return null
  }

  if (p.action === 'evidence') {
    if (!st || st.status === 'not_reported') return 'Attach evidence to a milestone that has been reported.'
    return null
  }

  if (p.action === 'retract') {
    const target = rows.find(r => r.id === p.targetId)
    if (!target) return 'The entry you are correcting was not found.'
    if (target.action !== 'report') return 'Only a reported milestone can be retracted.'
    if (target.actor_user_id !== p.actorUserId) return 'You can only retract your own report.'
    if (!st || !st.liveReportIds.includes(target.id)) return 'That report has already been retracted.'
    return null
  }

  if (p.action === 'request_confirmation') {
    if (!st || (st.status !== 'reported_by_buyer' && st.status !== 'reported_by_developer')) {
      return 'Confirmation can only be requested while one party’s report is waiting for the other.'
    }
    return null
  }
  return 'Unknown action.'
}

// ─── Fee readiness — an INDICATOR for admin, never an automatic charge ───

export type FeeReadiness = 'not_yet_due' | 'awaiting_confirmation' | 'candidate_due' | 'disputed' | 'cancelled_or_adjusted'

export interface FeeAssessment {
  state: FeeReadiness
  termsActive: boolean
  explanation: string
}

const ESTABLISHED: MilestoneStatus[] = ['confirmed_by_both', 'admin_resolved']

// Deliberately does not write fee_status or compute an amount. It says whether
// the recorded milestone facts are sufficient to put the introduction in front
// of an admin as a candidate for a fee, under the CANDIDATE trigger above.
// Whether a fee is actually due is decided under agreed terms, by a person.
export function assessFeeReadiness(
  states: Record<string, MilestoneState>,
  termsVersion: string | null = ACTIVE_COMMERCIAL_TERMS_VERSION,
  // The trigger belongs to the ACCEPTED AGREEMENT (its qualifying_milestones snapshot). The default stays the conservative pair until a
  // terms version approving a different trigger is accepted; callers that hold the agreement pass its list here.
  qualifying: Milestone[] = QUALIFYING_MILESTONES,
): FeeAssessment {
  const termsActive = !!termsVersion
  const st = (m: Milestone) => states[m]?.status ?? 'not_reported'

  if (ESTABLISHED.includes(st('outcome_cancelled'))) {
    return { state: 'cancelled_or_adjusted', termsActive, explanation: 'The transaction is recorded as cancelled. Any fee needs to be reviewed for adjustment.' }
  }
  if (qualifying.some(m => st(m) === 'disputed')) {
    return { state: 'disputed', termsActive, explanation: 'A qualifying milestone is disputed. It needs resolving before a fee can be considered.' }
  }
  const established = qualifying.every(m => ESTABLISHED.includes(st(m)))
  if (established) {
    return {
      state: 'candidate_due', termsActive,
      explanation: termsActive
        ? 'The qualifying milestone(s) are confirmed. An admin can now assess the fee under the accepted terms.'
        : 'The qualifying milestone(s) are confirmed, but no commercial terms have been activated, so no fee agreement exists to apply.',
    }
  }
  const anyReported = qualifying.some(m => st(m) !== 'not_reported')
  if (anyReported) {
    return { state: 'awaiting_confirmation', termsActive, explanation: 'A qualifying milestone has been reported but is not yet confirmed by both parties.' }
  }
  return { state: 'not_yet_due', termsActive, explanation: 'No qualifying milestone has been reported.' }
}

// ─── Duplicate detection ─────────────────────────────────────────────────

export interface LeadIdentity {
  user_id?: string | null
  email?: string | null
  phone?: string | null
}

export function normalisePhone(p?: string | null): string | null {
  if (!p) return null
  const digits = p.replace(/[^\d+]/g, '')
  return digits.length >= 7 ? digits : null
}

// Two enquiries describe the same person if they share an account, an email
// (case-insensitive) or a phone number (formatting ignored). This only flags a
// likely duplicate so one introduction is kept per person per development — it
// is not used to infer anything about anyone's off-platform contact.
export function isSamePerson(a: LeadIdentity, b: LeadIdentity): boolean {
  if (a.user_id && b.user_id && a.user_id === b.user_id) return true
  const ea = a.email?.trim().toLowerCase(), eb = b.email?.trim().toLowerCase()
  if (ea && eb && ea === eb) return true
  const pa = normalisePhone(a.phone), pb = normalisePhone(b.phone)
  if (pa && pb && pa === pb) return true
  return false
}

// The stages developer_leads actually allows (its live CHECK constraint
// developer_leads_stage_check). Every dashboard must offer exactly these.
export const LEAD_STAGES = ['enquiry', 'qualified', 'viewing', 'offer', 'reservation', 'financing', 'transaction', 'completed', 'lost'] as const
export const CLOSED_STAGES: string[] = ['completed', 'lost']

// ─── Stage changes (server-side only) ────────────────────────────────────

// Stages the seller side may set directly. 'transaction' and 'completed' are
// consequences of established milestones, never a bare claim.
const SELLER_STAGES = ['qualified', 'viewing', 'offer', 'reservation', 'financing', 'lost']
const ESTABLISHED_STATUS: MilestoneStatus[] = ['confirmed_by_both', 'admin_resolved']

export interface StageChangeInput {
  party: Party
  from: string
  to: string
  states: Record<string, MilestoneState>
  note?: string | null
}

/**
 * Returns an error string or null. Pure. Moving a stage never charges a fee,
 * proves payment or records an agreement as executed — it only changes the
 * pipeline label, and the sensitive stages require the matching milestone to
 * be established first (or an admin override with a recorded reason).
 */
export function validateStageChange(p: StageChangeInput): string | null {
  if (!(LEAD_STAGES as readonly string[]).includes(p.to)) return 'That is not a valid stage.'
  if (p.from === p.to) return 'The introduction is already at that stage.'
  if (p.party === 'buyer' || p.party === 'system') return 'Only the developer, agency, landowner or MANOP can change the stage.'
  const established = (m: Milestone) => ESTABLISHED_STATUS.includes(p.states[m]?.status as MilestoneStatus)
  const closed = CLOSED_STAGES.includes(p.from)

  if (p.party === 'admin') {
    if (closed && !(p.note ?? '').trim()) return 'Reopening a closed introduction needs a recorded reason.'
    if (p.to === 'transaction' && !established('agreement_executed') && !(p.note ?? '').trim()) return 'No confirmed agreement milestone exists. Record why you are overriding.'
    if (p.to === 'completed' && !established('outcome_confirmed') && !(p.note ?? '').trim()) return 'No confirmed outcome exists. Record why you are overriding.'
    return null
  }
  if (closed) return 'This introduction is closed. Ask MANOP to reopen it.'
  if (!SELLER_STAGES.includes(p.to)) {
    return p.to === 'transaction'
      ? 'Move to "transaction" after the agreement milestone is confirmed by both parties; MANOP records it.'
      : 'MANOP records the "completed" stage once the outcome is confirmed.'
  }
  return null
}

export const SOURCE_KINDS = ['development', 'site', 'general'] as const
export type SourceKind = typeof SOURCE_KINDS[number]