// lib/market-intelligence.ts
//
// Market Intelligence: shared types, thresholds and the pure logic that turns what
// MANOP actually holds into (a) a statement of what is known, (b) what is not known,
// and (c) investigation prompts. No figure here is invented: every number comes from
// the rows passed in. Raw platform activity (views, searches, enquiries) is
// deliberately NOT part of this model — it stays in the admin Activity view.

import type { MarketLocation } from './locations'
import type { ArticleListRow } from './research'

export const SITE_URL = 'https://manopintel.com'

// A median sold price needs at least this many independently verified transactions.
export const MIN_VERIFIED_TXNS_FOR_PRICE = 3

export interface MiDevelopment { id: string; name: string; neighborhood: string | null; city: string | null; stage: string | null; total_units: number | null; handover_date: string | null; reviewed_at: string | null }
export interface MiSite { id: string; reference: string | null; neighborhood: string | null; city: string | null; area_sqm: number | null; opportunity_type: string | null; reviewed_at: string | null }
export interface MiTransactionStats { count: number; median: number | null; latest: string | null }
export interface MiPlanningEvidence { developmentsWithPlanningEvidence: number; total: number }

export type MiSection = 'developments' | 'sites' | 'transactions' | 'evidence' | 'articles'

export interface LocationIntelligence {
  location: MarketLocation
  developments: MiDevelopment[]
  sites: MiSite[]
  transactions: MiTransactionStats
  planning: MiPlanningEvidence | null   // null = evidence register not readable
  articles: ArticleListRow[]
  /** sections that failed to load: shown as "unavailable", never as zero */
  unavailable: MiSection[]
}

/** Worth indexing and linking to: MANOP actually holds something about this place. */
export function isMeaningful(i: LocationIntelligence): boolean {
  return i.developments.length > 0 || i.sites.length > 0 || i.articles.length > 0 || i.transactions.count > 0
}

export function medianOf(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function transactionStats(rows: { sold_price: number | null; sold_at: string | null }[]): MiTransactionStats {
  const prices = rows.map(r => r.sold_price).filter((p): p is number => typeof p === 'number' && p > 0)
  const dates = rows.map(r => r.sold_at).filter((d): d is string => !!d).sort()
  return {
    count: rows.length,
    median: prices.length >= MIN_VERIFIED_TXNS_FOR_PRICE ? medianOf(prices) : null, // withheld below the threshold
    latest: dates.length ? dates[dates.length - 1] : null,
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The single factual sentence under the heading. */
export function summaryLine(i: LocationIntelligence): string {
  const l = i.location.label
  const parts: string[] = []
  if (!i.unavailable.includes('developments') && i.developments.length) parts.push(plural(i.developments.length, 'reviewed development', 'reviewed developments'))
  if (!i.unavailable.includes('sites') && i.sites.length) parts.push(plural(i.sites.length, 'reviewed site', 'reviewed sites'))
  if (!i.unavailable.includes('transactions') && i.transactions.count) parts.push(plural(i.transactions.count, 'verified transaction', 'verified transactions'))
  if (!parts.length) return `MANOP does not yet hold reviewed evidence for ${l}.`
  return `For ${l}, MANOP currently holds ${parts.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`
}

export function buildGaps(i: LocationIntelligence): { gaps: string[]; investigate: string[] } {
  const l = i.location.label
  const gaps: string[] = []
  const inv: string[] = []
  const un = (s: MiSection) => i.unavailable.includes(s)

  if (!un('transactions')) {
    if (i.transactions.count === 0) gaps.push(`No verified transactions are currently available for ${l}.`)
    else if (i.transactions.count < MIN_VERIFIED_TXNS_FOR_PRICE) gaps.push(`${plural(i.transactions.count, 'verified transaction is', 'verified transactions are')} available for ${l}: insufficient to calculate a meaningful market statistic.`)
  }
  if (!un('developments') && i.developments.length === 0) gaps.push(`MANOP has not yet reviewed a development in ${l}.`)
  if (!un('sites') && i.sites.length === 0) gaps.push(`No reviewed sites are currently available for ${l}.`)
  if (i.planning && i.planning.total > 0 && i.planning.developmentsWithPlanningEvidence < i.planning.total) {
    gaps.push(`Planning evidence is documented or verified for ${i.planning.developmentsWithPlanningEvidence} of ${plural(i.planning.total, 'reviewed development', 'reviewed developments')}. Current planning information requires further verification.`)
  }
  gaps.push('Inflation and other macroeconomic indicators are not yet held by MANOP for this location.')

  inv.push('What planning instrument and development controls apply here?')
  inv.push('What infrastructure changes are planned or under way nearby?')
  if (i.transactions.count < MIN_VERIFIED_TXNS_FOR_PRICE) inv.push('What additional, independently verifiable transaction evidence exists for this area?')
  if (i.developments.length) inv.push('Which title and planning claims on these developments need professional verification?')
  return { gaps, investigate: inv }
}