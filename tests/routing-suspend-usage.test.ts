import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveParty, heldByManop, routeRecipient, validateRouting, type OpportunityFacts, type CallerFacts } from '../lib/deal-room-access'
import { planSuspend, planReinstate, planDelete } from '../lib/development-admin'
import { countablePath, isBot, referrerHost, shouldRecord, growth, VISITOR_ID_RE } from '../lib/usage'

const opp = (o: Partial<OpportunityFacts> = {}): OpportunityFacts => ({ kind: 'project', developer_id: 'dev1', submitting_agency_id: null, landowner_user_id: null, mandate_document_url: null, published: true, ...o })
const caller = (c: Partial<CallerFacts> = {}): CallerFacts => ({ userId: 'u1', isAdmin: false, developerAccountId: null, agencyId: null, ...c })
const held = { user_id: 'buyer1', developer_id: 'dev1', routing_status: 'developer_account', manop_routing_required: true, referred_to_developer_at: null }

test('a new enquiry is held for EVERY seller-side party until MANOP routes it, even when the developer has an account', () => {
  assert.equal(heldByManop(held), true)
  assert.equal(resolveParty(held, opp(), caller({ developerAccountId: 'dev1' })).party, null)
  assert.equal(resolveParty(held, opp({ submitting_agency_id: 'ag1', mandate_document_url: 'm' }), caller({ agencyId: 'ag1' })).party, null)
  assert.equal(resolveParty(held, opp({ kind: 'site', developer_id: null, landowner_user_id: 'land1' }), caller({ userId: 'land1' })).party, null)
})
test('the enquirer and MANOP always see their held introduction', () => {
  assert.equal(resolveParty(held, opp(), caller({ userId: 'buyer1' })).party, 'buyer')
  assert.equal(resolveParty(held, opp(), caller({ isAdmin: true })).party, 'admin')
})
test('after routing the partner in charge sees it; an unrelated developer still does not', () => {
  const routed = { ...held, referred_to_developer_at: '2026-10-28T10:00:00Z' }
  assert.equal(heldByManop(routed), false)
  assert.equal(resolveParty(routed, opp(), caller({ developerAccountId: 'dev1' })).party, 'developer')
  assert.equal(resolveParty(routed, opp(), caller({ developerAccountId: 'dev2' })).party, null)
})
test('older introductions are not suddenly hidden', () => {
  assert.equal(heldByManop({ user_id: null, developer_id: 'dev1', routing_status: 'developer_account' }), false)
  assert.equal(resolveParty({ user_id: null, developer_id: 'dev1', routing_status: 'developer_account', manop_routing_required: false }, opp(), caller({ developerAccountId: 'dev1' })).party, 'developer')
})
test('who can receive it comes from facts about the opportunity', () => {
  assert.equal(routeRecipient({ developerClaimed: true, opp: opp() }), 'developer')
  assert.equal(routeRecipient({ developerClaimed: false, opp: opp({ submitting_agency_id: 'ag1', mandate_document_url: 'm' }) }), 'agency')
  assert.equal(routeRecipient({ developerClaimed: false, opp: opp({ submitting_agency_id: 'ag1', mandate_document_url: null }) }), null)
  assert.equal(routeRecipient({ developerClaimed: false, opp: opp({ kind: 'site', developer_id: null, landowner_user_id: 'l1' }) }), 'landowner')
  assert.equal(routeRecipient({ developerClaimed: false, opp: opp({ developer_id: null }) }), null)
})
test('routing needs an admin, consent, a seller side, and happens once', () => {
  const lead = { project_id: 'p1', attribution_acknowledged_at: '2026-10-28T00:00:00Z', referred_to_developer_at: null }
  assert.equal(validateRouting({ party: 'admin', lead, recipient: 'developer' }), null)
  assert.ok(validateRouting({ party: 'developer', lead, recipient: 'developer' }))
  assert.match(validateRouting({ party: 'admin', lead: { ...lead, attribution_acknowledged_at: null }, recipient: 'developer' })!, /consent/)
  assert.match(validateRouting({ party: 'admin', lead: { ...lead, referred_to_developer_at: 'x' }, recipient: 'developer' })!, /already/)
  assert.match(validateRouting({ party: 'admin', lead, recipient: null })!, /Nobody can receive/)
  assert.match(validateRouting({ party: 'admin', lead: { ...lead, project_id: null }, recipient: 'developer' })!, /general enquiry/i)
  assert.equal(validateRouting({ party: 'admin', lead: { ...lead, project_id: null, site_id: 's1' }, recipient: 'landowner' }), null)
})

test('suspend needs a reason and is reversible; reinstate only clears the suspension', () => {
  assert.equal(planSuspend({ suspendedAt: null, reason: 'Developer asked us to pause' }).ok, true)
  assert.equal(planSuspend({ suspendedAt: null, reason: ' ' }).ok, false)
  assert.equal(planSuspend({ suspendedAt: '2026-10-01', reason: 'again please' }).ok, false)
  assert.equal(planReinstate({ suspendedAt: '2026-10-01' }).ok, true)
  assert.equal(planReinstate({ suspendedAt: null }).ok, false)
})
test('delete is refused when anything depends on the development, or when we could not check', () => {
  const none = { enquiries: 0, agreementRequests: 0, mandateLetters: 0 }
  assert.equal(planDelete({ records: none, confirmName: 'Lavender', name: 'Lavender' }).ok, true)
  assert.match(planDelete({ records: { ...none, enquiries: 3 }, confirmName: 'Lavender', name: 'Lavender' }).error!, /3 enquiry records.*Suspend/)
  assert.equal(planDelete({ records: { ...none, agreementRequests: 1 }, confirmName: 'Lavender', name: 'Lavender' }).ok, false)
  assert.equal(planDelete({ records: { ...none, enquiries: null }, confirmName: 'Lavender', name: 'Lavender' }).ok, false)   // unknown is never treated as zero
  assert.equal(planDelete({ records: none, confirmName: 'lavender', name: 'Lavender' }).ok, false)
})

test('usage: only public pages count; bots, admin and api do not', () => {
  assert.equal(countablePath('/developments?x=1'), '/developments')
  assert.equal(countablePath('/admin/fees'), null); assert.equal(countablePath('/api/x'), null); assert.equal(countablePath('/_next/data'), null)
  assert.equal(countablePath('https://evil.example/'), null); assert.equal(countablePath('/administrator'), '/administrator')
  assert.equal(isBot('Googlebot/2.1'), true); assert.equal(isBot(null), true); assert.equal(isBot('Mozilla/5.0 (iPhone) Safari'), false)
  assert.equal(referrerHost('https://www.google.com/search', 'manopintel.com'), 'www.google.com'); assert.equal(referrerHost('https://manopintel.com/x', 'manopintel.com'), null)
  assert.equal(VISITOR_ID_RE.test('abc'), false); assert.equal(VISITOR_ID_RE.test('0123456789abcdef'), true)
  assert.equal(shouldRecord({ sameRecentView: true, viewsLastMinute: 0 }), false); assert.equal(shouldRecord({ sameRecentView: false, viewsLastMinute: 60 }), false); assert.equal(shouldRecord({ sameRecentView: false, viewsLastMinute: 3 }), true)
  assert.equal(growth(150, 100), '+50%'); assert.equal(growth(5, 0), 'new'); assert.equal(growth(0, 0), '0%'); assert.equal(growth(5, undefined), '—')
})
