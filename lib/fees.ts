// lib/fees.ts
//
// Pure rules for fee assessment -> payment request -> payment claim -> payment verification. No network, no database, so each rule is tested.
// Stages are distinct and never inferred from one another:
//   assessment confirmed   MANOP reviewed the calculation and approved it for a payment request
//   payment request        ONE obligation per confirmed assessment (a retry never creates a second)
//   payment claimed        the partner says they paid / tried to pay. This is NOT proof of receipt.
//   payment verified       MANOP recorded the verified amount, date and reference. Only verified amounts reduce the balance.
// A pending or claimed payment is never "paid", cancelled or forgiven. A passed deadline only makes the obligation show as overdue.

export const PAYMENT_METHODS = ['bank_transfer', 'paystack', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type RequestStatus = 'issued' | 'partly_paid' | 'paid' | 'withdrawn'
export interface PaymentRow { status: 'claimed' | 'verified' | 'rejected'; amount_claimed?: number | string | null; verified_amount?: number | string | null }

const toMinor = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100)
const fromMinor = (m: number) => m / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))

/** Only VERIFIED amounts reduce what is owed. Claimed and rejected payments never do. */
export function balanceOf(amount: number | string, payments: PaymentRow[]) {
  const verified = payments.filter(p => p.status === 'verified').reduce((s, p) => s + toMinor(p.verified_amount), 0)
  const claimed = payments.filter(p => p.status === 'claimed').reduce((s, p) => s + toMinor(p.amount_claimed), 0)
  const outstanding = Math.max(0, toMinor(amount) - verified)
  const status: RequestStatus = outstanding === 0 ? 'paid' : verified > 0 ? 'partly_paid' : 'issued'
  return { verified: fromMinor(verified), outstanding: fromMinor(outstanding), claimedNotVerified: fromMinor(claimed), status }
}

export function isOverdue(dueDate: string, outstanding: number, status: string, today: Date = new Date()): boolean {
  return status !== 'withdrawn' && outstanding > 0 && dueDate < iso(today)
}

/** What the partner reads. Deliberately never says "paid" for a claim. */
export function partnerStatusLabel(status: RequestStatus, o: { overdue: boolean; claimedNotVerified: number }): string {
  if (status === 'withdrawn') return 'Withdrawn by MANOP'
  if (status === 'paid') return 'Paid in full (verified)'
  const base = status === 'partly_paid' ? 'Partly paid (verified), balance outstanding' : 'Payment requested'
  return `${base}${o.overdue ? ', past the deadline' : ''}${o.claimedNotVerified > 0 ? '. A payment you reported is waiting for MANOP to verify it' : ''}`
}

export function newFeeReference(now: Date = new Date(), rand: () => number = Math.random): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''
  for (let i = 0; i < 5; i++) s += a[Math.floor(rand() * a.length)]
  return `MANOP-FEE-${iso(now).replace(/-/g, '')}-${s}`
}

// ── MANOP issues the request ──────────────────────────────────────────────────────────────────────────────────────
export function planPaymentRequest(i: { calculationStatus: string | null; calculationAmount: unknown; agreementStatus: string | null; dueDate: unknown; instructions: unknown; reason: unknown; alreadyOpen: boolean }, today: Date = new Date()):
  { ok: boolean; error?: string } {
  if (i.agreementStatus !== 'executed') return { ok: false, error: 'A payment request needs a completed agreement.' }
  if (i.calculationStatus !== 'confirmed') return { ok: false, error: 'Review the fee assessment and mark it confirmed before requesting payment.' }
  if (i.alreadyOpen) return { ok: false, error: 'A payment request already exists for this assessment. Use it (change the deadline or send a reminder) instead of creating another.' }
  const amt = Number(i.calculationAmount); if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'The assessment has no amount to request.' }
  if (!isDate(i.dueDate)) return { ok: false, error: 'Set a payment deadline.' }
  if (i.dueDate < iso(today)) return { ok: false, error: 'The deadline cannot be in the past.' }
  if (typeof i.instructions !== 'string' || !i.instructions.trim()) return { ok: false, error: 'Say how the partner should pay (for example the bank account and the reference to quote).' }
  if (typeof i.reason !== 'string' || !i.reason.trim()) return { ok: false, error: 'State the reason for the charge (for example the qualifying transaction).' }
  return { ok: true }
}

// ── Partner reports a payment ─────────────────────────────────────────────────────────────────────────────────────
export function planClaim(i: { requestStatus: string; method: unknown; amount: unknown; paidOn: unknown; reference: unknown }, today: Date = new Date()): { ok: boolean; error?: string } {
  if (i.requestStatus === 'withdrawn') return { ok: false, error: 'This payment request was withdrawn.' }
  if (i.requestStatus === 'paid') return { ok: false, error: 'This request is already paid in full.' }
  if (!(PAYMENT_METHODS as readonly string[]).includes(i.method as string)) return { ok: false, error: 'Choose how you paid.' }
  const amt = Number(i.amount); if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter the amount you paid.' }
  if (!isDate(i.paidOn)) return { ok: false, error: 'Enter the date you paid.' }
  if (i.paidOn > iso(today)) return { ok: false, error: 'The payment date cannot be in the future.' }
  if (typeof i.reference !== 'string' || !i.reference.trim()) return { ok: false, error: 'Enter the payment reference from your bank or provider, so MANOP can find it.' }
  return { ok: true }
}

/** The partner explains a delay and may propose a date. It changes nothing about what is owed or the deadline. */
export function planDelayNote(i: { requestStatus: string; message: unknown; proposedDate: unknown; wantsExtension: boolean }, today: Date = new Date()): { ok: boolean; error?: string } {
  if (i.requestStatus === 'withdrawn' || i.requestStatus === 'paid') return { ok: false, error: 'There is nothing outstanding on this request.' }
  if (typeof i.message !== 'string' || !i.message.trim()) return { ok: false, error: 'Tell MANOP the reason.' }
  if (i.proposedDate != null && i.proposedDate !== '') { if (!isDate(i.proposedDate)) return { ok: false, error: 'The proposed date is not valid.' }; if (i.proposedDate < iso(today)) return { ok: false, error: 'The proposed date cannot be in the past.' } }
  if (i.wantsExtension && !i.proposedDate) return { ok: false, error: 'Propose the date you can pay by.' }
  return { ok: true }
}

// ── MANOP verifies ───────────────────────────────────────────────────────────────────────────────────────────────
export function planVerify(i: { requestStatus: string; outstanding: number; amount: unknown; verifiedOn: unknown; reference: unknown; paymentStatus?: string }, today: Date = new Date()): { ok: boolean; error?: string; partial?: boolean; amount?: number } {
  if (i.requestStatus === 'withdrawn') return { ok: false, error: 'This payment request was withdrawn.' }
  if (i.paymentStatus && i.paymentStatus !== 'claimed') return { ok: false, error: 'That payment has already been decided.' }
  const amt = Number(i.amount); if (!Number.isFinite(amt) || amt <= 0) return { ok: false, error: 'Enter the amount you actually received.' }
  if (toMinor(amt) > toMinor(i.outstanding)) return { ok: false, error: 'The verified amount is more than the outstanding balance. Record only what the request covers.' }
  if (!isDate(i.verifiedOn)) return { ok: false, error: 'Enter the date the money was received.' }
  if (i.verifiedOn > iso(today)) return { ok: false, error: 'The received date cannot be in the future.' }
  if (typeof i.reference !== 'string' || !i.reference.trim()) return { ok: false, error: 'Enter the bank or provider reference you verified against.' }
  return { ok: true, amount: amt, partial: toMinor(amt) < toMinor(i.outstanding) }
}

/** Deadline decisions: a new deadline can only move later than the current one, and is recorded with the decision. */
export function planDeadline(i: { current: string; next: unknown; reason: unknown; requestStatus: string }, today: Date = new Date()): { ok: boolean; error?: string } {
  if (i.requestStatus === 'withdrawn' || i.requestStatus === 'paid') return { ok: false, error: 'There is nothing outstanding on this request.' }
  if (!isDate(i.next)) return { ok: false, error: 'Choose the new deadline.' }
  if (i.next <= i.current) return { ok: false, error: 'The new deadline must be later than the current one.' }
  if (i.next < iso(today)) return { ok: false, error: 'The new deadline cannot be in the past.' }
  if (typeof i.reason !== 'string' || !i.reason.trim()) return { ok: false, error: 'Record the reason for the decision.' }
  return { ok: true }
}

/** May this person see or answer this payment request? Only the party it was issued to (or MANOP). */
export function canSeePaymentRequest(v: { role: 'admin' } | { role: 'partner'; userId: string }, r: { payer_user_id: string }): boolean {
  return v.role === 'admin' || v.userId === r.payer_user_id
}

// ── Terms by party: what an executed agreement snapshots ─────────────────────────────────────────────────────────
/** The fee terms an agreement keeps, taken from the approved terms version it was prepared with. Agencies get the AGENCY schedule and pay
 *  as the agency; developers get the DEVELOPER schedule and pay as the developer. Neither is ever applied to the other. */
export function snapshotFromTerms(role: 'agency' | 'developer', v: Record<string, any> | null):
  { ok: boolean; error?: string; fields?: Record<string, unknown> } {
  if (!v) return { ok: false, error: 'No approved commercial terms version is linked to this agreement, so no fee terms can be recorded.' }
  if (v.status !== 'approved') return { ok: false, error: 'The linked commercial terms version is not approved.' }
  const schedule = role === 'agency' ? v.agency_success_fee_schedule : v.success_fee_schedule
  if (!Array.isArray(schedule) || schedule.length === 0) return { ok: false, error: role === 'agency' ? 'The linked terms have no agency success-fee schedule.' : 'The linked terms have no developer success-fee schedule.' }
  return { ok: true, fields: {
    terms_version_id: v.id, fee_schedule_snapshot: schedule, fee_basis: 'transaction_value', relationship_kind: 'sale',
    fee_payer: role === 'agency' ? (v.agency_fee_payer || 'agency') : (v.fee_payer || 'developer'),
    qualifying_milestones_snapshot: Array.isArray(v.qualifying_milestones) && v.qualifying_milestones.length ? v.qualifying_milestones : null,
  } }
}
