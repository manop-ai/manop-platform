// lib/mortgage-comparison.ts — orders the products MANOP has matched against a saved scenario, so a buyer can see which ones are worth
// asking about first. This is NOT a recommendation and NOT a lender decision:
//   - products that meet the recorded criteria checked come first; within a group, the lowest indicative repayment comes first;
//   - repayment is an arithmetic illustration at the product's RECORDED rate range, on the buyer's own loan and term; it is not a quote;
//   - anything not assessed is listed as not assessed; stale or unconfirmed products are never presented as available.
import { calculateMortgagePayment } from './finance-intelligence'
import type { ProductMatch, MatchVerdict } from './finance-products'

export interface ComparedProduct {
  match: ProductMatch
  group: 'worth_asking' | 'needs_more_information' | 'not_current' | 'does_not_fit'
  monthlyLow: number | null    // at the recorded minimum rate
  monthlyHigh: number | null   // at the recorded maximum rate
  totalLow: number | null
  totalHigh: number | null
  rateText: string
}

const GROUP: Record<MatchVerdict, ComparedProduct['group']> = {
  meets_recorded: 'worth_asking', insufficient_information: 'needs_more_information', confirmation_required: 'not_current', stale: 'not_current', does_not_meet: 'does_not_fit',
}
export const GROUP_LABEL: Record<ComparedProduct['group'], string> = {
  worth_asking: 'Meets the recorded criteria checked: worth asking the lender about',
  needs_more_information: 'Needs more information from you before MANOP can say',
  not_current: 'Information is not current or not confirmed: ask MANOP to re-check',
  does_not_fit: 'Does not meet a recorded criterion',
}
const ORDER: ComparedProduct['group'][] = ['worth_asking', 'needs_more_information', 'not_current', 'does_not_fit']
const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

export function compareProducts(matches: ProductMatch[], scenario: { loanNgn: number; tenorYears: number }): ComparedProduct[] {
  const rows: ComparedProduct[] = matches.map(m => {
    const lo = m.product.min_rate_pct, hi = m.product.max_rate_pct
    const can = ok(scenario.loanNgn) && ok(scenario.tenorYears)
    const monthly = (r: number | null) => (can && typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.round(calculateMortgagePayment(scenario.loanNgn, r, scenario.tenorYears)) : null)
    const mLow = monthly(lo ?? hi), mHigh = monthly(hi ?? lo)
    const rateText = lo != null && hi != null ? (lo === hi ? `${lo}% p.a.` : `${lo}% to ${hi}% p.a.`) : lo != null || hi != null ? `${lo ?? hi}% p.a.` : 'Rate not recorded'
    return {
      match: m, group: GROUP[m.verdict], monthlyLow: mLow, monthlyHigh: mHigh, rateText,
      totalLow: mLow != null ? mLow * scenario.tenorYears * 12 : null, totalHigh: mHigh != null ? mHigh * scenario.tenorYears * 12 : null,
    }
  })
  return rows.sort((a, b) => {
    const g = ORDER.indexOf(a.group) - ORDER.indexOf(b.group)
    if (g) return g
    const am = a.monthlyLow ?? Number.POSITIVE_INFINITY, bm = b.monthlyLow ?? Number.POSITIVE_INFINITY
    return am - bm || a.match.product.lender_name.localeCompare(b.match.product.lender_name)
  })
}

/** One honest summary sentence for the top of the comparison. */
export function comparisonSummary(rows: ComparedProduct[]): string {
  const w = rows.filter(r => r.group === 'worth_asking')
  if (!rows.length) return 'MANOP has no current product records to compare yet.'
  if (!w.length) return 'None of the products MANOP currently holds meets the recorded criteria checked for this scenario. See why under each product.'
  const priced = w.filter(r => r.monthlyLow != null)
  const first = priced[0]
  return `${w.length} product${w.length === 1 ? '' : 's'} meet the recorded criteria checked.${first ? ` The lowest indicative repayment among them is about ₦${first.monthlyLow!.toLocaleString('en-NG')} a month (${first.match.product.lender_name}, ${first.match.product.product_name}), at its recorded rate. This is an illustration, not a quote or a lender decision.` : ''}`
}