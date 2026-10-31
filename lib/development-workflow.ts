// lib/development-workflow.ts
//
// One clear, honest picture of where a submitted development stands, with the SIX things kept apart:
//   1 submission      the agency/developer sent it in
//   2 mandate         the agency's authority letter (uploaded, reviewed by MANOP)            -- not approval of the development
//   3 MANOP review    MANOP's independent review of the development itself (reviewed_at, notes)
//   4 agreement       an executed commercial agreement covering THIS development               -- not implied by a letter or a subscription request
//   5 commercial coverage  whether a fee/subscription arrangement actually covers THIS development
//   6 publication     visible to buyers
// Pure function of facts, so it is testable. It never changes anything; it explains and says what happens next.

export interface DevelopmentFacts {
  publishStatus: string | null              // draft | pending_review | published | rejected | ...
  reviewedAt: string | null
  manopRequestNote: string | null           // what MANOP asked for (manop_flag_note)
  submittedViaAgency: boolean
  mandate: { kind: 'letter'; status: string; note: string | null } | { kind: 'legacy_link' } | { kind: 'none' }
  agencyVerification: string | null
  executedAgreement: boolean                // an EXECUTED agreement (completed record) names this development
  agreementRequest?: { id: string; reference: string; status: string } | null   // the open request that includes this development, if any
  route: { model: 'success_fee' | 'subscription'; status: string } | null
  subscription: { active: boolean; coversThisDevelopment: boolean } | null
}

export type StepState = 'done' | 'current' | 'waiting' | 'blocked' | 'not_applicable' | 'not_started'
export interface Step { key: string; label: string; state: StepState; detail: string }
export interface DevelopmentProgress {
  steps: Step[]
  canBePublishedByMANOP: boolean            // the mandate gate only; MANOP's own review is a human decision
  blockers: string[]
  agencyNextSteps: string[]
  agreement: { canRequest: boolean; requestId: string | null; reference: string | null; status: string | null }
  commercial: { covered: boolean; basis: 'executed_agreement' | 'subscription' | 'none'; explanation: string }
}

export function developmentProgress(f: DevelopmentFacts): DevelopmentProgress {
  const steps: Step[] = []; const blockers: string[] = []; const next: string[] = []
  const published = f.publishStatus === 'published'

  steps.push({ key: 'submission', label: 'Submission', state: f.publishStatus && f.publishStatus !== 'draft' ? 'done' : 'current', detail: f.publishStatus === 'draft' ? 'Saved as a draft. Submit it for MANOP to start review.' : 'Received by MANOP.' })

  // mandate
  if (!f.submittedViaAgency) steps.push({ key: 'mandate', label: 'Mandate letter', state: 'not_applicable', detail: 'Not needed: submitted by the developer.' })
  else if (f.mandate.kind === 'none') { steps.push({ key: 'mandate', label: 'Mandate letter', state: 'blocked', detail: 'No mandate letter is on file.' }); blockers.push('Upload a mandate letter.'); next.push('Upload your mandate letter for this development.') }
  else if (f.mandate.kind === 'legacy_link') steps.push({ key: 'mandate', label: 'Mandate letter', state: 'waiting', detail: 'An older document link is on record. MANOP may ask you to upload the letter itself.' })
  else {
    const s = f.mandate.status
    if (s === 'approved') steps.push({ key: 'mandate', label: 'Mandate letter', state: 'done', detail: 'Accepted by MANOP as proof of authority. This does not approve the development.' })
    else if (s === 'changes_requested' || s === 'rejected') { steps.push({ key: 'mandate', label: 'Mandate letter', state: 'blocked', detail: `${s === 'rejected' ? 'Not accepted' : 'MANOP needs a corrected letter'}${f.mandate.note ? `: ${f.mandate.note}` : '.'}` }); blockers.push('The mandate letter needs to be replaced.'); next.push('Upload a corrected mandate letter.') }
    else if (['uploaded', 'under_review'].includes(s)) { steps.push({ key: 'mandate', label: 'Mandate letter', state: 'waiting', detail: 'Uploaded; waiting for MANOP to review it.' }); blockers.push('The mandate letter has not been accepted yet.') }
    else { steps.push({ key: 'mandate', label: 'Mandate letter', state: 'blocked', detail: 'The uploaded letter cannot be used (replaced, removed or unfinished).' }); blockers.push('Upload a current mandate letter.'); next.push('Upload a current mandate letter.') }
  }

  // agency verification (context only, separate)
  if (f.submittedViaAgency) steps.push({ key: 'agency', label: 'Agency verification', state: f.agencyVerification === 'verified' ? 'done' : 'waiting', detail: f.agencyVerification === 'verified' ? 'The agency is verified. This is a separate decision and does not approve any development or letter.' : 'The agency is not verified yet. Verification is separate from this development.' })

  // review
  if (published) steps.push({ key: 'review', label: 'MANOP review', state: 'done', detail: f.reviewedAt ? 'Reviewed by MANOP.' : 'Published.' })
  else if (f.publishStatus === 'rejected') { steps.push({ key: 'review', label: 'MANOP review', state: 'blocked', detail: 'MANOP did not approve this submission.' + (f.manopRequestNote ? ` ${f.manopRequestNote}` : '') }); next.push('Read MANOP’s feedback and resubmit with corrections.') }
  else if (f.manopRequestNote && !f.reviewedAt) { steps.push({ key: 'review', label: 'MANOP review', state: 'blocked', detail: `MANOP asked for more information: ${f.manopRequestNote}` }); next.push('Provide the information MANOP asked for.'); blockers.push('MANOP has asked for more information.') }
  else if (f.publishStatus === 'pending_review') steps.push({ key: 'review', label: 'MANOP review', state: 'current', detail: f.reviewedAt ? 'Reviewed; waiting for the publication decision.' : 'In MANOP’s review queue.' })
  else steps.push({ key: 'review', label: 'MANOP review', state: 'not_started', detail: 'Not submitted for review yet.' })

  // agreement + commercial coverage
  const coveredByAgreement = f.executedAgreement
  const coveredBySub = !!f.subscription?.active && f.subscription.coversThisDevelopment
  const ar = f.agreementRequest ?? null
  const AGREEMENT_TEXT: Record<string, string> = {
    draft: 'An agreement request is saved as a draft and not yet submitted.', submitted: 'An agreement was requested and MANOP has it. Nothing is agreed.', under_review: 'MANOP is reviewing the agreement request. Nothing is agreed.',
    information_required: 'MANOP needs more information for the agreement request.', clarification_requested: 'MANOP has questions about the agreement request.',
    ready_for_agreement_preparation: 'MANOP is preparing your agreement.', agreement_prepared: 'MANOP is preparing your agreement.', agreement_sent: 'An agreement is ready to download, sign and upload.',
    awaiting_signature: 'Waiting for your signed copy.', signed_copy_received: 'MANOP has your signed copy and is reviewing it. Not yet executed.', countersignature_pending: 'Signed copy accepted; waiting for MANOP’s countersignature. Not yet executed.',
  }
  const open = !!ar && !['declined', 'withdrawn', 'executed'].includes(ar.status)
  steps.push({ key: 'agreement', label: 'Commercial agreement', state: coveredByAgreement ? 'done' : open ? 'current' : 'not_started',
    detail: coveredByAgreement ? 'An executed agreement covers this development.' : open ? `${AGREEMENT_TEXT[ar!.status] ?? 'An agreement request is in progress.'} (${ar!.reference})` : ar?.status === 'declined' ? 'The last agreement request was declined.' : 'No agreement has been requested. This does not stop MANOP reviewing the development, but no fee arrangement applies until an executed agreement covers it.' })
  let commercial: DevelopmentProgress['commercial']
  if (coveredByAgreement) commercial = { covered: true, basis: 'executed_agreement', explanation: 'Covered by an executed agreement. A fee arises only on a qualifying transaction event under that agreement.' }
  else if (coveredBySub) commercial = { covered: true, basis: 'subscription', explanation: 'Covered by an active subscription whose accepted proposal lists this development (or states that it covers all).' }
  else {
    const why = f.route?.model === 'subscription' && !f.subscription?.active ? 'A subscription has been requested or accepted but is not active yet' : f.subscription?.active && !f.subscription.coversThisDevelopment ? 'The active subscription does not list this development' : f.route?.model === 'success_fee' ? 'The success-fee route is chosen but no executed agreement names this development' : 'No commercial arrangement covers this development'
    commercial = { covered: false, basis: 'none', explanation: `${why}. Uploading a mandate letter or requesting a subscription does not create coverage.` }
  }
  steps.push({ key: 'coverage', label: 'Commercial coverage', state: commercial.covered ? 'done' : 'not_started', detail: commercial.explanation })

  steps.push({ key: 'publication', label: 'Publication', state: published ? 'done' : blockers.length ? 'blocked' : 'waiting', detail: published ? 'Visible to buyers.' : blockers.length ? 'Cannot be published yet: ' + blockers.join(' ') : 'Waiting for MANOP’s decision. Nothing is published automatically.' })

  const mandateOk = !f.submittedViaAgency || (f.mandate.kind === 'letter' ? f.mandate.status === 'approved' : f.mandate.kind === 'legacy_link')
  const canRequest = !coveredByAgreement && !open && f.publishStatus !== 'rejected'
  return { steps, canBePublishedByMANOP: mandateOk, blockers, agencyNextSteps: next, commercial, agreement: { canRequest, requestId: ar?.id ?? null, reference: ar?.reference ?? null, status: ar?.status ?? null } }
}