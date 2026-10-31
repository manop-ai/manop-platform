// lib/agency-subscription-request.ts
//
// Custom Agency Subscription: request -> assessment -> proposal -> acceptance -> (payment, approval, activation as separate admin steps).
// There is NO universal price. MANOP's administrator assesses each request and issues a proposal; nothing here prices anything.
// Pure rules only (no database), so the business rules are testable. Servers apply them after authorising the caller.
//
// Success-fee commitment: the commitment dates come from the agency's accepted success-fee election (its recorded start date and the
// months in the approved terms version), never from account creation. A transition is not automatic; an early one needs a recorded
// administrator authorisation with a reason.

export const REQUEST_STATUSES = ['requested', 'under_assessment', 'proposal_issued', 'accepted', 'declined', 'expired', 'withdrawn', 'closed'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]
export const OPEN_REQUEST: RequestStatus[] = ['requested', 'under_assessment', 'proposal_issued']

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  requested: 'Request received', under_assessment: 'Being assessed by MANOP', proposal_issued: 'Proposal ready for your decision',
  accepted: 'Proposal accepted', declined: 'Proposal declined', expired: 'Proposal expired', withdrawn: 'Request withdrawn', closed: 'Closed by MANOP',
}
export const REQUEST_NEXT_STEP: Record<RequestStatus, string> = {
  requested: 'MANOP will review your request and may contact you. You can keep completing your profile, verification and development submissions meanwhile.',
  under_assessment: 'MANOP is preparing a proposal for your agency. You can keep completing your profile, verification and development submissions meanwhile.',
  proposal_issued: 'Review the proposal. Accepting it does not activate the subscription: payment must then be confirmed and MANOP must approve it.',
  accepted: 'Follow MANOP’s payment instructions. The subscription is active only after MANOP has confirmed your payment and approved it.',
  declined: 'You declined the proposal. You can send a new request.',
  expired: 'The proposal expired before a decision was recorded. You can send a new request.',
  withdrawn: 'You withdrew this request.',
  closed: 'MANOP closed this request.',
}

const t = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown, max = 40): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean).slice(0, max) : [])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RequestInput { portfolio_summary: string; intended_usage: string; service_requirements: string | null; expected_coverage: string | null; manop_attributed_context: string | null; external_context: string | null }

export function validateRequestInput(b: Record<string, unknown>): { ok: boolean; errors: string[]; value: RequestInput | null } {
  const errors: string[] = []
  const portfolio = t(b.portfolio_summary), usage = t(b.intended_usage)
  if (portfolio.length < 20) errors.push('Describe your portfolio (at least a couple of sentences) so MANOP can assess the request.')
  if (usage.length < 20) errors.push('Describe how you intend to use MANOP.')
  if (errors.length) return { ok: false, errors, value: null }
  return { ok: true, errors, value: { portfolio_summary: portfolio, intended_usage: usage, service_requirements: t(b.service_requirements) || null, expected_coverage: t(b.expected_coverage) || null, manop_attributed_context: t(b.manop_attributed_context) || null, external_context: t(b.external_context) || null } }
}

export interface ProposalInput {
  price_amount: number; price_currency: string; duration_months: number; inclusions: string[]; exclusions: string[]
  coverage_scope: 'listed' | 'all_current_and_future'; coverage_development_ids: string[]; coverage_note: string | null
  activation_condition: string; effective_date: string | null; expires_at: string | null; terms_text: string; basis_note: string | null
}

/** A draft may be incomplete; `issue: true` applies the full rules that must hold before an agency can be shown a proposal. */
export function validateProposalInput(b: Record<string, unknown>, opts: { issue: boolean; now?: Date }): { ok: boolean; errors: string[]; value: ProposalInput | null } {
  const errors: string[] = []
  const now = opts.now ?? new Date()
  const price = Number(b.price_amount)
  if (!Number.isFinite(price) || price <= 0) errors.push('Enter the proposed price (a positive amount).')
  const currency = (t(b.price_currency, 3) || 'NGN').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) errors.push('Currency must be a three-letter code such as NGN.')
  const months = Number(b.duration_months)
  if (!Number.isInteger(months) || months < 1 || months > 60) errors.push('Duration must be a whole number of months between 1 and 60.')
  const inclusions = list(b.inclusions)
  if (!inclusions.length) errors.push('State at least one thing the subscription includes.')
  const scope = b.coverage_scope === 'all_current_and_future' ? 'all_current_and_future' : b.coverage_scope === 'listed' ? 'listed' : null
  if (!scope) errors.push('Say which developments the subscription covers: a listed set, or explicitly all current and future developments.')
  const ids = list(b.coverage_development_ids, 500).filter(x => UUID.test(x))
  if (scope === 'listed' && ids.length === 0) errors.push('List the developments covered, or choose "all current and future" explicitly.')
  const activation = t(b.activation_condition)
  if (!activation) errors.push('State the activation condition (for example: payment confirmed and approved by MANOP).')
  const terms = t(b.terms_text, 20000)
  if (!terms) errors.push('Add the terms that apply to this proposal.')
  const eff = typeof b.effective_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.effective_date) ? b.effective_date : null
  const exp = typeof b.expires_at === 'string' && !isNaN(Date.parse(b.expires_at)) ? new Date(b.expires_at).toISOString() : null
  if (opts.issue) {
    if (!exp) errors.push('Set an expiry date for the proposal.')
    else if (new Date(exp) <= now) errors.push('The expiry must be in the future.')
    if (eff && exp && eff > exp.slice(0, 10)) errors.push('The effective date cannot be after the proposal expires.')
  }
  if (errors.length) return { ok: false, errors, value: null }
  return { ok: true, errors, value: { price_amount: price, price_currency: currency, duration_months: months, inclusions, exclusions: list(b.exclusions), coverage_scope: scope!, coverage_development_ids: scope === 'listed' ? ids : [], coverage_note: t(b.coverage_note) || null, activation_condition: activation, effective_date: eff, expires_at: exp, terms_text: terms, basis_note: t(b.basis_note) || null } }
}

export interface ProposalFacts { status: string; expires_at: string | null; request_id: string; version: number }

export function isProposalExpired(p: { expires_at?: string | null }, now: Date = new Date()): boolean {
  return !!p.expires_at && new Date(p.expires_at) <= now
}

/** May the agency accept or decline this proposal now? Only the live issued proposal of its own open request, before expiry. */
export function canDecide(p: ProposalFacts, requestStatus: string, now: Date = new Date()): { ok: boolean; reason?: string } {
  if (p.status !== 'issued') return { ok: false, reason: p.status === 'accepted' ? 'This proposal has already been accepted.' : 'This proposal is no longer open for a decision.' }
  if (requestStatus !== 'proposal_issued') return { ok: false, reason: 'This request is no longer awaiting your decision.' }
  if (isProposalExpired(p, now)) return { ok: false, reason: 'This proposal has expired. Ask MANOP for a new one.' }
  return { ok: true }
}

/** The verbatim text the agency accepts; stored as acceptance evidence together with the proposal row. */
export function proposalStatement(p: ProposalInput & { version: number }, coverageLabels: string[]): string {
  const lines = [
    `Custom Agency Subscription, proposal version ${p.version}`,
    `Price: ${p.price_currency} ${p.price_amount.toLocaleString('en-NG')} for ${p.duration_months} months`,
    `Includes: ${p.inclusions.join('; ')}`,
    ...(p.exclusions.length ? [`Excludes: ${p.exclusions.join('; ')}`] : []),
    p.coverage_scope === 'listed' ? `Developments covered: ${coverageLabels.length ? coverageLabels.join('; ') : p.coverage_development_ids.join(', ')}` : 'Developments covered: all current and future developments of this agency (explicitly agreed)',
    ...(p.coverage_note ? [`Coverage note: ${p.coverage_note}`] : []),
    `Activation: ${p.activation_condition}`,
    ...(p.effective_date ? [`Intended effective date: ${p.effective_date}`] : []),
    `Proposal valid until: ${p.expires_at}`,
    `Terms: ${p.terms_text}`,
    'Accepting records your agreement to these terms. It does not activate the subscription. Fees already earned or triggered under an earlier route are not removed by this subscription.',
  ]
  return lines.join('\n')
}

/** Fields an agency may see. Internal assessment notes and price reasoning never leave the server. */
export function agencyViewOfRequest(r: Record<string, any>, proposal: Record<string, any> | null, now: Date = new Date()) {
  const status = r.status as RequestStatus
  const live = proposal && proposal.status === 'issued' && !isProposalExpired(proposal, now)
  return {
    id: r.id, status, statusLabel: REQUEST_STATUS_LABEL[status] ?? status, nextStep: REQUEST_NEXT_STEP[status] ?? '',
    requestedAt: r.requested_at, subscriptionId: r.subscription_id ?? null,
    proposal: proposal && proposal.status !== 'draft' ? {
      id: proposal.id, version: proposal.version, status: live || proposal.status !== 'issued' ? proposal.status : 'expired',
      price: proposal.price_amount, currency: proposal.price_currency, durationMonths: proposal.duration_months,
      inclusions: proposal.inclusions, exclusions: proposal.exclusions, coverageScope: proposal.coverage_scope, coverageDevelopmentIds: proposal.coverage_development_ids,
      coverageNote: proposal.coverage_note, activationCondition: proposal.activation_condition, effectiveDate: proposal.effective_date,
      expiresAt: proposal.expires_at, terms: proposal.terms_text, canDecide: !!live && status === 'proposal_issued',
    } : null,
  }
}

// ── Success-fee commitment ────────────────────────────────────────────────────────────────────────────
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const addMonthsIso = (iso: string, m: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10) }

/** Commitment runs from the date the success-fee route took effect (the recorded acceptance), for the months in the approved terms. */
export function commitmentDates(effectiveFrom: string | null, months: number | null): { start: string | null; end: string | null } {
  if (!effectiveFrom || !months) return { start: null, end: null }
  return { start: effectiveFrom, end: addDays(addMonthsIso(effectiveFrom, months), -1) }
}

export interface CommitmentFacts { model: string; status: string; commitment_end: string | null; early_transition_authorized_at: string | null; early_transition_reason: string | null }

/** May this agency request a custom subscription now? Never silently bypasses the commitment; an early move needs a recorded authorisation. */
export function transitionEligibility(active: CommitmentFacts | null, today: string): { ok: boolean; eligibleFrom: string | null; authorizedEarly: boolean; reason: string | null } {
  if (!active || active.model !== 'success_fee' || active.status !== 'active') return { ok: true, eligibleFrom: null, authorizedEarly: false, reason: null }
  if (active.early_transition_authorized_at && active.early_transition_reason) return { ok: true, eligibleFrom: null, authorizedEarly: true, reason: null }
  if (!active.commitment_end) return { ok: true, eligibleFrom: null, authorizedEarly: false, reason: null }  // no commitment recorded on this election
  if (today > active.commitment_end) return { ok: true, eligibleFrom: addDays(active.commitment_end, 1), authorizedEarly: false, reason: null }
  return { ok: false, eligibleFrom: addDays(active.commitment_end, 1), authorizedEarly: false, reason: `Your success-fee route has a commitment that runs to ${active.commitment_end}. You can request a custom subscription from ${addDays(active.commitment_end, 1)}, or ask MANOP to authorise an earlier change.` }
}

export function validateEarlyAuthorisation(reason: unknown): { ok: boolean; error?: string; value?: string } {
  const r = t(reason, 2000)
  return r.length >= 10 ? { ok: true, value: r } : { ok: false, error: 'Record the reason for authorising an earlier change (at least a sentence), so the exception is auditable.' }
}