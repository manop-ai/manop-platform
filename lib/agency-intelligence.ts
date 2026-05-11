// lib/agency-intelligence.ts
// ─────────────────────────────────────────────────────────────────────────────
// MANOP AGENCY INTELLIGENCE FRAMEWORK
//
// The core strategic insight:
// Agencies don't give us data because we ask for it.
// They give us data because it makes them look better to buyers
// and helps them close deals faster.
//
// The exchange:
//   Agency gives → verified sold prices, payment types, days on market
//   Manop gives  → Market Score badge, "Data Contributor" status,
//                  higher ranking, access to buyer intelligence
//
// The deduplication model:
//   Every listing gets a canonical fingerprint from 5 signals.
//   Duplicates are silently merged — best version wins.
//   The agency that owns the canonical version keeps the lead.
//
// The pricing transparency model:
//   We NEVER show individual deal prices publicly.
//   We only show neighborhood-level aggregates:
//   "3-beds in Lekki Ph 1 — median sold ₦290M, 91% of asking, 18 days avg"
//   This is not a threat to agencies. It IS the market.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'mortgage' | 'installment' | 'mixed'

export type TransactionVerification =
  | 'agency_confirmed'    // Agent says it sold — lowest weight
  | 'deed_of_assignment'  // Legal transfer document
  | 'bank_confirmation'   // Bank confirms mortgage or transfer
  | 'manop_verified'      // Manop staff verified

export interface MarketTransaction {
  id?:                  string
  neighborhood:         string
  city:                 string
  country_code:         string
  bedrooms:             number | null
  property_type:        string | null

  // Pricing — the core data we need
  asking_price:         number | null   // what they listed at
  sold_price:           number          // what it actually sold for ← KEY
  currency_code:        string

  // How it was bought — tracks market financing trends
  payment_method:       PaymentMethod
  mortgage_pct?:        number          // % of price via mortgage (0-100)
  installment_months?:  number          // if installment plan, how many months
  installment_deposit_pct?: number      // upfront deposit %

  // Market velocity
  sold_at:              string          // ISO date
  days_on_market:       number | null
  annual_rent?:         number | null   // if subsequently rented out

  // Provenance — determines data quality weight
  submitted_by:         string          // partner ID
  verification_status:  TransactionVerification
  verification_notes?:  string
}

// ─── Market Score — the agency's public rating ───────────────────────────────
// This replaces the vague "trust level" with something agencies actually want:
// a number that tells buyers "this agency knows the market"

export interface AgencyMarketScore {
  partnerId:         string
  agencyName:        string
  score:             number           // 0–100
  tier:              MarketScoreTier
  label:             string
  color:             string
  bg:                string
  border:            string
  transactionCount:  number           // how many verified transactions submitted
  listingCount:      number
  avgDaysToSell?:    number           // their listings vs market average
  priceAccuracy?:    number           // % how close asking was to sold (their listings)
  dataContributor:   boolean          // contributed transaction data
  lastUpdated:       string
}

export type MarketScoreTier = 'market-leader' | 'active' | 'listed' | 'new'

export const MARKET_SCORE_TIERS: Record<MarketScoreTier, {
  label: string; color: string; bg: string; border: string
  minScore: number; description: string
}> = {
  'market-leader': {
    label: 'Market leader', color: '#7C5FFF', bg: 'rgba(124,95,255,0.1)', border: 'rgba(124,95,255,0.3)',
    minScore: 80,
    description: 'Top-tier agency. Consistently accurate listings, fast closures, and verified transaction data.',
  },
  'active': {
    label: 'Active agency', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)',
    minScore: 50,
    description: 'Active Manop partner with verified listings and good market track record.',
  },
  'listed': {
    label: 'Listed agency', color: '#14B8A6', bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.2)',
    minScore: 20,
    description: 'Registered on Manop. Building their track record.',
  },
  'new': {
    label: 'New to Manop', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)',
    minScore: 0,
    description: 'Recently joined. No performance data yet.',
  },
}

export function computeMarketScore(opts: {
  listingCount:      number
  transactionCount:  number
  verifiedTxCount:   number    // transactions with deed/bank confirmation
  monthsActive:      number
  avgPriceAccuracy?: number    // 0-100: how close asking was to sold
  avgDaysToSell?:    number    // their avg vs market (lower is better)
  marketAvgDays?:    number
  hasCAC:            boolean
  disputedCount:     number
}): number {
  const {
    listingCount, transactionCount, verifiedTxCount, monthsActive,
    avgPriceAccuracy, avgDaysToSell, marketAvgDays,
    hasCAC, disputedCount,
  } = opts

  let score = 0

  // Base: just being registered and active
  score += Math.min(10, monthsActive * 0.8)

  // Listings — shows market presence
  score += Math.min(15, listingCount * 0.5)

  // Transaction data — the most important signal
  // Each transaction submitted = +3 points, verified = +5 points
  score += Math.min(30, transactionCount * 3)
  score += Math.min(20, verifiedTxCount * 5)

  // Price accuracy: how honest were their listings vs what actually sold
  if (avgPriceAccuracy !== undefined) {
    // 90-100% accuracy = 10 pts, 70-89% = 5 pts, <70% = 0 (inflated prices)
    if (avgPriceAccuracy >= 90)      score += 10
    else if (avgPriceAccuracy >= 70) score += 5
  }

  // Speed: closing faster than market average
  if (avgDaysToSell !== undefined && marketAvgDays !== undefined && marketAvgDays > 0) {
    const ratio = avgDaysToSell / marketAvgDays
    if (ratio < 0.7) score += 8       // closing 30%+ faster than market
    else if (ratio < 0.9) score += 4  // somewhat faster
    else if (ratio > 1.5) score -= 5  // much slower (stale listings)
  }

  // CAC = formal business registration
  if (hasCAC) score += 7

  // Penalties
  score -= disputedCount * 5

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function getMarketScoreTier(score: number): MarketScoreTier {
  if (score >= 80) return 'market-leader'
  if (score >= 50) return 'active'
  if (score >= 20) return 'listed'
  return 'new'
}

// ─── What an agency needs to improve their score ─────────────────────────────

export interface ScoreImprovementItem {
  action:      string
  impact:      'high' | 'medium' | 'low'
  points:      number         // approximate score boost
  description: string
  cta?:        string         // button label
  ctaAction?:  string         // internal action key
}

export function getScoreImprovements(opts: {
  score:            number
  listingCount:     number
  transactionCount: number
  hasCAC:           boolean
  monthsActive:     number
}): ScoreImprovementItem[] {
  const { score, listingCount, transactionCount, hasCAC } = opts
  const items: ScoreImprovementItem[] = []

  if (transactionCount === 0) {
    items.push({
      action: 'Submit your first sold transaction',
      impact: 'high',
      points: 15,
      description: 'Tell Manop what a property actually sold for — neighborhood, bedrooms, sold price, days on market. No names. No addresses. Your Market Score jumps immediately.',
      cta: 'Submit transaction data',
      ctaAction: 'goto_transactions',
    })
  } else if (transactionCount < 5) {
    items.push({
      action: `Submit ${5 - transactionCount} more transactions`,
      impact: 'high',
      points: (5 - transactionCount) * 3,
      description: 'Each verified transaction adds to your Market Score and improves Manop\'s neighborhood benchmarks — making your own listings more credible.',
      cta: 'Submit now',
      ctaAction: 'goto_transactions',
    })
  }

  if (!hasCAC) {
    items.push({
      action: 'Verify your business registration',
      impact: 'medium',
      points: 7,
      description: 'Send your CAC certificate to partners@manopintel.com. One-time verification. Unlocks the Verified badge on all your listings.',
      cta: 'Email verification',
      ctaAction: 'email_cac',
    })
  }

  if (listingCount < 10) {
    items.push({
      action: `Add ${10 - listingCount} more listings`,
      impact: 'medium',
      points: Math.round((10 - listingCount) * 0.5),
      description: 'More active listings increases your market presence score. Ensure prices are realistic — Manop flags listings significantly above neighborhood median.',
      cta: 'Add listing',
      ctaAction: 'goto_add_listing',
    })
  }

  if (score >= 50 && transactionCount >= 5) {
    items.push({
      action: 'Get deed-verified transactions',
      impact: 'high',
      points: 10,
      description: 'Upgrade existing transaction submissions from "agent confirmed" to deed of assignment or bank confirmation. Each verified transaction is worth 5 points vs 3.',
      cta: 'Learn how',
      ctaAction: 'learn_verification',
    })
  }

  return items
}

// ─── Deduplication engine ─────────────────────────────────────────────────────
// The problem: same property gets listed by multiple agencies, or the same
// agency lists it multiple times under slightly different descriptions.
//
// The model: 5-signal fingerprint. Weighted similarity.
// We don't delete — we MERGE. Best version becomes canonical.
// The agency with the highest-quality listing keeps the lead.

export interface DedupFingerprint {
  neighborhood:  string     // normalized slug
  bedrooms:      number | null
  priceBlockNGN: number     // price rounded to nearest ₦5M — small price diffs = same property
  propertyType:  string | null
  sizeSqmBlock:  number | null  // size rounded to nearest 25sqm
}

export function buildDedupFingerprint(p: {
  neighborhood:  string | null
  bedrooms:      number | null
  price_local:   number | null
  property_type: string | null
  size_sqm:      number | null
}): DedupFingerprint {
  const priceBlock = p.price_local
    ? Math.round(p.price_local / 5_000_000) * 5_000_000
    : 0

  const sizeBlock = p.size_sqm
    ? Math.round(p.size_sqm / 25) * 25
    : null

  const hood = (p.neighborhood || '')
    .toLowerCase()
    .replace(/,.*/, '')         // strip city part
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim()

  const pType = (p.property_type || '')
    .toLowerCase()
    .replace(/\s+/g, '-')

  return {
    neighborhood:  hood,
    bedrooms:      p.bedrooms,
    priceBlockNGN: priceBlock,
    propertyType:  pType || null,
    sizeSqmBlock:  sizeBlock,
  }
}

export function dedupKey(fp: DedupFingerprint): string {
  return [
    fp.neighborhood,
    fp.bedrooms ?? 'x',
    Math.round(fp.priceBlockNGN / 1_000_000),
    fp.propertyType ?? 'x',
    fp.sizeSqmBlock ?? 'x',
  ].join('|')
}

// Similarity score between two fingerprints (0 = no match, 1 = definite duplicate)
export function dedupSimilarity(a: DedupFingerprint, b: DedupFingerprint): number {
  let score = 0
  let weight = 0

  // Neighborhood — must match exactly
  if (a.neighborhood && b.neighborhood) {
    weight += 30
    if (a.neighborhood === b.neighborhood) score += 30
    else return 0  // different neighborhood = definitely not the same property
  }

  // Bedrooms — must match if both present
  if (a.bedrooms !== null && b.bedrooms !== null) {
    weight += 20
    if (a.bedrooms === b.bedrooms) score += 20
    else return 0  // different bedroom count = different unit
  }

  // Price block — within 10% tolerance
  if (a.priceBlockNGN > 0 && b.priceBlockNGN > 0) {
    weight += 30
    const diff = Math.abs(a.priceBlockNGN - b.priceBlockNGN) / Math.max(a.priceBlockNGN, b.priceBlockNGN)
    if (diff < 0.05)       score += 30   // within 5% — strong signal
    else if (diff < 0.10)  score += 15   // within 10% — possible match
    else if (diff < 0.20)  score += 5    // within 20% — weak signal
  }

  // Property type
  if (a.propertyType && b.propertyType) {
    weight += 10
    if (a.propertyType === b.propertyType) score += 10
  }

  // Size
  if (a.sizeSqmBlock !== null && b.sizeSqmBlock !== null) {
    weight += 10
    if (Math.abs(a.sizeSqmBlock - b.sizeSqmBlock) <= 25) score += 10
  }

  if (weight === 0) return 0
  return score / weight
}

// Which listing wins when merging duplicates?
// Returns 'a' if a is the canonical version, 'b' if b is
export function pickCanonical(
  a: { source_type: string | null; confidence: number | null; partner_trust: string; created_at: string | null },
  b: { source_type: string | null; confidence: number | null; partner_trust: string; created_at: string | null },
): 'a' | 'b' {
  const trustOrder = { elite: 4, trusted: 3, verified: 2, listed: 1, agency: 1, '': 0 }
  const aTrust = (trustOrder as any)[a.partner_trust?.toLowerCase() || ''] || 0
  const bTrust = (trustOrder as any)[b.partner_trust?.toLowerCase() || ''] || 0
  if (aTrust !== bTrust) return aTrust > bTrust ? 'a' : 'b'

  const aConf = a.confidence || 0
  const bConf = b.confidence || 0
  if (Math.abs(aConf - bConf) > 0.05) return aConf > bConf ? 'a' : 'b'

  // Newer listing wins as tiebreaker
  const aDate = new Date(a.created_at || 0).getTime()
  const bDate = new Date(b.created_at || 0).getTime()
  return aDate >= bDate ? 'a' : 'b'
}

// ─── Pricing transparency model ───────────────────────────────────────────────
// What we show publicly vs what stays private

export interface PricingTransparencyReport {
  neighborhood:      string
  bedrooms:          number
  period:            string          // e.g. "Q1 2025"

  // What we show — neighborhood aggregates only
  listing_count:     number          // how many active listings
  transaction_count: number          // how many sold transactions (from agencies)

  // Sold price intelligence (only shown when n >= 3)
  median_sold_price?: number
  median_asking_price?: number
  price_to_ask_ratio?: number        // 0-100: what % of asking they got
  median_days_on_market?: number

  // Payment method breakdown
  cash_pct?:         number          // % of sales that were cash
  mortgage_pct?:     number
  installment_pct?:  number

  // Quality flag
  data_quality:      'strong' | 'indicative' | 'sparse'
  min_transactions_for_display: number  // always 3 — we never show n<3
}

export function buildPricingReport(transactions: MarketTransaction[]): Omit<PricingTransparencyReport, 'neighborhood' | 'bedrooms' | 'period'> | null {
  if (transactions.length < 3) {
    // Never show aggregate data for fewer than 3 transactions
    // This is the privacy protection: no individual deal can be inferred
    return null
  }

  const soldPrices = transactions.map(t => t.sold_price).sort((a, b) => a - b)
  const medianSold = soldPrices[Math.floor(soldPrices.length / 2)]

  const askingPrices = transactions.filter(t => t.asking_price).map(t => t.asking_price!)
  const medianAsking = askingPrices.length >= 3
    ? askingPrices.sort((a, b) => a - b)[Math.floor(askingPrices.length / 2)]
    : undefined

  const ratios = transactions
    .filter(t => t.asking_price && t.asking_price > 0)
    .map(t => Math.round((t.sold_price / t.asking_price!) * 100))
  const medianRatio = ratios.length > 0
    ? Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length)
    : undefined

  const days = transactions.filter(t => t.days_on_market !== null).map(t => t.days_on_market!)
  const medianDays = days.length > 0
    ? Math.round(days.reduce((s, d) => s + d, 0) / days.length)
    : undefined

  const totalTx = transactions.length
  const cashCount       = transactions.filter(t => t.payment_method === 'cash').length
  const mortgageCount   = transactions.filter(t => t.payment_method === 'mortgage').length
  const installCount    = transactions.filter(t => t.payment_method === 'installment').length

  return {
    listing_count:      0,    // filled by caller
    transaction_count:  totalTx,
    median_sold_price:  medianSold,
    median_asking_price: medianAsking,
    price_to_ask_ratio: medianRatio,
    median_days_on_market: medianDays,
    cash_pct:           Math.round((cashCount / totalTx) * 100),
    mortgage_pct:       Math.round((mortgageCount / totalTx) * 100),
    installment_pct:    Math.round((installCount / totalTx) * 100),
    data_quality:       totalTx >= 10 ? 'strong' : totalTx >= 5 ? 'indicative' : 'sparse',
    min_transactions_for_display: 3,
  }
}

// ─── The pitch to agencies — why they should give us this data ─────────────────
// Use this in the UI to frame the ask correctly.
// We are NOT asking for data.
// We are offering market intelligence in exchange for contribution.

export const AGENCY_VALUE_EXCHANGE = {
  headline: 'Contribute to Manop Market Intelligence',
  subhead:  'Your transaction data improves your Market Score — and makes every Manop listing more credible to buyers.',

  whatWeAsk: [
    { item: 'Neighborhood, bedroom count, and sold price', sensitivity: 'low',    note: 'No addresses. No buyer names.' },
    { item: 'Days on market', sensitivity: 'low',    note: 'How long it took to close.' },
    { item: 'Payment method (cash/mortgage/installment)', sensitivity: 'low',    note: 'Aggregate market trend only.' },
    { item: 'Asking price vs sold price', sensitivity: 'medium', note: 'Kept strictly confidential. Only median shown publicly.' },
  ],

  whatTheyGet: [
    { benefit: 'Market Score points', detail: 'Each transaction = +3 to +5 points on your Market Score.' },
    { benefit: '"Data Contributor" badge', detail: 'Shows on all your listings. Signals to buyers you know the real market.' },
    { benefit: 'Your own performance report', detail: 'See how your closing speed and price accuracy compare to market average.' },
    { benefit: 'Higher listing ranking', detail: 'Data contributors rank above non-contributors in search results.' },
    { benefit: 'Early access to buyer intelligence', detail: 'See demand trends for your neighborhoods before they become public.' },
  ],

  privacyGuarantees: [
    'Individual deal prices are NEVER shown publicly',
    'No property addresses or buyer details stored',
    'Minimum 3 transactions required before any aggregate is shown',
    'Data used only to compute neighborhood-level medians',
    'You can withdraw your data contribution at any time',
  ],
}

// ─── Neighborhood sold price index ───────────────────────────────────────────
// This is what makes Manop defensible. Updated as agencies contribute.

export interface SoldPriceIndex {
  neighborhood:       string
  bedrooms:           number
  period_label:       string     // "Last 6 months", "Q1 2025" etc.
  median_sold:        number
  median_asking:      number | null
  price_to_ask:       number | null   // e.g. 91 = sold at 91% of asking
  sample_size:        number
  payment_breakdown: {
    cash:        number   // %
    mortgage:    number   // %
    installment: number   // %
  }
  days_to_sell:       number | null
  data_quality:       'strong' | 'indicative' | 'sparse'
  last_updated:       string
}

export function formatPriceToAsk(ratio: number | null): string {
  if (ratio === null) return '—'
  if (ratio >= 100) return `At asking`
  return `${ratio}% of asking`
}

export function formatDaysToSell(days: number | null): string {
  if (days === null) return '—'
  if (days < 14)  return `${days} days — fast market`
  if (days < 30)  return `${days} days`
  if (days < 60)  return `${days} days — moderate`
  return `${days} days — slow market`
}