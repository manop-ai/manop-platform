import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAgreementUpload, visibleToRequester, canOpenDocument, canPrepareVersion, planIssue, canUploadSigned, planSignedReview, planCompletion, coversProject, requesterNextStep, agreementPublicId, agreementPublicIdBelongs } from '../lib/agreement-docs'
import { checkAdminTransition, ADMIN_TRANSITIONS, readinessGaps, STATUSES } from '../lib/commercial-terms'
import { developmentProgress } from '../lib/development-workflow'

const good = { title: 'MANOP agreement', scopeSummary: 'Covers Lavender', termsSummary: 'As the document states', coveredProjectIds: ['p1'], opportunityKind: 'development' }
const when = new Date(Date.now() - 86400000).toISOString()

test('uploads: only pdf/jpg/png up to 10 MB', () => {
  assert.equal(validateAgreementUpload({ filename: 'a.pdf', bytes: 1000 }).ok, true)
  assert.equal(validateAgreementUpload({ filename: 'a.exe', bytes: 1000 }).ok, false)
  assert.equal(validateAgreementUpload({ filename: 'a.pdf', bytes: 11 * 1024 * 1024 }).ok, false)
  assert.equal(validateAgreementUpload({ filename: 'a.pdf', bytes: 0 }).ok, false)
})
test('storage id is server-built and bound to the request and document', () => {
  const id = agreementPublicId('r1', 'd1', 'pdf'); assert.equal(id, 'agreement-docs/r1/d1.pdf')
  assert.equal(agreementPublicIdBelongs('r1', 'd1', id), true)
  assert.equal(agreementPublicIdBelongs('r2', 'd1', id), false)
  assert.equal(agreementPublicIdBelongs('r1', 'd2', id), false)
})
test('requester never sees drafts, withdrawn versions or unfinished uploads', () => {
  for (const status of ['draft', 'withdrawn', 'pending_upload', 'upload_failed']) assert.equal(visibleToRequester({ kind: 'issued', status } as any), false)
  assert.equal(visibleToRequester({ kind: 'issued', status: 'issued' } as any), true)
  assert.equal(visibleToRequester({ kind: 'issued', status: 'superseded' } as any), true)         // history stays available
  assert.equal(visibleToRequester({ kind: 'final_executed', status: 'final' } as any), true)
  assert.equal(visibleToRequester({ kind: 'signed_copy', status: 'pending_upload' } as any), false)
})
test('another organisation cannot open a document; the owner and admin can', () => {
  const d = { kind: 'issued', status: 'issued' } as any
  assert.equal(canOpenDocument({ role: 'requester', userId: 'u2', requestOwnerUserId: 'u1' }, d).allowed, false)
  assert.equal(canOpenDocument({ role: 'requester', userId: 'u1', requestOwnerUserId: 'u1' }, d).allowed, true)
  assert.equal(canOpenDocument({ role: 'requester', userId: 'u1', requestOwnerUserId: null }, d).allowed, false)
  assert.equal(canOpenDocument({ role: 'admin' }, d).allowed, true)
  assert.equal(canOpenDocument({ role: 'requester', userId: 'u1', requestOwnerUserId: 'u1' }, { kind: 'issued', status: 'draft' } as any).allowed, false)
})
test('preparing and issuing needs the right stage and complete wording', () => {
  assert.equal(canPrepareVersion('submitted').ok, false)
  assert.equal(canPrepareVersion('ready_for_agreement_preparation').ok, true)
  assert.equal(planIssue(good, 'agreement_prepared').ok, true)
  assert.equal(planIssue({ ...good, title: ' ' }, 'agreement_prepared').ok, false)
  assert.equal(planIssue({ ...good, termsSummary: '' }, 'agreement_prepared').ok, false)
  assert.equal(planIssue({ ...good, coveredProjectIds: [] }, 'agreement_prepared').ok, false)                     // development agreement must name a development
  assert.equal(planIssue({ ...good, coveredProjectIds: [], opportunityKind: 'agency_level' }, 'agreement_prepared').ok, true)
})
test('signed copy: only for the current issued version and only while waiting for it', () => {
  const cur = { kind: 'issued', status: 'issued' } as any
  assert.equal(canUploadSigned('agreement_sent', cur).ok, true)
  assert.equal(canUploadSigned('awaiting_signature', cur).ok, true)
  assert.match(canUploadSigned('agreement_sent', { kind: 'issued', status: 'superseded' } as any).error!, /newer version/)
  assert.equal(canUploadSigned('agreement_sent', { kind: 'issued', status: 'draft' } as any).ok, false)
  assert.equal(canUploadSigned('signed_copy_received', cur).ok, false)
  assert.equal(canUploadSigned('executed', cur).ok, false)
  assert.equal(canUploadSigned('under_review', cur).ok, false)
  assert.equal(canUploadSigned('agreement_sent', null).ok, false)
})
test('review: accept goes to countersignature, hold/reject return to the requester with a reason, none executes', () => {
  const copy = { kind: 'signed_copy', status: 'received' } as any
  const a = planSignedReview('accept', '', 'signed_copy_received', copy); assert.equal(a.requestStatus, 'countersignature_pending'); assert.equal(a.copyStatus, 'accepted')
  assert.equal(planSignedReview('hold', '', 'signed_copy_received', copy).ok, false)
  const h = planSignedReview('hold', 'page 3 missing', 'signed_copy_received', copy); assert.equal(h.requestStatus, 'awaiting_signature')
  assert.equal(planSignedReview('reject', 'altered', 'signed_copy_received', copy).copyStatus, 'rejected')
  assert.equal(planSignedReview('accept', '', 'awaiting_signature', copy).ok, false)
  assert.equal(planSignedReview('accept', '', 'signed_copy_received', { kind: 'signed_copy', status: 'accepted' } as any).ok, false)
  assert.notEqual(a.requestStatus, 'executed')
})
test('completion needs an accepted copy of the current issued version and nothing else from MANOP (no second signature)', () => {
  const copy = { kind: 'signed_copy', status: 'accepted', issued_version_id: 'v1' } as any, ver = { id: 'v1', status: 'issued' } as any
  assert.equal(planCompletion('countersignature_pending', copy, ver).ok, true)
  assert.equal(planCompletion('signed_copy_received', copy, ver).ok, false)
  assert.equal(planCompletion('countersignature_pending', null, ver).ok, false)
  assert.equal(planCompletion('countersignature_pending', { ...copy, status: 'received' }, ver).ok, false)
  assert.equal(planCompletion('countersignature_pending', copy, { id: 'v2', status: 'issued' } as any).ok, false)     // copy belongs to another version
  assert.equal(planCompletion('countersignature_pending', copy, { id: 'v1', status: 'superseded' } as any).ok, false)
})
test('executed cannot be reached by a status change; new statuses move only the intended way', () => {
  for (const from of STATUSES) assert.equal(ADMIN_TRANSITIONS[from].includes('executed' as any), false)
  assert.equal(checkAdminTransition('awaiting_signature', 'executed', { evidenceRef: 'x', executedAt: when, agreedOption: 'transaction_fee' }).ok, false)
  assert.equal(checkAdminTransition('countersignature_pending', 'executed', {}).ok, false)
  assert.equal(checkAdminTransition('under_review', 'signed_copy_received', {}).ok, false)
})
test('only a countersigned record naming the development counts as coverage', () => {
  assert.equal(coversProject({ status: 'executed', hasFinalRecord: true, coveredProjectIds: ['p1'] }, 'p1'), true)
  assert.equal(coversProject({ status: 'executed', hasFinalRecord: true, coveredProjectIds: ['p1'] }, 'p2'), false)
  assert.equal(coversProject({ status: 'executed', hasFinalRecord: false, coveredProjectIds: ['p1'] }, 'p1'), false)
  for (const status of ['submitted', 'agreement_sent', 'signed_copy_received', 'countersignature_pending', 'awaiting_signature']) assert.equal(coversProject({ status, hasFinalRecord: true, coveredProjectIds: ['p1'] }, 'p1'), false)
})
test('requests: agency-level and land need no development, development and redevelopment do; no option preference is required', () => {
  const base = { company_name: 'A', requester_name: 'B', requester_title: 'C', contact_email: 'a@b.co' }
  assert.deepEqual(readinessGaps({ ...base, opportunity_kind: 'agency_level', project_ids: [] }, 'agency'), [])
  assert.deepEqual(readinessGaps({ ...base, opportunity_kind: 'land', project_ids: [] }, 'agency'), [])
  assert.deepEqual(readinessGaps({ ...base, opportunity_kind: 'development', project_ids: [] }, 'agency'), ['At least one development'])
  assert.deepEqual(readinessGaps({ ...base, opportunity_kind: 'development', project_ids: ['p1'] }, 'agency'), [])
})
test('requester next step never says executed before it is', () => {
  assert.match(requesterNextStep('agreement_sent', [{ kind: 'issued', status: 'issued' }]), /Download/)
  assert.match(requesterNextStep('signed_copy_received', []), /checking/)
  assert.doesNotMatch(requesterNextStep('countersignature_pending', []), /is executed/)
})
test('development progress: agreement states stay separate from review, mandate and publication', () => {
  const f: any = { publishStatus: 'pending_review', reviewedAt: null, manopRequestNote: null, submittedViaAgency: true, mandate: { kind: 'letter', status: 'approved', note: null }, agencyVerification: 'verified', executedAgreement: false, route: null, subscription: null }
  const none = developmentProgress({ ...f, agreementRequest: null })
  assert.equal(none.agreement.canRequest, true)                                   // optional; review is not blocked by it
  assert.equal(none.canBePublishedByMANOP, true)
  const sent = developmentProgress({ ...f, agreementRequest: { id: 'r', reference: 'AG-1', status: 'signed_copy_received' } })
  assert.equal(sent.agreement.canRequest, false); assert.equal(sent.commercial.covered, false)
  assert.equal(sent.steps.find(s => s.key === 'coverage')!.state, 'not_started')
  assert.equal(sent.steps.find(s => s.key === 'review')!.state, 'current')
  const done = developmentProgress({ ...f, executedAgreement: true, agreementRequest: { id: 'r', reference: 'AG-1', status: 'executed' } })
  assert.equal(done.commercial.covered, true); assert.equal(done.steps.find(s => s.key === 'publication')!.state, 'waiting')   // executing does not publish
})
