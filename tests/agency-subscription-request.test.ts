import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateRequestInput, validateProposalInput, canDecide, proposalStatement, agencyViewOfRequest, commitmentDates,
  transitionEligibility, validateEarlyAuthorisation, isProposalExpired,
} from '../lib/agency-subscription-request'

const NOW = new Date('2026-10-24T10:00:00Z')
const DEV = '11111111-1111-1111-1111-111111111111'
const longText = 'We market about forty units across three estates in Lagos and Abuja.'
const goodProposal = (o: Record<string, unknown> = {}) => ({
  price_amount: 750000, price_currency: 'ngn', duration_months: 12, inclusions: ['Priority review of submissions'], exclusions: ['Confidential documents'],
  coverage_scope: 'listed', coverage_development_ids: [DEV], activation_condition: 'Payment confirmed and approved by MANOP',
  expires_at: '2026-11-30T00:00:00Z', terms_text: 'Terms apply.', ...o,
})

test('a request needs a real portfolio and usage description; external activity is kept separate context', () => {
  assert.equal(validateRequestInput({ portfolio_summary: 'short', intended_usage: longText }).ok, false)
  const v = validateRequestInput({ portfolio_summary: longText, intended_usage: longText, external_context: 'Also sold elsewhere', manop_attributed_context: '' })
  assert.ok(v.ok); assert.equal(v.value!.external_context, 'Also sold elsewhere'); assert.equal(v.value!.manop_attributed_context, null)
})

test('there is no default price: a proposal without a positive price is refused', () => {
  assert.equal(validateProposalInput(goodProposal({ price_amount: undefined }), { issue: false }).ok, false)
  assert.equal(validateProposalInput(goodProposal({ price_amount: 0 }), { issue: false }).ok, false)
  const ok = validateProposalInput(goodProposal(), { issue: true, now: NOW }); assert.ok(ok.ok); assert.equal(ok.value!.price_currency, 'NGN')
})

test('coverage must be explicit: listed developments, or all current and future stated deliberately', () => {
  assert.equal(validateProposalInput(goodProposal({ coverage_scope: undefined }), { issue: false }).ok, false)
  assert.equal(validateProposalInput(goodProposal({ coverage_development_ids: [] }), { issue: false }).ok, false)
  assert.equal(validateProposalInput(goodProposal({ coverage_development_ids: ['not-a-uuid'] }), { issue: false }).ok, false)
  const all = validateProposalInput(goodProposal({ coverage_scope: 'all_current_and_future', coverage_development_ids: [] }), { issue: false })
  assert.ok(all.ok); assert.deepEqual(all.value!.coverage_development_ids, [])
})

test('issuing needs a future expiry; a draft does not', () => {
  assert.equal(validateProposalInput(goodProposal({ expires_at: undefined }), { issue: true, now: NOW }).ok, false)
  assert.equal(validateProposalInput(goodProposal({ expires_at: '2026-10-01T00:00:00Z' }), { issue: true, now: NOW }).ok, false)
  assert.equal(validateProposalInput(goodProposal({ expires_at: undefined }), { issue: false }).ok, true)
})

test('a proposal can only be decided while issued, current and unexpired', () => {
  const p = { status: 'issued', expires_at: '2026-11-30T00:00:00Z', request_id: 'r', version: 1 }
  assert.equal(canDecide(p, 'proposal_issued', NOW).ok, true)
  assert.equal(canDecide({ ...p, status: 'accepted' }, 'accepted', NOW).ok, false)
  assert.equal(canDecide({ ...p, status: 'draft' }, 'under_assessment', NOW).ok, false)
  assert.equal(canDecide({ ...p, expires_at: '2026-10-01T00:00:00Z' }, 'proposal_issued', NOW).ok, false)
  assert.equal(canDecide(p, 'withdrawn', NOW).ok, false)
  assert.equal(isProposalExpired({ expires_at: null }, NOW), false)
})

test('the agency never sees drafts, internal notes or the basis for the price', () => {
  const r = { id: 'r', status: 'under_assessment', requested_at: 'x', admin_notes: 'SECRET NOTE' }
  const draft = { id: 'p', status: 'draft', basis_note: 'SECRET BASIS', price_amount: 1 }
  const v1 = agencyViewOfRequest(r, draft, NOW); assert.equal(v1.proposal, null)
  const issued = { id: 'p', version: 1, status: 'issued', price_amount: 750000, price_currency: 'NGN', duration_months: 12, inclusions: ['a'], exclusions: [], coverage_scope: 'all_current_and_future', coverage_development_ids: [], activation_condition: 'x', expires_at: '2026-11-30T00:00:00Z', terms_text: 't', basis_note: 'SECRET BASIS' }
  const v2 = agencyViewOfRequest({ ...r, status: 'proposal_issued' }, issued, NOW)
  assert.equal(v2.proposal!.canDecide, true)
  assert.doesNotMatch(JSON.stringify(v2), /SECRET/)
  const expired = agencyViewOfRequest({ ...r, status: 'proposal_issued' }, { ...issued, expires_at: '2026-10-01T00:00:00Z' }, NOW)
  assert.equal(expired.proposal!.status, 'expired'); assert.equal(expired.proposal!.canDecide, false)
})

test('the acceptance statement states price, coverage and that acceptance does not activate', () => {
  const v = validateProposalInput(goodProposal(), { issue: true, now: NOW }).value!
  const s = proposalStatement({ ...v, version: 2 }, ['Lekki Heights'])
  assert.match(s, /version 2/); assert.match(s, /NGN 750,000/); assert.match(s, /Lekki Heights/); assert.match(s, /does not activate/); assert.match(s, /already earned or triggered/)
  const all = proposalStatement({ ...v, coverage_scope: 'all_current_and_future', version: 1 }, [])
  assert.match(all, /all current and future developments of this agency \(explicitly agreed\)/)
})

test('the commitment is dated from the accepted route, not from account creation', () => {
  assert.deepEqual(commitmentDates('2026-10-24', 12), { start: '2026-10-24', end: '2027-10-23' })
  assert.deepEqual(commitmentDates(null, 12), { start: null, end: null })
  assert.deepEqual(commitmentDates('2026-10-24', null), { start: null, end: null })
})

test('a success-fee agency cannot silently bypass the commitment; an authorised exception is allowed and needs a reason', () => {
  const el = { model: 'success_fee', status: 'active', commitment_end: '2027-10-23', early_transition_authorized_at: null, early_transition_reason: null }
  const early = transitionEligibility(el, '2027-01-01'); assert.equal(early.ok, false); assert.equal(early.eligibleFrom, '2027-10-24'); assert.match(early.reason!, /2027-10-23/)
  assert.equal(transitionEligibility(el, '2027-10-23').ok, false)           // last day of the commitment
  assert.equal(transitionEligibility(el, '2027-10-24').ok, true)             // next day
  const auth = transitionEligibility({ ...el, early_transition_authorized_at: '2027-01-02T00:00:00Z', early_transition_reason: 'Agreed with founder' }, '2027-01-03')
  assert.ok(auth.ok && auth.authorizedEarly)
  assert.equal(validateEarlyAuthorisation('ok').ok, false)
  assert.equal(validateEarlyAuthorisation('Agency expanded; founder agreed an early change').ok, true)
})

test('no active route, or a route without a recorded commitment, does not block a request', () => {
  assert.equal(transitionEligibility(null, '2026-10-24').ok, true)
  assert.equal(transitionEligibility({ model: 'success_fee', status: 'active', commitment_end: null, early_transition_authorized_at: null, early_transition_reason: null }, '2026-10-24').ok, true)
})
