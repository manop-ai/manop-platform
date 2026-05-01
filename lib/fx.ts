// lib/fx.ts
// FX intelligence module for Manop
//
// Provides:
//   - Live NGN/USD rate via open.er-api.com (cached 1hr)
//   - Historical annual NGN/USD rates (CBN official data)
//   - Depreciation calculations
//   - Combined income + price USD return model

// ─── Historical NGN/USD annual average rates ─────────────────
// Source: Central Bank of Nigeria official data
// Annual average mid-market rate (NGN per 1 USD)
export const NGN_HISTORY: Record<number, number> = {
  2010: 150.3,
  2011: 153.9,
  2012: 157.5,
  2013: 157.3,
  2014: 158.6,
  2015: 192.4,   // devaluation: crude oil price collapse
  2016: 253.5,   // float policy introduced
  2017: 305.8,
  2018: 306.1,
  2019: 306.9,
  2020: 358.8,   // COVID shock
  2021: 401.0,
  2022: 425.9,
  2023: 699.0,   // CBN float — major devaluation
  2024: 1480.0,  // post-float stabilisation
  2025: 1570.0,  // current estimate
}

// ─── Live rate cache ──────────────────────────────────────────
// Server-side module-level cache — resets on server restart
// For production, replace with Redis or Supabase KV
let _cachedRate: number | null = null
let _cacheTime  = 0
const CACHE_TTL  = 60 * 60 * 1000 // 1 hour

export async function getLiveNGNRate(): Promise<number> {
  const now = Date.now()
  if (_cachedRate && (now - _cacheTime) < CACHE_TTL) {
    return _cachedRate
  }

  try {
    // Add timeout for users in regions with slow/unreliable connections (e.g., Nigeria)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 }, // Next.js cache — 1hr
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    
    if (res.ok) {
      const data = await res.json()
      if (data?.result === 'success' && data?.rates?.NGN) {
        _cachedRate = data.rates.NGN
        _cacheTime  = now
        return _cachedRate
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: use latest known rate
  return NGN_HISTORY[2025] || 1570
}

// ─── Multi-currency live rates ────────────────────────────────
export interface LiveRates {
  NGN: number
  GHS: number
  KES: number
  ZAR: number
  fetchedAt: string
  source: string
}

let _liveRates: LiveRates | null = null
let _liveRatesTime = 0

export async function getLiveRates(): Promise<LiveRates> {
  const now = Date.now()
  if (_liveRates && (now - _liveRatesTime) < CACHE_TTL) {
    return _liveRates
  }

  const fallback: LiveRates = {
    NGN: NGN_HISTORY[2025] || 1570,
    GHS: 15.2,
    KES: 129,
    ZAR: 18.5,
    fetchedAt: new Date().toISOString(),
    source: 'fallback',
  }

  try {
    // Add timeout for users in regions with slow/unreliable connections
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    
    if (res.ok) {
      const data = await res.json()
      if (data?.result === 'success') {
        const r = data.rates
        _liveRates = {
          NGN: r.NGN || fallback.NGN,
          GHS: r.GHS || fallback.GHS,
          KES: r.KES || fallback.KES,
          ZAR: r.ZAR || fallback.ZAR,
          fetchedAt: new Date().toISOString(),
          source: 'open.er-api.com',
        }
        _liveRatesTime = now
        return _liveRates
      }
    }
  } catch {
    // ignore — use fallback
  }

  return fallback
}

// ─── Conversion helpers ───────────────────────────────────────
export function toUSD(amount: number, currency: string, rates: LiveRates): number {
  const rate = rates[currency as keyof LiveRates] as number | undefined
  if (!rate || typeof rate !== 'number') return amount // assume already USD
  return Math.round((amount / rate) * 100) / 100
}

export function formatUSD(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(3)}M`
  if (amount >= 1_000)     return `$${Math.round(amount / 1_000).toLocaleString()}K`
  return `$${Math.round(amount).toLocaleString()}`
}

export function formatNGN(amount: number): string {
  if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(1)}B`
  if (amount >= 1_000_000)     return `₦${(amount / 1_000_000).toFixed(0)}M`
  if (amount >= 1_000)         return `₦${(amount / 1_000).toFixed(0)}K`
  return `₦${Math.round(amount)}`
}

// ─── Depreciation calculator ──────────────────────────────────
export interface DepreciationResult {
  fromYear:          number
  toYear:            number
  rateFrom:          number
  rateTo:            number
  depreciationPct:   number   // how much NGN lost vs USD
  usdLossPct:        number   // % of USD value lost
}

export function calcDepreciation(fromYear: number, toYear: number): DepreciationResult {
  const rateFrom = NGN_HISTORY[fromYear] || NGN_HISTORY[2015]!
  const rateTo   = NGN_HISTORY[toYear]   || NGN_HISTORY[2024]!
  // How much more NGN you need now to buy 1 USD
  const depPct   = Math.round(((rateTo - rateFrom) / rateFrom) * 100)
  // If you held NGN, how much USD value did you lose?
  const usdLoss  = Math.round((1 - rateFrom / rateTo) * 100)
  return { fromYear, toYear, rateFrom, rateTo, depreciationPct: depPct, usdLossPct: usdLoss }
}

// ─── Combined income + price USD return model ─────────────────
// This is the key upgrade: combines property appreciation in NGN
// with rental income in NGN, then converts both to USD each year
// to show the REAL USD return an international investor gets.
//
// Assumptions (Lagos Lekki Phase 1 baseline — update from benchmarks):
//   - NGN appreciation rate: 8% per year (CW data: ₦120M median 2020 → ₦290M 2024)
//   - Rental yield: 5% of property value per year (gross)
//   - Vacancy / expenses: 25% deduction → net 3.75% yield
//   - Holding period: 1–10 years

export interface ReturnYear {
  year:               number
  ngnRate:            number    // NGN per USD that year
  propertyValueNGN:   number    // property value in NGN
  propertyValueUSD:   number    // property value in USD at that year's rate
  annualRentNGN:      number    // gross annual rent
  annualRentNetNGN:   number    // net annual rent (after expenses)
  annualRentUSD:      number    // net rent converted to USD
  cumulativeRentUSD:  number    // total rent earned in USD to this point
  totalReturnUSD:     number    // property value USD + cumulative rent USD
  totalReturnPct:     number    // total return % vs initial USD investment
}

export interface ReturnModel {
  initialPriceNGN:   number
  initialPriceUSD:   number
  buyYear:           number
  ngnAppreciationPct: number
  rentalYieldPct:    number
  years:             ReturnYear[]
}

export function buildReturnModel(
  priceLiveNGN: number,
  liveNGNRate:  number,
  options: {
    ngnAppreciationPct?: number   // default 8%
    rentalYieldGrossPct?: number  // default 5%
    expenseRatioPct?: number      // default 25% of gross
    buyYear?: number              // default current year
    projectYears?: number         // default 10
  } = {}
): ReturnModel {
  const {
    ngnAppreciationPct  = 8,
    rentalYieldGrossPct = 5,
    expenseRatioPct     = 25,
    buyYear             = new Date().getFullYear(),
    projectYears        = 10,
  } = options

  const netYieldPct = rentalYieldGrossPct * (1 - expenseRatioPct / 100)
  const initialPriceUSD = priceLiveNGN / liveNGNRate
  const years: ReturnYear[] = []
  let cumulativeRentUSD = 0

  // For historical years (before buy): use actual CBN rates
  // For future years (after buy): project NGN depreciation at 8%/yr
  // (conservative — CBN has depreciated much faster historically)
  const historicalDepPct = 8  // avg NGN annual depreciation assumption

  for (let i = 0; i <= projectYears; i++) {
    const yr = buyYear + i

    // Property value in NGN grows by appreciation rate
    const propertyValueNGN = priceLiveNGN * Math.pow(1 + ngnAppreciationPct / 100, i)

    // NGN rate projection: use known rate if available, else project
    let ngnRate: number
    if (NGN_HISTORY[yr]) {
      ngnRate = NGN_HISTORY[yr]
    } else {
      // project from last known rate with historical avg depreciation
      const lastKnownYear = Math.max(...Object.keys(NGN_HISTORY).map(Number).filter(y => y <= yr))
      const lastKnownRate = NGN_HISTORY[lastKnownYear] || liveNGNRate
      const yearsAhead    = yr - lastKnownYear
      ngnRate = lastKnownRate * Math.pow(1 + historicalDepPct / 100, yearsAhead)
    }

    const propertyValueUSD  = propertyValueNGN / ngnRate
    const annualRentNGN     = propertyValueNGN * (rentalYieldGrossPct / 100)
    const annualRentNetNGN  = annualRentNGN * (1 - expenseRatioPct / 100)
    const annualRentUSD     = annualRentNetNGN / ngnRate

    if (i > 0) cumulativeRentUSD += annualRentUSD

    const totalReturnUSD = propertyValueUSD + cumulativeRentUSD
    const totalReturnPct = ((totalReturnUSD - initialPriceUSD) / initialPriceUSD) * 100

    years.push({
      year: yr,
      ngnRate: Math.round(ngnRate),
      propertyValueNGN:  Math.round(propertyValueNGN),
      propertyValueUSD:  Math.round(propertyValueUSD),
      annualRentNGN:     Math.round(annualRentNGN),
      annualRentNetNGN:  Math.round(annualRentNetNGN),
      annualRentUSD:     Math.round(annualRentUSD),
      cumulativeRentUSD: Math.round(cumulativeRentUSD),
      totalReturnUSD:    Math.round(totalReturnUSD),
      totalReturnPct:    Math.round(totalReturnPct * 10) / 10,
    })
  }

  return {
    initialPriceNGN: priceLiveNGN,
    initialPriceUSD: Math.round(initialPriceUSD),
    buyYear,
    ngnAppreciationPct,
    rentalYieldPct: netYieldPct,
    years,
  }
}
