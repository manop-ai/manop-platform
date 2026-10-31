// lib/economic-context.ts
//
// Economic context for a location's country. Real sourced data only:
//  - FX: the live USD reference rate from the same public source lib/fx.ts already uses
//    (open.er-api.com), with its own "last updated" timestamp. Never hard-coded.
//  - Inflation / other indicators: MANOP holds no sourced feed yet, so they are reported
//    as unavailable. `indicators` is the extension point: add a sourced entry and the
//    page renders it.
// Server-side only (uses Next fetch caching).

import { COUNTRY_CURRENCY } from './location-taxonomy'

export interface FxContext { currencyCode: string; currencyLabel: string; perUsd: number; asOf: string; source: string; sourceUrl: string }
export interface EconomicIndicator { label: string; value: string; asOf: string; source: string; sourceUrl?: string }
export interface EconomicContext { countryCode: string; fx: FxContext | null; indicators: EconomicIndicator[] }

const FX_URL = 'https://open.er-api.com/v6/latest/USD'

export async function getEconomicContext(countryCode: string): Promise<EconomicContext> {
  const cur = COUNTRY_CURRENCY[countryCode]
  const empty: EconomicContext = { countryCode, fx: null, indicators: [] }
  if (!cur) return empty
  try {
    const res = await fetch(FX_URL, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return empty
    const j = await res.json()
    const rate = j?.rates?.[cur.code]
    if (j?.result !== 'success' || typeof rate !== 'number' || !(rate > 0)) return empty
    const asOf = typeof j.time_last_update_unix === 'number' ? new Date(j.time_last_update_unix * 1000).toISOString() : null
    if (!asOf) return empty
    return { countryCode, indicators: [], fx: { currencyCode: cur.code, currencyLabel: cur.label ?? cur.code, perUsd: rate, asOf, source: 'ExchangeRate-API (open.er-api.com)', sourceUrl: 'https://www.exchangerate-api.com' } }
  } catch {
    return empty
  }
}