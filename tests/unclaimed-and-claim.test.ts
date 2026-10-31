import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveParty, validateReferral, heldByManop, type OpportunityFacts, type CallerFacts } from '../lib/deal-room-access'
import { checkClaimant, pickClaimable, sameEmail, claimUpdate } from '../lib/developer-claim'

const proj = (o: Partial<OpportunityFacts> = {}): OpportunityFacts => ({
  kind: 'project', developer_id: 'dev1', submitting_agency_id: null, landowner_user_id: null, mandate_document_url: null, published: true, ...o,
})
const caller = (o: Partial<CallerFacts> = {}): CallerFacts => ({ userId: 'u9', isAdmin: false, developerAccountId: null, agencyId: null, ...o })
const lead = (o: object = {}) => ({ user_id: 'buyer1', developer_id: 'dev1', ...o })

// ── Unclaimed development: introductions are held by MANOP ─────────────────
test('admin always reaches a MANOP-held introduction', () => {
  assert.equal(resolveParty(lead({ routing_status: 'manop_operator' }), proj(), caller({ isAdmin: true })).party, 'admin')
})
test('a developer who claims the account later does NOT get an introduction MANOP was holding', () => {
  const r = resolveParty(lead({ routing_status: 'manop_operator' }), proj(), caller({ developerAccountId: 'dev1' }))
  assert.equal(r.party, null)
})
test('after an admin referral the developer does get it', () => {
  const r = resolveParty(lead({ routing_status: 'manop_operator', referred_to_developer_at: '2026-10-19T10:00:00Z' }), proj(), caller({ developerAccountId: 'dev1' }))
  assert.equal(r.party, 'developer')
})
test('an introduction routed to a claimed developer at creation is theirs without referral', () => {
  assert.equal(resolveParty(lead({ routing_status: 'developer_account' }), proj(), caller({ developerAccountId: 'dev1' })).party, 'developer')
})
test('leads created before routing was recorded keep their earlier behaviour', () => {
  assert.equal(resolveParty(lead(), proj(), caller({ developerAccountId: 'dev1' })).party, 'developer')
  assert.equal(heldByManop({ user_id: null, developer_id: null }), false)
})
test('the buyer always sees their own introduction, held or not', () => {
  assert.equal(resolveParty(lead({ routing_status: 'manop_operator' }), proj(), caller({ userId: 'buyer1' })).party, 'buyer')
})
test('a mandated submitting agency still reaches an unclaimed development’s introduction', () => {
  const r = resolveParty(lead({ routing_status: 'agency_mandate' }), proj({ submitting_agency_id: 'ag1', mandate_document_url: 'm.pdf' }), caller({ agencyId: 'ag1' }))
  assert.equal(r.party, 'agency')
})
test('an unrelated developer is never a party', () => {
  assert.equal(resolveParty(lead({ routing_status: 'developer_account' }), proj(), caller({ developerAccountId: 'dev2' })).party, null)
})

// ── Referral rules ─────────────────────────────────────────────────────────
const okLead = { developer_id: 'dev1', project_id: 'p1', attribution_acknowledged_at: '2026-10-18T00:00:00Z', referred_to_developer_at: null }
test('referral: allowed for admin when claimed, consented, not yet referred', () => {
  assert.equal(validateReferral({ party: 'admin', lead: okLead, developerClaimed: true }), null)
})
test('referral: refused for anyone but admin', () => {
  for (const p of ['developer', 'agency', 'buyer', null]) assert.ok(validateReferral({ party: p, lead: okLead, developerClaimed: true }))
})
test('referral: refused while the developer has not claimed the account', () => {
  assert.match(validateReferral({ party: 'admin', lead: okLead, developerClaimed: false })!, /not claimed/)
})
test('referral: refused without the buyer’s acknowledgement, or if already referred, or not a development lead', () => {
  assert.match(validateReferral({ party: 'admin', lead: { ...okLead, attribution_acknowledged_at: null }, developerClaimed: true })!, /agreed/)
  assert.match(validateReferral({ party: 'admin', lead: { ...okLead, referred_to_developer_at: 'x' }, developerClaimed: true })!, /already/)
  assert.ok(validateReferral({ party: 'admin', lead: { ...okLead, project_id: null }, developerClaimed: true }))
})

// ── Claiming an account ────────────────────────────────────────────────────
test('claim: needs a signed-in user with a CONFIRMED email', () => {
  assert.equal(checkClaimant(null).ok, false)
  assert.equal(checkClaimant({ email: 'a@b.co', email_confirmed_at: null }).ok, false)
  assert.equal(checkClaimant({ email: '', email_confirmed_at: 'x' }).ok, false)
  const ok = checkClaimant({ email: ' Dev@Lavender.NG ', email_confirmed_at: '2026-10-19' })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.email, 'dev@lavender.ng')
})
test('claim: email comparison is exact: wildcards match nothing', () => {
  assert.equal(sameEmail('Dev@Lavender.ng', 'dev@lavender.NG'), true)
  for (const w of ['%', '%@%', '_', '*', 'dev@lavender.n_']) assert.equal(sameEmail('dev@lavender.ng', w), false)
  assert.equal(sameEmail(null, 'a'), false)
})
test('claim: only an unclaimed, login-less account with the same email is claimable; exactly one', () => {
  const rows = [
    { id: 'a', email: 'dev@lavender.ng', auth_user_id: null, account_status: 'unclaimed' },
    { id: 'b', email: 'other@x.ng', auth_user_id: null, account_status: 'unclaimed' },
    { id: 'c', email: 'dev@lavender.ng', auth_user_id: 'u1', account_status: 'claimed' },
  ]
  assert.deepEqual(pickClaimable(rows, 'DEV@lavender.ng'), { kind: 'one', id: 'a' })
  assert.deepEqual(pickClaimable(rows, '%'), { kind: 'none' })
  assert.deepEqual(pickClaimable(rows, 'nobody@x.ng'), { kind: 'none' })
  assert.deepEqual(pickClaimable([...rows, { id: 'd', email: 'dev@lavender.ng', auth_user_id: null, account_status: 'unclaimed' }], 'dev@lavender.ng'), { kind: 'ambiguous' })
})
test('claim: a claimant cannot overwrite MANOP’s recorded company data or set verification', () => {
  const u = claimUpdate({ company_name: 'Hijack Ltd', cac_number: 'x', verified: true, contact_name: 'Ade', phone: '1' }, 'u1', 'now')
  assert.equal('company_name' in u, false)
  assert.equal('cac_number' in u, false)
  assert.equal('verified' in u, false)
  assert.equal(u.contact_name, 'Ade')
  assert.equal(u.auth_user_id, 'u1')
  assert.equal(u.account_status, 'claimed')
})
