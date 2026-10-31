// app/api/admin/agreements/[id]/calculation/route.ts — save a fee calculation snapshot against a request.
// ONE calculation path: computeSuccessFee() from lib/commercial-terms.ts, using the schedule SNAPSHOT the executed agreement accepted.
// (The earlier version of this route used proposed_fee_rate_pct / a 25% commission share, which the founder's tiered schedule superseded,
// so it could store a figure that disagreed with the fee assessment shown in the Deal Room. Those rules are no longer used here.)
// This row is the QUALIFYING TRANSACTION + FEE ASSESSMENT record. It starts PROPOSED; MANOP reviews it and marks it CONFIRMED, and only a confirmed
// assessment can have a payment request (see /api/admin/fees). Calculating, confirming and requesting payment are separate steps.
// Guards: only an EXECUTED agreement is calculated; one live calculation per transaction (development + deal reference); a different paying
// party for the same transaction is refused unless a documented arrangement is recorded.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../../lib/admin-guard'
import { UUID_RE } from '../../../../../../lib/agreements-server'
import { computeSuccessFee, num, SUPPORTED_CURRENCIES } from '../../../../../../lib/commercial-terms'
import { checkFeeObligation } from '../../../../../../lib/agency-commercial'

const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID_RE.test(params.id)) return bad('Invalid id.')
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return bad('Invalid request.') }
    const g = await requireAdmin(req); if ('error' in g) return g.error
    const { data: q } = await g.sb.from('agreement_requests').select('*').eq('id', params.id).maybeSingle()
    if (!q) return bad('Request not found.', 404)

    const option = (body.option ?? q.agreed_option ?? q.preferred_option) as string
    if (option === 'agency_commission_share') return bad('Agency commission sharing is superseded: MANOP does not take a share of agency commission by default. Only the success fee is calculated here.', 409)
    if (option !== 'transaction_fee') return bad('Only the transaction success fee can be calculated.')
    if (q.status !== 'executed') return bad(`A fee is calculated only from an executed agreement's accepted terms. This request is "${q.status}".`, 409)
    if (!q.terms_version_id || !q.fee_schedule_snapshot) return bad('This executed agreement has no terms snapshot recorded, so no fee can be calculated from it. Resolve this with the agreement owner.', 409)

    const { data: ver } = await g.sb.from('commercial_terms_versions').select('fee_currency').eq('id', q.terms_version_id).maybeSingle()
    const feeCurrency = (ver?.fee_currency ?? '').toUpperCase()
    const valueCurrency = (txt(body.currency, 3) ?? q.currency ?? '').toUpperCase()
    if (valueCurrency && !SUPPORTED_CURRENCIES.includes(valueCurrency)) return bad(`Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}.`)
    const value = num(body.transaction_value)

    const result = computeSuccessFee({
      basis: q.fee_basis, relationshipKind: q.relationship_kind, basisConfirmed: body.basis_confirmed === true,
      transactionValue: value, valueCurrency, feeCurrency, schedule: q.fee_schedule_snapshot, fixedAmount: q.agreed_fixed_fee_amount,
    })
    if (result.status === 'requires_information') return NextResponse.json({ error: 'The calculation needs more information.', missing: result.missing }, { status: 422 })
    if (result.status === 'requires_review') return NextResponse.json({ error: 'This needs admin review against the agreement before any amount is recorded.', notes: result.notes }, { status: 422 })

    let developmentId: string | null = null
    if (typeof body.development_id === 'string') {
      if (!UUID_RE.test(body.development_id)) return bad('Invalid development.')
      const { data: link } = await g.sb.from('agreement_request_developments').select('project_id').eq('request_id', params.id).eq('project_id', body.development_id).maybeSingle()
      if (!link) return bad('That development is not part of this request.')
      developmentId = body.development_id
    }
    const dealRef = txt(body.deal_reference, 200)
    // The qualifying transaction record: when it happened and what supports it (needs phase26).
    const txDate = typeof body.transaction_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.transaction_date) && !isNaN(Date.parse(body.transaction_date)) ? body.transaction_date : null
    if (!txDate) return bad('Record the date of the qualifying transaction.')
    if (txDate > new Date().toISOString().slice(0, 10)) return bad('The transaction date cannot be in the future.')

    // Duplicate / double-charge guard, across ALL requests that cover this development, not only this one.
    const payer = q.fee_payer === 'agency' || q.fee_payer === 'developer' ? q.fee_payer : null
    let existing: { id: string; status: string; payer: 'developer' | 'agency' | null; development_id: string | null; deal_reference: string | null }[] = []
    if (developmentId) {
      const { data: reqs } = await g.sb.from('agreement_request_developments').select('request_id').eq('project_id', developmentId)
      const ids = Array.from(new Set((reqs ?? []).map((r: any) => r.request_id)))
      if (ids.length) {
        const [{ data: calcs }, { data: rq }] = await Promise.all([
          g.sb.from('agreement_fee_calculations').select('id,status,request_id,development_id,deal_reference').in('request_id', ids),
          g.sb.from('agreement_requests').select('id,fee_payer').in('id', ids),
        ])
        const payerOf = new Map((rq ?? []).map((r: any) => [r.id, r.fee_payer]))
        existing = (calcs ?? []).map((c: any) => ({ id: c.id, status: c.status, payer: (payerOf.get(c.request_id) as any) ?? null, development_id: c.development_id, deal_reference: c.deal_reference }))
      }
    } else {
      const { data: calcs } = await g.sb.from('agreement_fee_calculations').select('id,status,development_id,deal_reference').eq('request_id', params.id)
      existing = (calcs ?? []).map((c: any) => ({ id: c.id, status: c.status, payer, development_id: c.development_id, deal_reference: c.deal_reference }))
    }
    const guard = checkFeeObligation({ development_id: developmentId, deal_reference: dealRef, payer, existing, documentedArrangement: txt(body.documented_arrangement) })
    if (!guard.ok) return NextResponse.json({ error: guard.error, existing_calculation_id: guard.supersedes ?? null }, { status: 409 })

    const row = {
      request_id: params.id, development_id: developmentId, deal_reference: dealRef, option: 'transaction_fee',
      inputs: { transaction_value: value, value_currency: valueCurrency, fee_currency: feeCurrency, terms_version_id: q.terms_version_id, fee_basis: q.fee_basis, relationship_kind: q.relationship_kind,
        fee_schedule_snapshot: q.fee_schedule_snapshot, rate_pct: result.rate_pct, tier_index: result.tier_index, fee_payer: q.fee_payer, request_status_at_calculation: q.status },
      amount: result.amount, currency: result.currency, formula: result.formula,
      calculation_basis: txt(body.calculation_basis), value_source: txt(body.value_source), commission_source: null,
      attribution_reference: txt(body.attribution_reference, 200), attribution_notes: txt(body.attribution_notes), notes: txt(body.notes),
      transaction_date: txDate, supporting_info: txt(body.supporting_info, 4000),
      status: 'proposed', is_binding: false, calculated_by: g.user.id,
    }
    const { data, error } = await g.sb.from('agreement_fee_calculations').insert(row).select().single()
    if (error) return bad(error.message)
    await g.sb.from('agreement_request_events').insert({ request_id: params.id, actor_user_id: g.user.id, actor_role: 'admin', event_type: 'calculation_recorded', visible_to_requester: false, message: row.notes, metadata: { calculation_id: data.id, amount: row.amount, currency: row.currency, rate_pct: result.rate_pct } })
    return NextResponse.json({ calculation: data, notes: result.notes }, { status: 201 })
  } catch (e: unknown) {
    console.error('POST fee calculation', e)
    return bad(e instanceof Error ? e.message : 'Server error', 500)
  }
}
