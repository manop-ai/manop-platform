import test from 'node:test'
import assert from 'node:assert/strict'
import { developmentProgress, type DevelopmentFacts } from '../lib/development-workflow'

const base: DevelopmentFacts = { publishStatus: 'pending_review', reviewedAt: null, manopRequestNote: null, submittedViaAgency: true, mandate: { kind: 'letter', status: 'uploaded', note: null }, agencyVerification: 'verified', executedAgreement: false, route: null, subscription: null }
const step = (p: ReturnType<typeof developmentProgress>, k: string) => p.steps.find(s => s.key === k)!

test('an uploaded but unreviewed letter blocks publication and is not described as accepted', () => {
  const p = developmentProgress(base)
  assert.equal(step(p, 'mandate').state, 'waiting'); assert.equal(p.canBePublishedByMANOP, false); assert.match(step(p, 'publication').detail, /mandate letter has not been accepted/)
})
test('an accepted letter, a verified agency and a review queue are three separate facts', () => {
  const p = developmentProgress({ ...base, mandate: { kind: 'letter', status: 'approved', note: null } })
  assert.equal(step(p, 'mandate').state, 'done'); assert.equal(step(p, 'review').state, 'current'); assert.match(step(p, 'mandate').detail, /does not approve the development/)
  assert.equal(p.canBePublishedByMANOP, true)
})
test('agency verification does not stand in for the letter', () => {
  const p = developmentProgress({ ...base, mandate: { kind: 'none' }, agencyVerification: 'verified' })
  assert.equal(step(p, 'agency').state, 'done'); assert.equal(step(p, 'mandate').state, 'blocked'); assert.equal(p.canBePublishedByMANOP, false); assert.ok(p.agencyNextSteps.length)
})
test('rejected or change-requested letters carry the reason and the next action', () => {
  const p = developmentProgress({ ...base, mandate: { kind: 'letter', status: 'changes_requested', note: 'Signature missing' } })
  assert.match(step(p, 'mandate').detail, /Signature missing/); assert.match(p.agencyNextSteps.join(' '), /corrected mandate letter/)
})
test('MANOP information requests and rejections are actionable and preserved', () => {
  const asked = developmentProgress({ ...base, mandate: { kind: 'letter', status: 'approved', note: null }, manopRequestNote: 'Add the survey plan' })
  assert.match(step(asked, 'review').detail, /Add the survey plan/); assert.equal(step(asked, 'publication').state, 'blocked')
  const rej = developmentProgress({ ...base, publishStatus: 'rejected', manopRequestNote: 'Title unclear' })
  assert.match(step(rej, 'review').detail, /Title unclear/)
})
test('a letter or a subscription request never creates commercial coverage', () => {
  const p = developmentProgress({ ...base, mandate: { kind: 'letter', status: 'approved', note: null }, route: { model: 'subscription', status: 'proposed' } })
  assert.equal(p.commercial.covered, false); assert.match(p.commercial.explanation, /does not create coverage/); assert.match(p.commercial.explanation, /not active yet/)
})
test('coverage comes only from an executed agreement or an active subscription that names this development', () => {
  assert.equal(developmentProgress({ ...base, executedAgreement: true }).commercial.basis, 'executed_agreement')
  assert.equal(developmentProgress({ ...base, subscription: { active: true, coversThisDevelopment: true } }).commercial.basis, 'subscription')
  const other = developmentProgress({ ...base, subscription: { active: true, coversThisDevelopment: false } })
  assert.equal(other.commercial.covered, false); assert.match(other.commercial.explanation, /does not list this development/)
  assert.equal(developmentProgress({ ...base, route: { model: 'success_fee', status: 'active' } }).commercial.covered, false)
})
test('developer submissions do not need a mandate letter; published shows done', () => {
  const p = developmentProgress({ ...base, submittedViaAgency: false, mandate: { kind: 'none' }, publishStatus: 'published', reviewedAt: 'x' })
  assert.equal(step(p, 'mandate').state, 'not_applicable'); assert.equal(step(p, 'publication').state, 'done'); assert.equal(p.canBePublishedByMANOP, true)
})
