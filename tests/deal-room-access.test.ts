import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveParty, resolveResponsibleParty, validateAdminResponsibility, type OpportunityFacts, type CallerFacts } from '../lib/deal-room-access'
import { validateStageChange, canPerform, deriveStates, CLOSED_STAGES, LEAD_STAGES, type MilestoneRow } from '../lib/deal-room'

const proj = (o: Partial<OpportunityFacts> = {}): OpportunityFacts => ({
  kind: 'project', developer_id: 'dev1', submitting_agency_id: null, landowner_user_id: null,
  mandate_document_url: null, published: true, ...o,
})
const caller = (o: Partial<CallerFacts> = {}): CallerFacts => ({ userId: 'u9', isAdmin: false, developerAccountId: null, agencyId: null, ...o })
const lead = { user_id: 'buyer1', developer_id: 'dev1' }
let n = 0
const row = (m: Partial<MilestoneRow>): MilestoneRow => ({
  id: `r${++n}`, lead_id: 'l', milestone: 'agreement_executed', action: 'report', party_role: 'developer',
  actor_user_id: 'x', event_date: null, evidence_ref: null, note: null, target_id: null, created_at: `2026-01-01T00:00:${String(n).padStart(2, '0')}Z`, ...m,
})

// ── who is the caller ──
test('the buyer is the buyer, even if they also hold other roles', () => {
  assert.equal(resolveParty(lead, proj(), caller({ userId: 'buyer1', developerAccountId: 'dev1' })).party, 'buyer')
})
test('the owning developer is a party; another developer is not', () => {
  assert.equal(resolveParty(lead, proj(), caller({ developerAccountId: 'dev1' })).party, 'developer')
  assert.equal(resolveParty(lead, proj(), caller({ developerAccountId: 'dev2' })).party, null)
})
test('a stranger gets no party and a "not a party" reason', () => {
  const r = resolveParty(lead, proj(), caller())
  assert.equal(r.party, null); assert.match(r.reason!, /not a party/)
})
test('admin is admin', () => assert.equal(resolveParty(lead, proj(), caller({ isAdmin: true })).party, 'admin'))
test('submitting agency WITH a mandate on file may act', () => {
  const o = proj({ submitting_agency_id: 'ag1', mandate_document_url: 'https://x/mandate.pdf' })
  assert.equal(resolveParty(lead, o, caller({ agencyId: 'ag1' })).party, 'agency')
})
test('submitting agency WITHOUT a mandate cannot act, with a reason', () => {
  const r = resolveParty(lead, proj({ submitting_agency_id: 'ag1', mandate_document_url: null }), caller({ agencyId: 'ag1' }))
  assert.equal(r.party, null); assert.match(r.reason!, /mandate/i)
})
test('an agency that did not submit the opportunity cannot act, however many subscriptions it holds', () => {
  const o = proj({ submitting_agency_id: 'ag1', mandate_document_url: 'https://x/m.pdf' })
  assert.equal(resolveParty(lead, o, caller({ agencyId: 'ag2' })).party, null)
})
test('agency cannot act on an unpublished opportunity', () => {
  const o = proj({ submitting_agency_id: 'ag1', mandate_document_url: 'https://x/m.pdf', published: false })
  assert.equal(resolveParty(lead, o, caller({ agencyId: 'ag1' })).party, null)
})
test('landowner who submitted the site is a party; someone else is not', () => {
  const o: OpportunityFacts = { ...proj(), kind: 'site', developer_id: null, landowner_user_id: 'land1' }
  assert.equal(resolveParty({ user_id: 'buyer1', developer_id: null }, o, caller({ userId: 'land1' })).party, 'landowner')
  assert.equal(resolveParty({ user_id: 'buyer1', developer_id: null }, o, caller({ userId: 'other' })).party, null)
})
test('general enquiry has no seller side: only buyer and admin', () => {
  const o: OpportunityFacts = { kind: 'general', developer_id: null, submitting_agency_id: null, landowner_user_id: null, mandate_document_url: null, published: false }
  const l = { user_id: 'buyer1', developer_id: null }
  assert.equal(resolveParty(l, o, caller({ developerAccountId: 'dev1', agencyId: 'ag1' })).party, null)
  assert.equal(resolveParty(l, o, caller({ userId: 'buyer1' })).party, 'buyer')
  assert.equal(resolveParty(l, o, caller({ isAdmin: true })).party, 'admin')
})
test('an anonymous (no user_id) lead is never matched to a signed-in stranger as buyer', () => {
  assert.equal(resolveParty({ user_id: null, developer_id: null }, proj({ developer_id: null }), caller()).party, null)
})

// ── responsible party ──
test('no agreement means unresolved; acknowledgement is not an input', () => {
  const r = resolveResponsibleParty({ existing: null, covering: null })
  assert.equal(r.party, null); assert.equal(r.source, 'unresolved')
})
test('an executed agreement naming the developer resolves to developer', () => {
  const r = resolveResponsibleParty({ existing: null, covering: { id: 'a1', status: 'executed', fee_payer: 'developer' } })
  assert.deepEqual([r.party, r.source], ['developer', 'agreement'])
})
test('an agreement that is not executed is ignored', () => {
  for (const status of ['submitted', 'agreement_prepared', 'agreement_sent', 'awaiting_signature', 'declined', 'withdrawn']) {
    assert.equal(resolveResponsibleParty({ existing: null, covering: { id: 'a', status, fee_payer: 'developer' } }).party, null, status)
  }
})
test('an executed agreement that names no payer stays unresolved', () => {
  assert.equal(resolveResponsibleParty({ existing: null, covering: { id: 'a', status: 'executed', fee_payer: null } }).party, null)
})
test('an existing value is never overwritten by a later agreement', () => {
  const r = resolveResponsibleParty({ existing: 'agency', covering: { id: 'a', status: 'executed', fee_payer: 'developer' } })
  assert.deepEqual([r.party, r.source], ['agency', 'existing'])
})
test('admin decision needs a valid party, a reason, and cannot overwrite a different value', () => {
  assert.ok(validateAdminResponsibility('landowner', 'because of the mandate', null))
  assert.ok(validateAdminResponsibility('developer', '', null))
  assert.ok(validateAdminResponsibility('developer', 'short', null))
  assert.ok(validateAdminResponsibility('agency', 'Mandate letter says the agency pays', 'developer'))
  assert.equal(validateAdminResponsibility('developer', 'Executed agreement names the developer', null), null)
  assert.equal(validateAdminResponsibility('developer', 'Re-recording the same value is fine', 'developer'), null)
})

// ── stage changes ──
const none = deriveStates([])
test('stages offered match the database CHECK constraint exactly', () => {
  assert.deepEqual([...LEAD_STAGES], ['enquiry', 'qualified', 'viewing', 'offer', 'reservation', 'financing', 'transaction', 'completed', 'lost'])
  assert.deepEqual(CLOSED_STAGES, ['completed', 'lost'])
})
test('buyers cannot change stage', () => {
  assert.ok(validateStageChange({ party: 'buyer', from: 'enquiry', to: 'viewing', states: none }))
})
test('sellers can move to ordinary stages and to lost', () => {
  for (const p of ['developer', 'agency', 'landowner'] as const)
    for (const to of ['qualified', 'viewing', 'offer', 'reservation', 'financing', 'lost'])
      assert.equal(validateStageChange({ party: p, from: 'enquiry', to, states: none }), null, `${p} -> ${to}`)
})
test('sellers cannot set transaction or completed themselves', () => {
  assert.ok(validateStageChange({ party: 'developer', from: 'financing', to: 'transaction', states: none }))
  assert.ok(validateStageChange({ party: 'developer', from: 'transaction', to: 'completed', states: none }))
})
test('sellers cannot move a closed introduction', () => {
  assert.ok(validateStageChange({ party: 'developer', from: 'lost', to: 'enquiry', states: none }))
  assert.ok(validateStageChange({ party: 'agency', from: 'completed', to: 'viewing', states: none }))
})
test('invalid or unchanged stages are rejected (the old dashboard values would have failed the database)', () => {
  for (const bad of ['sold', 'contacted', 'negotiating', 'reserved', 'new'])
    assert.ok(validateStageChange({ party: 'admin', from: 'enquiry', to: bad, states: none }), bad)
  assert.ok(validateStageChange({ party: 'admin', from: 'viewing', to: 'viewing', states: none }))
})
test('admin needs an agreement milestone confirmed by both parties, or a recorded reason, for transaction', () => {
  assert.ok(validateStageChange({ party: 'admin', from: 'financing', to: 'transaction', states: none }))
  assert.equal(validateStageChange({ party: 'admin', from: 'financing', to: 'transaction', states: none, note: 'Both parties confirmed by phone; evidence on file' }), null)
  const confirmed = deriveStates([
    row({ party_role: 'buyer', actor_user_id: 'b' }), row({ action: 'confirm', party_role: 'developer' }),
  ])
  assert.equal(validateStageChange({ party: 'admin', from: 'financing', to: 'transaction', states: confirmed }), null)
})
test('a one-sided agreement report does not unlock transaction', () => {
  const oneSided = deriveStates([row({ party_role: 'developer' })])
  assert.ok(validateStageChange({ party: 'admin', from: 'financing', to: 'transaction', states: oneSided }))
})
test('reopening a closed introduction needs a reason', () => {
  assert.ok(validateStageChange({ party: 'admin', from: 'lost', to: 'enquiry', states: none }))
  assert.equal(validateStageChange({ party: 'admin', from: 'lost', to: 'enquiry', states: none, note: 'Buyer came back' }), null)
})

// ── milestone permissions with the landowner and the admin-only entry ──
test('a landowner reports like the seller side but nobody can forge MANOP records through the API', () => {
  assert.equal(canPerform('landowner', 'report', 'introduction_acknowledged').ok, true)
  assert.equal(canPerform('landowner', 'report', 'agreement_executed').ok, true)
  for (const p of ['buyer', 'developer', 'agency', 'landowner', 'admin'] as const)
    assert.equal(canPerform(p, 'report', 'responsible_party_recorded').ok, false, p)
})
test('milestone reporting does not itself decide a fee (readiness is a separate, indicator-only function)', () => {
  const states = deriveStates([row({ party_role: 'buyer' }), row({ action: 'confirm', party_role: 'developer' })])
  assert.equal(states.agreement_executed.status, 'confirmed_by_both')
})
