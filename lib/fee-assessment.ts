// lib/fee-assessment.ts — resolves "is a MANOP success fee due on this introduction, and how much?" by COMBINING two owners' facts
// without duplicating either:
//   Deal Room (milestones + evidence)  ->  MilestoneState from lib/deal-room.ts (consumed, never re-derived here)
//   Commercial (executed agreement)     ->  the agreement row and its immutable snapshot
// The Deal Room's own assessFeeReadiness() says whether ITS qualifying milestones are established. THIS function applies the trigger
// that the ACCEPTED AGREEMENT names (default: the developer's first qualifying payment) and calculates from the agreement's own stored
// schedule. Neither marks anything paid; neither makes a fee legally due.
//
// OPEN POINT for the Deal Room work: lib/deal-room.ts QUALIFYING_MILESTONES currently requires BOTH agreement_executed AND
// qualifying_payment_reported. The trigger belongs to the AGREEMENT (qualifying_milestones_snapshot), so assessFeeReadiness should take it
// as a parameter instead of a constant. Admin-recorded fee assessments (agreement_fee_calculations, lib/fees.ts) do not depend on this.

import type { MilestoneState } from './deal-room'
import { computeSuccessFee, type FeeBasis, type RelationshipKind, type SuccessFeeResult } from './commercial-terms'

const ESTABLISHED = ['confirmed_by_both', 'admin_resolved']

export type TriggerState = 'not_reported' | 'awaiting_confirmation' | 'established' | 'disputed' | 'cancelled_or_adjusted'

/** Applies the agreement's own list of qualifying milestones to the Deal Room's derived states. Silence is never confirmation. */
export function triggerState(states: Record<string, MilestoneState | undefined>, qualifying: string[]): TriggerState {
  const st = (m: string) => states[m]?.status ?? 'not_reported'
  if (ESTABLISHED.includes(st('outcome_cancelled'))) return 'cancelled_or_adjusted'
  if (qualifying.some(m => st(m) === 'disputed')) return 'disputed'
  if (qualifying.length > 0 && qualifying.every(m => ESTABLISHED.includes(st(m)))) return 'established'
  if (qualifying.some(m => st(m) !== 'not_reported')) return 'awaiting_confirmation'
  return 'not_reported'
}

export interface CoveringAgreement {
  agreement_id: string; reference: string; status: string; fee_payer: string; fee_basis: FeeBasis; relationship_kind: RelationshipKind
  fee_schedule_snapshot: unknown; qualifying_milestones_snapshot: string[] | null; agreed_fixed_fee_amount: number | null; fee_currency: string | null
  rate_schedule_version: string | null
}

export type FeeAssessmentState = 'no_covering_agreement' | 'awaiting_trigger' | 'disputed' | 'cancelled_or_adjusted' | 'requires_review' | 'requires_information' | 'calculated'
export interface CommercialFeeAssessment {
  state: FeeAssessmentState
  explanation: string
  trigger: TriggerState | null
  calculation: SuccessFeeResult | null
  agreementReference: string | null
  rateScheduleVersion: string | null
  binding: false
}

export function assessCommercialFee(i: {
  agreement: CoveringAgreement | null
  states: Record<string, MilestoneState | undefined>
  transactionValue: unknown; valueCurrency: string | null | undefined; basisConfirmed?: boolean
}): CommercialFeeAssessment {
  const base = { binding: false as const, agreementReference: i.agreement?.reference ?? null, rateScheduleVersion: i.agreement?.rate_schedule_version ?? null }
  const a = i.agreement
  if (!a || a.status !== 'executed') {
    return { ...base, state: 'no_covering_agreement', trigger: null, calculation: null, explanation: 'No executed agreement covers this development or site, so no fee can be assessed. A proposed rate is never applied as if accepted.' }
  }
  const qualifying = a.qualifying_milestones_snapshot?.length ? a.qualifying_milestones_snapshot : ['qualifying_payment_reported']
  const trig = triggerState(i.states, qualifying)
  if (trig === 'cancelled_or_adjusted') return { ...base, state: 'cancelled_or_adjusted', trigger: trig, calculation: null, explanation: 'The transaction is recorded as cancelled. Any fee needs review for adjustment under the agreement.' }
  if (trig === 'disputed') return { ...base, state: 'disputed', trigger: trig, calculation: null, explanation: 'A qualifying milestone is disputed. Resolve it before a fee is considered.' }
  if (trig !== 'established') return { ...base, state: 'awaiting_trigger', trigger: trig, calculation: null, explanation: trig === 'awaiting_confirmation' ? 'A qualifying event has been reported but is not yet confirmed by both parties (or resolved by MANOP).' : 'The qualifying event named in the agreement has not been reported.' }
  const calc = computeSuccessFee({
    basis: a.fee_basis, relationshipKind: a.relationship_kind, basisConfirmed: i.basisConfirmed,
    transactionValue: i.transactionValue, valueCurrency: i.valueCurrency, feeCurrency: a.fee_currency,
    schedule: a.fee_schedule_snapshot, fixedAmount: a.agreed_fixed_fee_amount,
  })
  const state: FeeAssessmentState = calc.status === 'calculated' ? 'calculated' : calc.status
  return { ...base, state, trigger: trig, calculation: calc, explanation: calc.status === 'calculated' ? 'The qualifying event is established and a calculation was made from the accepted agreement. This is a record for admin review, not an invoice.' : calc.status === 'requires_review' ? 'This arrangement needs an admin to review the agreed basis before any amount is calculated.' : 'More information is needed to calculate: ' + calc.missing.join('; ') + '.' }
}