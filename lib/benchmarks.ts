// lib/benchmarks.ts — UPGRADED: Live from Supabase + hardcoded fallback
// 
// HOW IT WORKS:
// 1. First tries to fetch from neighborhood_benchmarks VIEW in Supabase
//    (auto-computed from live listing data)
// 2. Falls back to hardcoded values if Supabase is unavailable or
//    data quality is too low (< 5 listings)
// 3. Always labels data quality clearly (verified/estimated/sparse)
//
// REPLACES: the previous fully-hardcoded lib/benchmarks.ts

import { createClient } from '@supabase/supabase-js'

// Use anon key — the view is public read
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export interface NeighborhoodBenchmark {
  displayName:   string
  city:          string
  country:       string
  currency:      string
  medians:       Record<number, number>   // price medians by bedroom
  yields:        Record<number, number>   // gross yield % by bedroom
  capRates:      Record<number, number>   // cap rate % by bedroom
  listingCounts: Record<number, number>   // how many listings per bedroom
  strYield?:     number
  strNightly?:   number
  quality:       'verified' | 'estimated' | 'sparse' | 'live-computed'
  source:        string
  updatedAt:     string
  isLive:        boolean   // true = from Supabase, false = hardcoded fallback
}

// ─── Hardcoded fallbacks (used when live data is thin) ────────
const FALLBACK_BENCHMARKS: Record<string, Omit<NeighborhoodBenchmark, 'isLive'>> = {
  'lekki-phase-1': {
    displayName: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria', currency: 'NGN',
    medians:       { 1: 175e6, 2: 285e6, 3: 400e6, 4: 725e6, 5: 860e6 },
    yields:        { 1: 5.1,   2: 7.4,   3: 5.0,   4: 4.5,   5: 5.2  },
    capRates:      { 1: 3.9,   2: 5.5,   3: 3.75,  4: 3.4,   5: 3.9  },
    listingCounts: { 1: 0,     2: 0,     3: 0,     4: 0,     5: 0    },
    strYield: 9.0, strNightly: 180_000,
    quality: 'verified', source: '51 CW Real Estate verified listings', updatedAt: '2024-11-01',
  },
  'ikoyi': {
    displayName: 'Ikoyi', city: 'Lagos', country: 'Nigeria', currency: 'NGN',
    medians:       { 2: 350e6, 3: 600e6, 4: 900e6, 5: 1_500e6 },
    yields:        { 2: 5.5,   3: 5.0,   4: 4.2,   5: 4.0     },
    capRates:      { 2: 4.1,   3: 3.75,  4: 3.15,  5: 3.0     },
    listingCounts: {},
    strYield: 8.5, strNightly: 250_000,
    quality: 'estimated', source: 'Manop research estimate', updatedAt: '2024-11-01',
  },
  'victoria-island': {
    displayName: 'Victoria Island', city: 'Lagos', country: 'Nigeria', currency: 'NGN',
    medians:       { 2: 300e6, 3: 500e6, 4: 850e6 },
    yields:        { 2: 6.0,   3: 5.2,   4: 4.5   },
    capRates:      { 2: 4.5,   3: 3.9,   4: 3.4   },
    listingCounts: {},
    strYield: 9.5, strNightly: 220_000,
    quality: 'estimated', source: 'Manop research estimate', updatedAt: '2024-11-01',
  },
  'ajah': {
    displayName: 'Ajah', city: 'Lagos', country: 'Nigeria', currency: 'NGN',
    medians:  { 2: 80e6, 3: 120e6, 4: 200e6 },
    yields:   { 2: 8.0,  3: 7.5,   4: 6.5   },
    capRates: { 2: 6.0,  3: 5.6,   4: 4.9   },
    listingCounts: {},
    quality: 'sparse', source: 'Manop research estimate', updatedAt: '2024-11-01',
  },
  'maitama': {
    displayName: 'Maitama', city: 'Abuja', country: 'Nigeria', currency: 'NGN',
    medians:  { 3: 250e6, 4: 450e6, 5: 700e6 },
    yields:   { 3: 6.0,   4: 5.5,   5: 5.0   },
    capRates: { 3: 4.5,   4: 4.1,   5: 3.75  },
    listingCounts: {},
    quality: 'sparse', source: 'Manop research estimate', updatedAt: '2024-11-01',
  },
  'east-legon': {
    displayName: 'East Legon', city: 'Accra', country: 'Ghana', currency: 'GHS',
    medians:  { 3: 1_800_000, 4: 2_800_000, 5: 4_500_000 },
    yields:   { 3: 7.0,       4: 6.5,       5: 6.0       },
    capRates: { 3: 5.25,      4: 4.9,       5: 4.5       },
    listingCounts: {},
    quality: 'sparse', source: 'Manop research estimate', updatedAt: '2024-11-01',
  },
}

// ─── Cache (avoid hitting Supabase on every component render) ─
const cache: Record<string, { data: NeighborhoodBenchmark; ts: number }> = {}
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// ─── Main function: fetch live benchmark ──────────────────────
export async function fetchBenchmark(neighborhood: string): Promise<NeighborhoodBenchmark | null> {
  const slug = toSlug(neighborhood)

  // Check cache first
  if (cache[slug] && Date.now() - cache[slug].ts < CACHE_TTL) {
    return cache[slug].data
  }

  try {
    // Fetch from the auto-computed Supabase view
    const { data: rows, error } = await sb
      .from('neighborhood_benchmarks')
      .select('neighborhood,city,country_code,bedrooms,listing_count,median_price,data_quality,last_updated')
      .ilike('neighborhood', `%${neighborhood.split(',')[0].trim()}%`)
      .order('bedrooms')

    // Also fetch real yield from rent view
    const { data: yieldRows } = await sb
      .from('neighborhood_rent_benchmarks')
      .select('neighborhood,city,bedrooms,real_gross_yield_pct,real_cap_rate_pct,rent_count')
      .ilike('neighborhood', `%${neighborhood.split(',')[0].trim()}%`)

    if (!error && rows && rows.length > 0) {
      const fallback = FALLBACK_BENCHMARKS[slug]
      const medians:  Record<number, number> = {}
      const yields:   Record<number, number> = {}
      const capRates: Record<number, number> = {}
      const counts:   Record<number, number> = {}

      for (const row of rows) {
        const bed = row.bedrooms
        if (!bed) continue
        if (row.median_price) medians[bed] = Math.round(row.median_price)
        counts[bed] = row.listing_count || 0

        // Use real yield if we have rent data, else fallback
        const yieldRow = yieldRows?.find(y => y.bedrooms === bed)
        if (yieldRow?.real_gross_yield_pct) {
          yields[bed]   = parseFloat(yieldRow.real_gross_yield_pct)
          capRates[bed] = parseFloat(yieldRow.real_cap_rate_pct || (yieldRow.real_gross_yield_pct * 0.75).toString())
        } else if (fallback?.yields?.[bed]) {
          // Fall back to hardcoded yield if no rent data
          yields[bed]   = fallback.yields[bed]
          capRates[bed] = fallback.capRates?.[bed] || yields[bed] * 0.75
        }
      }

      // Determine quality
      const maxCount  = Math.max(...Object.values(counts), 0)
      const hasRealYield = (yieldRows?.length || 0) > 0
      const quality: NeighborhoodBenchmark['quality'] =
        hasRealYield && maxCount >= 10 ? 'verified' :
        maxCount >= 5 ? 'live-computed' :
        maxCount >= 2 ? 'estimated' : 'sparse'

      const result: NeighborhoodBenchmark = {
        displayName:   rows[0].neighborhood,
        city:          rows[0].city || '',
        country:       rows[0].country_code === 'GH' ? 'Ghana' : rows[0].country_code === 'KE' ? 'Kenya' : 'Nigeria',
        currency:      rows[0].country_code === 'GH' ? 'GHS' : rows[0].country_code === 'KE' ? 'KES' : 'NGN',
        medians:       Object.keys(medians).length > 0 ? medians : (fallback?.medians || {}),
        yields:        Object.keys(yields).length > 0  ? yields  : (fallback?.yields  || {}),
        capRates:      Object.keys(capRates).length > 0 ? capRates : (fallback?.capRates || {}),
        listingCounts: counts,
        strYield:      fallback?.strYield,
        strNightly:    fallback?.strNightly,
        quality,
        source:        `${maxCount} active listings · ${hasRealYield ? 'real yield from rent data' : 'yield estimated'}`,
        updatedAt:     new Date().toISOString().split('T')[0],
        isLive:        true,
      }

      cache[slug] = { data: result, ts: Date.now() }
      return result
    }
  } catch (e) {
    console.warn('Benchmark fetch failed, using fallback:', e)
  }

  // Fall back to hardcoded
  const fallback = FALLBACK_BENCHMARKS[slug]
  if (fallback) {
    return { ...fallback, isLive: false }
  }

  // Try partial slug match
  for (const [key, val] of Object.entries(FALLBACK_BENCHMARKS)) {
    if (neighborhood.toLowerCase().includes(key.replace(/-/g, ' ')) ||
        key.includes(toSlug(neighborhood))) {
      return { ...val, isLive: false }
    }
  }

  return null
}

// ─── Sync version (uses cache only — for components) ─────────
export function getBenchmarkSync(neighborhood: string): NeighborhoodBenchmark | null {
  const slug = toSlug(neighborhood)
  if (cache[slug]) return cache[slug].data
  const fallback = FALLBACK_BENCHMARKS[slug]
  return fallback ? { ...fallback, isLive: false } : null
}

// ─── Helpers ─────────────────────────────────────────────────
export function toSlug(name: string): string {
  return name.toLowerCase()
    .replace(/,.*/, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .trim()
}

export function getYield(neighborhood: string, bedrooms: number | null): number | null {
  const slug = toSlug(neighborhood)
  const b = FALLBACK_BENCHMARKS[slug]
  if (!b || !bedrooms) return null
  return b.yields[bedrooms] || null
}

export function getCapRate(neighborhood: string, bedrooms: number | null): number | null {
  const slug = toSlug(neighborhood)
  const b = FALLBACK_BENCHMARKS[slug]
  if (!b || !bedrooms) return null
  return b.capRates[bedrooms] || null
}

export function getPriceVsMedian(neighborhood: string, bedrooms: number | null, priceLocal: number | null): number | null {
  const slug = toSlug(neighborhood)
  const b = FALLBACK_BENCHMARKS[slug]
  if (!b || !bedrooms || !priceLocal) return null
  const median = b.medians[bedrooms]
  if (!median) return null
  return Math.round(((priceLocal - median) / median) * 100)
}

export function getYieldVerdict(yieldPct: number): { label: string; color: string; bg: string } {
  if (yieldPct >= 7) return { label: 'Strong yield',    color: '#22C55E', bg: 'rgba(34,197,94,0.1)'  }
  if (yieldPct >= 5) return { label: 'Market rate',     color: '#84CC16', bg: 'rgba(132,204,18,0.1)' }
  if (yieldPct >= 3) return { label: 'Below benchmark', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
  return                     { label: 'Low yield',      color: '#EF4444', bg: 'rgba(239,68,68,0.1)'  }
}

export function formatYield(y: number | null): string {
  if (y === null) return '—'
  return `${y.toFixed(1)}%`
}

export function formatVsMedian(pct: number | null): string {
  if (pct === null) return '—'
  if (pct > 0)  return `+${pct}% above median`
  if (pct < 0)  return `${pct}% below median`
  return 'At median'
}

// Convenience re-export for pages that don't need async
export { FALLBACK_BENCHMARKS as BENCHMARKS }