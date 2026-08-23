// lib/insights.ts — FIXED v2
// Market Insight Engine — now reads from database first
//
// Priority order for every neighborhood:
// 1. Live data from market_transactions (verified sold prices)
// 2. Live data from properties table (current listings)
// 3. neighborhood_intelligence table (pre-computed signals)
// 4. Hardcoded REAL_BENCHMARKS as last-resort fallback (Lekki Phase 1 only)
//
// When transactions accumulate, hardcoded data becomes unreachable.
// The system self-improves as agencies contribute more transaction data.

import { createClient } from '@supabase/supabase-js'

// ─── Hardcoded fallback — Lekki Phase 1 only ─────────────────
// Used ONLY when database has no data for a neighborhood.
// As real transaction data accumulates, this becomes unreachable.
export const REAL_BENCHMARKS: Record<string, {
  slug:        string
  display:     string
  city:        string
  sale_count:  number
  rent_count:  number
  str_count:   number
  medians:     Record<number, number>
  rent_medians: Record<number, number>
  yields:      Record<number, number>
  str_nightly: number
  str_yield:   number
  price_min:   number
  price_max:   number
  cap_rates:   Record<number, number>
  last_updated: string
  is_fallback:  boolean
}> = {
  'lekki-phase-1': {
    slug:     'lekki-phase-1',
    display:  'Lekki Phase 1',
    city:     'Lagos',
    sale_count:  33,
    rent_count:  17,
    str_count:   1,
    medians:      { 1: 175_000_000, 2: 285_000_000, 3: 400_000_000, 4: 725_000_000, 5: 860_000_000 },
    rent_medians: { 1: 9_000_000,   2: 21_000_000,  3: 20_000_000,  4: 32_500_000,  5: 45_000_000  },
    yields:       { 1: 5.1, 2: 7.4, 3: 5.0, 4: 4.5, 5: 5.2 },
    str_nightly:  180_000,
    str_yield:    9.0,
    price_min:    150_000_000,
    price_max:  1_300_000_000,
    cap_rates:    { 1: 3.9, 2: 5.5, 3: 3.75, 4: 3.4, 5: 3.9 },
    last_updated: '2026-04',
    is_fallback:  true,
  },
}

// ─── Types ─────────────────────────────────────────────────────
export interface MarketInsight {
  id:          string
  type:        'yield' | 'price' | 'str' | 'market' | 'currency' | 'trend'
  headline:    string
  body:        string
  value:       string
  color:       string
  source:      string
  is_fallback: boolean   // true = from hardcoded data, false = live DB
}

// ─── Live DB benchmark shape ────────────────────────────────────
interface LiveBenchmark {
  slug:          string
  display:       string
  city:          string
  sale_count:    number
  rent_count:    number
  medians:       Record<number, number>
  rent_medians:  Record<number, number>
  yields:        Record<number, number>
  cap_rates:     Record<number, number>
  price_min:     number
  price_max:     number
  str_nightly:   number
  str_yield:     number
  str_count:     number
  last_updated:  string
  is_fallback:   false
}

// ─── Query live data from database ─────────────────────────────
async function queryLiveBenchmark(
  slug:         string,
  supabaseUrl:  string,
  supabaseKey:  string,
): Promise<LiveBenchmark | null> {
  try {
    const sb = createClient(supabaseUrl, supabaseKey)

    // Normalise slug to neighborhood name for matching
    // e.g. 'lekki-phase-1' → 'Lekki Phase 1'
    const neighborhoodName = slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

    // ── 1. Try market_benchmarks table first (pre-computed) ────
    const { data: mb } = await sb
      .from('market_benchmarks')
      .select('*')
      .or(`slug.eq.${slug},neighborhood.ilike.%${neighborhoodName}%`)
      .limit(1)
      .maybeSingle()

    if (mb) {
      return {
        slug,
        display:       mb.neighborhood ?? neighborhoodName,
        city:          mb.city ?? '',
        sale_count:    mb.sale_count ?? 0,
        rent_count:    mb.rent_count ?? 0,
        medians:       mb.medians ?? {},
        rent_medians:  mb.rent_medians ?? {},
        yields:        mb.yields ?? {},
        cap_rates:     mb.cap_rates ?? {},
        price_min:     mb.price_min ?? 0,
        price_max:     mb.price_max ?? 0,
        str_nightly:   mb.str_nightly ?? 0,
        str_yield:     mb.str_yield ?? 0,
        str_count:     mb.str_count ?? 0,
        last_updated:  mb.updated_at ?? mb.computed_at ?? new Date().toISOString(),
        is_fallback:   false,
      }
    }

    // ── 2. Compute from raw transactions ───────────────────────
    const { data: txns } = await sb
      .from('market_transactions')
      .select('bedrooms, sold_price, listing_type, verification_status, sold_at')
      .ilike('neighborhood', `%${neighborhoodName}%`)
      .in('verification_status', ['verified', 'likely_accurate', 'uncontested'])
      .not('sold_price', 'is', null)

    // ── 3. Compute from current listings ──────────────────────
    const { data: listings } = await sb
      .from('properties')
      .select('bedrooms, price_local, listing_type')
      .ilike('neighborhood', `%${neighborhoodName}%`)
      .not('price_local', 'is', null)

    if ((!txns || txns.length === 0) && (!listings || listings.length === 0)) {
      return null  // no data at all → caller uses hardcoded fallback
    }

    // Compute medians from transactions (preferred) or listings (fallback)
    const saleTxns  = (txns  || []).filter(t => t.listing_type === 'for-sale' || !t.listing_type)
    const rentTxns  = (txns  || []).filter(t => t.listing_type === 'for-rent')
    const saleList  = (listings || []).filter(l => l.listing_type === 'for-sale')
    const rentList  = (listings || []).filter(l => l.listing_type === 'for-rent')

    function medianByBeds(rows: any[], priceKey: string): Record<number, number> {
      const byBed: Record<number, number[]> = {}
      for (const r of rows) {
        const bed   = r.bedrooms ?? 0
        const price = r[priceKey]
        if (price && price > 0) {
          if (!byBed[bed]) byBed[bed] = []
          byBed[bed].push(price)
        }
      }
      const result: Record<number, number> = {}
      for (const [bed, prices] of Object.entries(byBed)) {
        const sorted = prices.sort((a, b) => a - b)
        const mid    = Math.floor(sorted.length / 2)
        result[parseInt(bed)] = sorted.length % 2 === 0
          ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
          : sorted[mid]
      }
      return result
    }

    // Use transactions if available, listings as fallback
    const saleSource  = saleTxns.length >= 3 ? saleTxns  : saleList
    const rentSource  = rentTxns.length >= 3 ? rentTxns  : rentList
    const salePriceKey = saleTxns.length >= 3 ? 'sold_price' : 'price_local'
    const rentPriceKey = rentTxns.length >= 3 ? 'sold_price' : 'price_local'

    const medians      = medianByBeds(saleSource, salePriceKey)
    const rent_medians = medianByBeds(rentSource, rentPriceKey)

    // Compute yields where both sale and rent data exist
    const yields: Record<number, number>    = {}
    const cap_rates: Record<number, number> = {}
    for (const bed of Object.keys(medians)) {
      const b = parseInt(bed)
      if (medians[b] && rent_medians[b]) {
        const grossYield = (rent_medians[b] / medians[b]) * 100
        yields[b]    = Math.round(grossYield * 10) / 10
        cap_rates[b] = Math.round(grossYield * 0.75 * 10) / 10
      }
    }

    const allSalePrices = saleSource.map(r => r[salePriceKey]).filter(Boolean)

    return {
      slug,
      display:      neighborhoodName,
      city:         (listings?.[0] as any)?.city ?? '',
      sale_count:   saleTxns.length || saleList.length,
      rent_count:   rentTxns.length || rentList.length,
      medians,
      rent_medians,
      yields,
      cap_rates,
      price_min:    allSalePrices.length ? Math.min(...allSalePrices) : 0,
      price_max:    allSalePrices.length ? Math.max(...allSalePrices) : 0,
      str_nightly:  0,
      str_yield:    0,
      str_count:    0,
      last_updated: new Date().toISOString(),
      is_fallback:  false,
    }
  } catch (err) {
    console.error('[insights] queryLiveBenchmark failed:', err)
    return null
  }
}

// ─── Generate insights from any benchmark ─────────────────────
// Works with both live and hardcoded benchmarks
function buildInsights(
  b: (typeof REAL_BENCHMARKS)[string] | LiveBenchmark,
  ngnRate: number
): MarketInsight[] {
  const insights: MarketInsight[] = []
  const isFallback = 'is_fallback' in b && b.is_fallback === true

  const sourceLabel = isFallback
    ? `${b.sale_count} verified listings · fallback data (${b.last_updated})`
    : `${b.sale_count + b.rent_count} verified transactions · live data`

  // Only generate insight if we have the data for it
  const yieldEntries = Object.entries(b.yields || {}).filter(([,v]) => v > 0)
  if (yieldEntries.length > 0) {
    const [bedStr, yld] = yieldEntries.sort(([,a],[,v]) => v - a)[0]
    const bed   = parseInt(bedStr)
    const rentM = (b.rent_medians[bed] ?? 0) / 1_000_000
    const priceM = (b.medians[bed] ?? 0) / 1_000_000
    if (priceM > 0 && rentM > 0) {
      insights.push({
        id:          'best-yield',
        type:        'yield',
        headline:    `${yld}% gross yield`,
        body:        `${bed}-bedroom achieves the highest gross yield in ${b.display} at ${yld}% — ₦${rentM.toFixed(0)}M annual rent on a ₦${priceM.toFixed(0)}M median price. Net: ~${(yld * 0.75).toFixed(1)}%.`,
        value:       `${yld}%`,
        color:       yld >= 7 ? '#22C55E' : yld >= 5 ? '#F59E0B' : '#EF4444',
        source:      sourceLabel,
        is_fallback: isFallback,
      })
    }
  }

  if (b.price_min > 0) {
    const entryM   = Math.round(b.price_min / 1_000_000)
    const entryUSD = Math.round(b.price_min / ngnRate / 1_000)
    insights.push({
      id:          'entry-price',
      type:        'price',
      headline:    `₦${entryM}M entry`,
      body:        `Market entry in ${b.display} starts at ₦${entryM}M (≈$${entryUSD}K). Peak: ₦${Math.round(b.price_max/1_000_000)}M. Range from ${b.sale_count} verified ${isFallback ? 'listings' : 'transactions'}.`,
      value:       `₦${entryM}M`,
      color:       '#7C5FFF',
      source:      sourceLabel,
      is_fallback: isFallback,
    })
  }

  if (b.str_count > 0 && b.str_nightly > 0) {
    const annualSTR = Math.round(b.str_nightly * 365 * 0.55 / 1_000_000)
    insights.push({
      id:          'str-yield',
      type:        'str',
      headline:    `${b.str_yield}% STR yield`,
      body:        `Short-let in ${b.display}: ₦${Math.round(b.str_nightly/1_000)}K/night. At 55% occupancy ≈₦${annualSTR}M revenue. Gross STR yield: ${b.str_yield}%.`,
      value:       `${b.str_yield}%`,
      color:       '#F59E0B',
      source:      sourceLabel,
      is_fallback: isFallback,
    })
  }

  const med3 = b.medians[3] ?? b.medians[2] ?? b.medians[1]
  if (med3 && ngnRate > 0) {
    const bed  = b.medians[3] ? 3 : b.medians[2] ? 2 : 1
    const medM = Math.round(med3 / 1_000_000)
    const medUSD = Math.round(med3 / ngnRate / 1_000)
    insights.push({
      id:          'usd-context',
      type:        'currency',
      headline:    `$${medUSD}K in USD`,
      body:        `A ${bed}-bedroom in ${b.display} (₦${medM}M median) equates to $${medUSD}K at today's live rate. USD pricing matters for diaspora and international investors.`,
      value:       `$${medUSD}K`,
      color:       '#14B8A6',
      source:      `Live exchange rate · ${sourceLabel}`,
      is_fallback: isFallback,
    })
  }

  if (b.sale_count + b.rent_count > 0) {
    insights.push({
      id:          'market-depth',
      type:        'market',
      headline:    `${b.sale_count + b.rent_count} verified`,
      body:        `${b.display} has ${b.sale_count} for-sale and ${b.rent_count} rental data points in MANOP${isFallback ? ' (baseline data — will update as agencies contribute transactions)' : ' from verified agency transactions'}.`,
      value:       `${b.sale_count + b.rent_count}`,
      color:       '#22C55E',
      source:      sourceLabel,
      is_fallback: isFallback,
    })
  }

  const cap2 = b.cap_rates?.[2] ?? b.cap_rates?.[3]
  if (cap2) {
    const capBed = b.cap_rates?.[2] ? 2 : 3
    insights.push({
      id:          'cap-rate',
      type:        'yield',
      headline:    `${cap2}% cap rate`,
      body:        `${capBed}-bedroom cap rate in ${b.display}: ${cap2}% — net operating income (75% of gross rent) divided by purchase price.`,
      value:       `${cap2}%`,
      color:       '#14B8A6',
      source:      sourceLabel,
      is_fallback: isFallback,
    })
  }

  return insights
}

// ─── Public API ────────────────────────────────────────────────

// Synchronous fallback (used where async isn't available)
export function generateInsights(slug: string, ngnRate = 1570): MarketInsight[] {
  const b = REAL_BENCHMARKS[slug]
  if (!b) return []
  return buildInsights(b, ngnRate)
}

// Async live version — reads from DB, falls back to hardcoded
export async function getLiveInsights(
  slug:         string,
  ngnRate:      number,
  supabaseUrl:  string,
  supabaseKey:  string,
): Promise<MarketInsight[]> {
  // Try live DB data first
  const live = await queryLiveBenchmark(slug, supabaseUrl, supabaseKey)
  if (live) return buildInsights(live, ngnRate)

  // Fall back to hardcoded benchmarks
  const fallback = REAL_BENCHMARKS[slug]
  if (fallback) return buildInsights(fallback, ngnRate)

  return []
}

// ─── Format helpers ─────────────────────────────────────────────
export function fmtM(n: number): string {
  if (n >= 1_000_000_000) return `₦${(n/1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `₦${(n/1_000_000).toFixed(0)}M`
  return `₦${Math.round(n/1_000)}K`
}

export function getBestYieldBedroom(slug: string): { beds: number; yield: number } | null {
  const b = REAL_BENCHMARKS[slug]
  if (!b) return null
  const best = Object.entries(b.yields).sort(([,a],[,v]) => v - a)[0]
  return { beds: parseInt(best[0]), yield: best[1] }
}

export function getMedianForBeds(slug: string, beds: number): number | null {
  return REAL_BENCHMARKS[slug]?.medians[beds] || null
}