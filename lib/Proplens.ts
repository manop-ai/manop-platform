// lib/proplens.ts
// PropLens — Manop Decision Layer
//
// Answers the core investor question: is this property worth it?
// Computes a verdict (underpriced / fair / overpriced) based on
// how far a listing sits from the real verified bedroom median.
//
// Thresholds (tunable as more data arrives):
//   Underpriced  ≤ −10% vs median   → green  — buy signal
//   Fair         −10% to +10%        → teal   — market rate
//   Overpriced   > +10% vs median    → red    — caution
//
// Source of truth: REAL_BENCHMARKS from lib/insights.ts
// Updated when new data ingested — not estimated.

import { REAL_BENCHMARKS } from './insights'

export type PropLensVerdict = 'underpriced' | 'fair' | 'overpriced' | 'insufficient-data'

export interface PropLensResult {
  verdict:        PropLensVerdict
  label:          string        // "Underpriced", "Fair", "Overpriced"
  color:          string        // hex
  pct_vs_median:  number | null // negative = below median
  median_price:   number | null // NGN — what the market says it's worth
  asking_price:   number        // NGN — what they're asking
  beds:           number | null
  neighborhood:   string
  confidence:     'high' | 'medium' | 'low'
  explanation:    string        // human-readable sentence
  data_source:    string
}

// ─── Verdict thresholds ───────────────────────────────────────
const UNDERPRICED_THRESHOLD = -10  // % below median
const OVERPRICED_THRESHOLD  = +10  // % above median

// ─── Main function ────────────────────────────────────────────
export function getPropLensVerdict(
  askingPrice:  number,
  neighborhood: string,  // slug e.g. 'lekki-phase-1'
  bedrooms:     number | null,
  listingType:  string | null,
): PropLensResult {
  const b = REAL_BENCHMARKS[neighborhood]

  // No benchmark data for this area yet
  if (!b || !bedrooms || !b.medians[bedrooms]) {
    return {
      verdict:       'insufficient-data',
      label:         'No benchmark yet',
      color:         '#888780',
      pct_vs_median: null,
      median_price:  null,
      asking_price:  askingPrice,
      beds:          bedrooms,
      neighborhood,
      confidence:    'low',
      explanation:   `No verified median data yet for ${bedrooms || '?'}-bed in this area. More listings needed.`,
      data_source:   'Insufficient data',
    }
  }

  // For rental listings, compare against rental median
  let medianPrice: number
  let dataSource: string
  let sampleSize: number

  if (listingType === 'for-rent') {
    medianPrice = b.rent_medians[bedrooms]
    dataSource  = `${b.rent_count} verified CW rental listings`
    sampleSize  = b.rent_count
  } else if (listingType === 'short-let') {
    // For STR, compare nightly vs STR benchmark
    medianPrice = b.str_nightly
    dataSource  = `${b.str_count} verified STR listing`
    sampleSize  = b.str_count
  } else {
    medianPrice = b.medians[bedrooms]
    dataSource  = `${b.sale_count} verified CW sale listings`
    sampleSize  = b.sale_count
  }

  const pctVsMedian = Math.round(((askingPrice - medianPrice) / medianPrice) * 100)

  // Confidence based on sample size
  const confidence: 'high' | 'medium' | 'low' =
    sampleSize >= 10 ? 'high' : sampleSize >= 5 ? 'medium' : 'low'

  // Verdict
  let verdict: PropLensVerdict
  let label: string
  let color: string
  let explanation: string

  const fmtM = (n: number) => {
    if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
    if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
    return `₦${Math.round(n/1000)}K`
  }

  const absPct = Math.abs(pctVsMedian)
  const dirWord = pctVsMedian < 0 ? 'below' : 'above'

  if (pctVsMedian <= UNDERPRICED_THRESHOLD) {
    verdict = 'underpriced'
    label   = 'Underpriced'
    color   = '#22C55E'
    explanation = `At ${fmtM(askingPrice)}, this is ${absPct}% ${dirWord} the verified ${bedrooms}-bed median of ${fmtM(medianPrice)} in this area. Represents potential value — verify condition and title before proceeding.`
  } else if (pctVsMedian >= OVERPRICED_THRESHOLD) {
    verdict = 'overpriced'
    label   = 'Above market'
    color   = '#EF4444'
    explanation = `At ${fmtM(askingPrice)}, this is ${absPct}% above the verified ${bedrooms}-bed median of ${fmtM(medianPrice)}. May reflect premium finish, location advantage, or overpricing — investigate before offering.`
  } else {
    verdict = 'fair'
    label   = 'Fair value'
    color   = '#14B8A6'
    explanation = `At ${fmtM(askingPrice)}, this sits ${pctVsMedian > 0 ? '+' : ''}${pctVsMedian}% vs the verified ${bedrooms}-bed median of ${fmtM(medianPrice)}. Broadly in line with current market benchmarks.`
  }

  return {
    verdict,
    label,
    color,
    pct_vs_median:  pctVsMedian,
    median_price:   medianPrice,
    asking_price:   askingPrice,
    beds:           bedrooms,
    neighborhood,
    confidence,
    explanation,
    data_source:    dataSource,
  }
}

// ─── Batch verdicts for a list of properties ─────────────────
export function batchVerdicts(properties: Array<{
  id: string
  price_local: number | null
  bedrooms: number | null
  neighborhood: string | null
  listing_type: string | null
}>): Map<string, PropLensResult> {
  const results = new Map<string, PropLensResult>()
  for (const p of properties) {
    if (!p.price_local || !p.neighborhood) continue
    const slug = p.neighborhood.toLowerCase().replace(/\s+/g, '-')
    results.set(p.id, getPropLensVerdict(p.price_local, slug, p.bedrooms, p.listing_type))
  }
  return results
}

// ─── Verdict badge component data ────────────────────────────
export function verdictBadgeProps(result: PropLensResult): {
  text: string; bg: string; border: string; textColor: string
} {
  if (result.verdict === 'insufficient-data') {
    return { text: '— No data', bg: 'rgba(136,135,128,0.1)', border: 'rgba(136,135,128,0.2)', textColor: '#888780' }
  }
  const pct = result.pct_vs_median
  const sign = pct !== null && pct > 0 ? '+' : ''
  const pctStr = pct !== null ? ` (${sign}${pct}%)` : ''

  const alpha = '0.1'
  const borderAlpha = '0.25'
  const bg     = `rgba(${hexToRgb(result.color)},${alpha})`
  const border = `rgba(${hexToRgb(result.color)},${borderAlpha})`

  return {
    text:      `${result.label}${pctStr}`,
    bg,
    border,
    textColor: result.color,
  }
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return `${r},${g},${b}`
}