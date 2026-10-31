// Run: npx tsx --test tests/deal-room.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canPerform, deriveStates, validateAction, assessFeeReadiness, isSamePerson, normalisePhone,
  type MilestoneRow, type Milestone, type Action, type Party,
} from '../lib/deal-room'

let n = 0
function row(milestone: Milestone, action: Action, party: Party, extra: Partial<MilestoneRow> = {}): MilestoneRow {
  n += 1
  return {
    id: `r${String(n).padStart(4, '0')}`, lead_id: 'L1', milestone, action, party_role: party,
    actor_user_id: `u-${party}`, event_date: null, evidence_ref: null, note: null, target_id: null,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString(), ...extra,
  }
}
const status = (rows: MilestoneRow[], m: Milestone) => deriveStates(rows)[m]?.status ?? 'not_reported'

// ── permissions ──────────────────────────────────────────────────────────
test('system-only events cannot be submitted by anyone', () => {
  for (const p of ['buyer', 'developer', 'agency', 'admin'] as Party[]) {
    assert.equal(canPerform(p, 'report', 'introduction_created').ok, false)
    assert.equal(canPerform(p, 'report', 'repeat_enquiry_received').ok, false)
  }
})
test('buyer cannot report the developer’s acknowledgement; developer and agency can', () => {
  assert.equal(canPerform('buyer', 'report', 'introduction_acknowledged').ok, false)
  assert.equal(canPerform('developer', 'report', 'introduction_acknowledged').ok, true)
  assert.equal(canPerform('agency', 'report', 'introduction_acknowledged').ok, true)
})
test('developer cannot report a buyer-side cancellation as the buyer; buyer can cancel', () => {
  assert.equal(canPerform('buyer', 'report', 'outcome_cancelled').ok, true)
  assert.equal(canPerform('buyer', 'report', 'outcome_confirmed').ok, false)
})
test('admin cannot report ordinary milestones, only record outcomes', () => {
  assert.equal(canPerform('admin', 'report', 'agreement_executed').ok, false)
  assert.equal(canPerform('admin', 'report', 'outcome_confirmed').ok, true)
})
test('buyer cannot dispute the developer’s acknowledgement', () => {
  assert.equal(canPerform('buyer', 'dispute', 'introduction_acknowledged').ok, false)
})

// ── derived status ───────────────────────────────────────────────────────
test('nothing reported → not_reported', () => {
  assert.equal(status([], 'agreement_executed'), 'not_reported')
})
test('a single self-report is never "confirmed"', () => {
  assert.equal(status([row('agreement_executed', 'report', 'developer')], 'agreement_executed'), 'reported_by_developer')
  assert.equal(status([row('agreement_executed', 'report', 'buyer')], 'agreement_executed'), 'reported_by_buyer')
})
test('silence is not confirmation — time passing changes nothing', () => {
  const rows = [row('agreement_executed', 'report', 'developer')]
  assert.equal(status(rows, 'agreement_executed'), 'reported_by_developer')
})
test('report + confirm from the other side → confirmed_by_both', () => {
  const rows = [row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'confirm', 'buyer')]
  assert.equal(status(rows, 'agreement_executed'), 'confirmed_by_both')
})
test('both sides independently reporting → confirmed_by_both', () => {
  const rows = [row('viewing_completed', 'report', 'buyer'), row('viewing_completed', 'report', 'agency')]
  assert.equal(status(rows, 'viewing_completed'), 'confirmed_by_both')
})
test('dispute → disputed; confirming by the disputer clears it', () => {
  let rows = [row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'dispute', 'buyer')]
  assert.equal(status(rows, 'agreement_executed'), 'disputed')
  rows = [...rows, row('agreement_executed', 'confirm', 'buyer')]
  assert.equal(status(rows, 'agreement_executed'), 'confirmed_by_both')
})
test('a correction after a dispute stands alone and needs re-confirmation', () => {
  const rows = [
    row('qualifying_payment_reported', 'report', 'developer'),
    row('qualifying_payment_reported', 'dispute', 'buyer'),
    row('qualifying_payment_reported', 'report', 'developer', { event_date: '2026-10-05' }),
  ]
  assert.equal(status(rows, 'qualifying_payment_reported'), 'reported_by_developer')
})
test('admin confirm resolves a dispute as admin_resolved, not confirmed_by_both', () => {
  const rows = [
    row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'dispute', 'buyer'),
    row('agreement_executed', 'confirm', 'admin'),
  ]
  assert.equal(status(rows, 'agreement_executed'), 'admin_resolved')
})
test('retracting your own report removes it', () => {
  const r = row('offer_submitted', 'report', 'buyer')
  const rows = [r, row('offer_submitted', 'retract', 'buyer', { target_id: r.id })]
  assert.equal(status(rows, 'offer_submitted'), 'not_reported')
})
test('evidence is counted separately and does not change status', () => {
  const rows = [row('qualifying_payment_reported', 'report', 'buyer'), row('qualifying_payment_reported', 'evidence', 'buyer', { evidence_ref: 'receipt.pdf' })]
  const s = deriveStates(rows).qualifying_payment_reported
  assert.equal(s.status, 'reported_by_buyer')
  assert.equal(s.evidenceCount, 1)
})
test('confirmation request is flagged only while a one-sided report is waiting', () => {
  let rows = [row('viewing_completed', 'report', 'developer'), row('viewing_completed', 'request_confirmation', 'admin')]
  assert.equal(deriveStates(rows).viewing_completed.confirmationRequested, true)
  rows = [...rows, row('viewing_completed', 'confirm', 'buyer')]
  assert.equal(deriveStates(rows).viewing_completed.confirmationRequested, false)
})

// ── server-side validation ───────────────────────────────────────────────
test('cannot confirm or dispute a milestone nobody has reported', () => {
  assert.match(validateAction({ party: 'buyer', actorUserId: 'u', action: 'confirm', milestone: 'agreement_executed' }, [])!, /Nothing has been reported/)
})
test('cannot confirm your own report (needs the other side)', () => {
  const rows = [row('agreement_executed', 'report', 'buyer')]
  assert.match(validateAction({ party: 'buyer', actorUserId: 'u-buyer', action: 'confirm', milestone: 'agreement_executed' }, rows)!, /other party/)
})
test('the other side can confirm', () => {
  const rows = [row('agreement_executed', 'report', 'buyer')]
  assert.equal(validateAction({ party: 'developer', actorUserId: 'u-developer', action: 'confirm', milestone: 'agreement_executed' }, rows), null)
})
test('only the author can retract a report', () => {
  const r = row('offer_submitted', 'report', 'buyer', { actor_user_id: 'alice' })
  assert.match(validateAction({ party: 'buyer', actorUserId: 'mallory', action: 'retract', milestone: 'offer_submitted', targetId: r.id }, [r])!, /your own/)
  assert.equal(validateAction({ party: 'buyer', actorUserId: 'alice', action: 'retract', milestone: 'offer_submitted', targetId: r.id }, [r]), null)
})
test('cannot request confirmation when nothing is waiting', () => {
  assert.ok(validateAction({ party: 'admin', actorUserId: 'a', action: 'request_confirmation', milestone: 'agreement_executed' }, []))
})

// ── fee readiness ────────────────────────────────────────────────────────
test('fee: nothing reported → not_yet_due', () => {
  assert.equal(assessFeeReadiness(deriveStates([]), null).state, 'not_yet_due')
})
test('fee: one side reporting is only awaiting_confirmation', () => {
  const rows = [row('agreement_executed', 'report', 'developer')]
  assert.equal(assessFeeReadiness(deriveStates(rows), null).state, 'awaiting_confirmation')
})
test('fee: both qualifying milestones confirmed → candidate_due, and says no terms exist when none are active', () => {
  const rows = [
    row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'confirm', 'buyer'),
    row('qualifying_payment_reported', 'report', 'developer'), row('qualifying_payment_reported', 'confirm', 'buyer'),
  ]
  const a = assessFeeReadiness(deriveStates(rows), null)
  assert.equal(a.state, 'candidate_due')
  assert.equal(a.termsActive, false)
  assert.match(a.explanation, /no commercial terms/i)
  assert.equal(assessFeeReadiness(deriveStates(rows), 'v1').termsActive, true)
})
test('fee: a disputed qualifying milestone blocks it', () => {
  const rows = [row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'dispute', 'buyer')]
  assert.equal(assessFeeReadiness(deriveStates(rows), 'v1').state, 'disputed')
})
test('fee: a confirmed cancellation overrides', () => {
  const rows = [
    row('agreement_executed', 'report', 'developer'), row('agreement_executed', 'confirm', 'buyer'),
    row('qualifying_payment_reported', 'report', 'developer'), row('qualifying_payment_reported', 'confirm', 'buyer'),
    row('outcome_cancelled', 'report', 'buyer'), row('outcome_cancelled', 'confirm', 'developer'),
  ]
  assert.equal(assessFeeReadiness(deriveStates(rows), 'v1').state, 'cancelled_or_adjusted')
})

// ── duplicates ───────────────────────────────────────────────────────────
test('same account, email (any case) or phone (any formatting) is the same person', () => {
  assert.equal(isSamePerson({ user_id: 'u1' }, { user_id: 'u1' }), true)
  assert.equal(isSamePerson({ email: 'Ada@Mail.com ' }, { email: 'ada@mail.com' }), true)
  assert.equal(isSamePerson({ phone: '+44 7700 900123' }, { phone: '+447700900123' }), true)
})
test('different people are not flagged; empty fields never match', () => {
  assert.equal(isSamePerson({ email: 'a@x.com', phone: '+2348011111111' }, { email: 'b@x.com', phone: '+2348022222222' }), false)
  assert.equal(isSamePerson({ email: null, phone: null }, { email: null, phone: null }), false)
  assert.equal(normalisePhone('12'), null)
})

test('fee readiness applies the trigger the accepted agreement names, not a fixed pair', () => {
  const states = deriveStates([row('qualifying_payment_reported', 'report', 'developer'), row('qualifying_payment_reported', 'confirm', 'buyer')])
  assert.equal(assessFeeReadiness(states, 'v1').state, 'awaiting_confirmation')                          // default: both milestones needed
  assert.equal(assessFeeReadiness(states, 'v1', ['qualifying_payment_reported']).state, 'candidate_due') // agreement trigger: first payment alone
})
