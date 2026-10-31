import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balanceOf, isOverdue, partnerStatusLabel, newFeeReference, planPaymentRequest, planClaim, planDelayNote, planVerify, planDeadline, canSeePaymentRequest, snapshotFromTerms } from '../lib/fees'
import { computeSuccessFee } from '../lib/commercial-terms'

const today = new Date('2026-10-27T10:00:00Z')
const okReq = { calculationStatus: 'confirmed', calculationAmount: 1500000, agreementStatus: 'executed', dueDate: '2026-11-30', instructions: 'Bank X 123, quote reference', reason: 'Success fee', alreadyOpen: false }

test('a payment request needs a completed agreement and a CONFIRMED assessment, once', () => {
  assert.equal(planPaymentRequest(okReq, today).ok, true)
  assert.equal(planPaymentRequest({ ...okReq, calculationStatus: 'proposed' }, today).ok, false)
  assert.equal(planPaymentRequest({ ...okReq, agreementStatus: 'agreement_sent' }, today).ok, false)
  assert.match(planPaymentRequest({ ...okReq, alreadyOpen: true }, today).error!, /already exists/)       // a retry never makes a second obligation
  assert.equal(planPaymentRequest({ ...okReq, dueDate: '2026-10-01' }, today).ok, false)
  assert.equal(planPaymentRequest({ ...okReq, instructions: ' ' }, today).ok, false)
  assert.equal(planPaymentRequest({ ...okReq, calculationAmount: 0 }, today).ok, false)
})
test('only VERIFIED money reduces the balance; claims and rejections never do', () => {
  const b = balanceOf(1000, [{ status: 'claimed', amount_claimed: 1000 }, { status: 'rejected', amount_claimed: 1000 }])
  assert.equal(b.outstanding, 1000); assert.equal(b.status, 'issued'); assert.equal(b.claimedNotVerified, 1000)
  const p = balanceOf(1000, [{ status: 'verified', verified_amount: 400 }, { status: 'claimed', amount_claimed: 600 }])
  assert.equal(p.outstanding, 600); assert.equal(p.status, 'partly_paid')
  assert.equal(balanceOf(1000, [{ status: 'verified', verified_amount: 400 }, { status: 'verified', verified_amount: 600 }]).status, 'paid')
  assert.equal(balanceOf('1000.10', [{ status: 'verified', verified_amount: '0.10' }, { status: 'verified', verified_amount: '1000' }]).outstanding, 0)      // cents are exact
})
test('a passed deadline only makes it overdue; nothing is forgiven or cancelled', () => {
  assert.equal(isOverdue('2026-10-01', 500, 'issued', today), true)
  assert.equal(isOverdue('2026-10-01', 0, 'paid', today), false)
  assert.equal(isOverdue('2026-12-01', 500, 'issued', today), false)
  assert.equal(isOverdue('2026-10-01', 500, 'withdrawn', today), false)
  assert.match(partnerStatusLabel('issued', { overdue: true, claimedNotVerified: 0 }), /past the deadline/)
  assert.doesNotMatch(partnerStatusLabel('issued', { overdue: false, claimedNotVerified: 500 }), /^Paid/)           // a claim never reads as paid
  assert.match(partnerStatusLabel('issued', { overdue: false, claimedNotVerified: 500 }), /waiting for MANOP to verify/)
})
test('partner report needs method, amount, date not in the future, and a reference', () => {
  const c = { requestStatus: 'issued', method: 'bank_transfer', amount: '500', paidOn: '2026-10-20', reference: 'TRX1' }
  assert.equal(planClaim(c, today).ok, true)
  assert.equal(planClaim({ ...c, reference: '' }, today).ok, false)
  assert.equal(planClaim({ ...c, paidOn: '2026-12-01' }, today).ok, false)
  assert.equal(planClaim({ ...c, amount: '-1' }, today).ok, false)
  assert.equal(planClaim({ ...c, method: 'cash' }, today).ok, false)
  assert.equal(planClaim({ ...c, requestStatus: 'paid' }, today).ok, false)
  assert.equal(planClaim({ ...c, requestStatus: 'withdrawn' }, today).ok, false)
})
test('delay notes and extension requests change nothing but need a reason (and a date to ask for more time)', () => {
  assert.equal(planDelayNote({ requestStatus: 'issued', message: 'Funds arrive Friday', proposedDate: '2026-11-10', wantsExtension: true }, today).ok, true)
  assert.equal(planDelayNote({ requestStatus: 'issued', message: '', proposedDate: null, wantsExtension: false }, today).ok, false)
  assert.equal(planDelayNote({ requestStatus: 'issued', message: 'x', proposedDate: null, wantsExtension: true }, today).ok, false)
  assert.equal(planDelayNote({ requestStatus: 'issued', message: 'x', proposedDate: '2026-01-01', wantsExtension: false }, today).ok, false)
})
test('verification records a real amount, date and reference; partial allowed; never more than outstanding', () => {
  const v = { requestStatus: 'issued', outstanding: 1000, amount: 400, verifiedOn: '2026-10-25', reference: 'BANK-9', paymentStatus: 'claimed' }
  const r = planVerify(v, today); assert.equal(r.ok, true); assert.equal(r.partial, true)
  assert.equal(planVerify({ ...v, amount: 1000 }, today).partial, false)
  assert.equal(planVerify({ ...v, amount: 1000.01 }, today).ok, false)
  assert.equal(planVerify({ ...v, reference: ' ' }, today).ok, false)
  assert.equal(planVerify({ ...v, verifiedOn: '2026-12-01' }, today).ok, false)
  assert.equal(planVerify({ ...v, paymentStatus: 'verified' }, today).ok, false)
  assert.equal(planVerify({ ...v, requestStatus: 'withdrawn' }, today).ok, false)
})
test('deadline decisions only move later and are explained', () => {
  const d = { current: '2026-11-01', next: '2026-11-20', reason: 'Agreed', requestStatus: 'issued' }
  assert.equal(planDeadline(d, today).ok, true)
  assert.equal(planDeadline({ ...d, next: '2026-10-30' }, today).ok, false)
  assert.equal(planDeadline({ ...d, reason: '' }, today).ok, false)
  assert.equal(planDeadline({ ...d, requestStatus: 'paid' }, today).ok, false)
})
test('a partner sees only their own requests', () => {
  assert.equal(canSeePaymentRequest({ role: 'partner', userId: 'u1' }, { payer_user_id: 'u1' }), true)
  assert.equal(canSeePaymentRequest({ role: 'partner', userId: 'u2' }, { payer_user_id: 'u1' }), false)
  assert.equal(canSeePaymentRequest({ role: 'admin' }, { payer_user_id: 'u1' }), true)
})
test('references are unique-looking and well formed', () => {
  const a = newFeeReference(today), b = newFeeReference(today, () => 0.5)
  assert.match(a, /^MANOP-FEE-20261027-[A-Z2-9]{5}$/); assert.notEqual(a, b)
})

// ── agency vs developer terms ──
const terms = { id: 't1', status: 'approved', agency_success_fee_schedule: [{ up_to: null, rate_pct: 1.5 }], agency_fee_payer: 'agency',
  success_fee_schedule: [{ up_to: 500_000_000, rate_pct: 2 }, { up_to: 1_000_000_000, rate_pct: 1.5 }, { up_to: null, rate_pct: 1 }], fee_payer: 'developer', qualifying_milestones: ['qualifying_payment_reported'] }
const fee = (role: 'agency' | 'developer', value: number) => {
  const s = snapshotFromTerms(role, terms); assert.equal(s.ok, true)
  return computeSuccessFee({ basis: 'transaction_value', transactionValue: value, valueCurrency: 'NGN', feeCurrency: 'NGN', schedule: s.fields!.fee_schedule_snapshot })
}
test('agency agreement: flat 1.5% of the transaction value, agency pays', () => {
  const s = snapshotFromTerms('agency', terms); assert.equal(s.fields!.fee_payer, 'agency')
  assert.equal(fee('agency', 200_000_000).amount, 3_000_000)
  assert.equal(fee('agency', 2_000_000_000).amount, 30_000_000)       // flat: same rate at any value
})
test('developer agreement: the separate tiered schedule, developer pays; never the agency rate', () => {
  const s = snapshotFromTerms('developer', terms); assert.equal(s.fields!.fee_payer, 'developer')
  assert.equal(fee('developer', 200_000_000).amount, 4_000_000)       // 2% tier
  assert.equal(fee('developer', 2_000_000_000).amount, 20_000_000)    // 1% tier
  assert.notEqual(fee('developer', 200_000_000).amount, fee('agency', 200_000_000).amount)
})
test('terms must be approved and have the right schedule, or no agreement can be completed', () => {
  assert.equal(snapshotFromTerms('agency', null).ok, false)
  assert.equal(snapshotFromTerms('agency', { ...terms, status: 'draft' }).ok, false)
  assert.equal(snapshotFromTerms('agency', { ...terms, agency_success_fee_schedule: null }).ok, false)           // never falls back to the developer schedule
  assert.equal(snapshotFromTerms('developer', { ...terms, success_fee_schedule: [] }).ok, false)
})
