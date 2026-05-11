// lib/intelligence.ts
// Manop Intelligence Engine client
// Calls the Manop intelligence API (FastAPI backend)
// Falls back to local computation when API unavailable

const INTEL_API = process.env.NEXT_PUBLIC_INTEL_API_URL || 'http://localhost:8002'

export interface PropertyInput {
  price:          number
  bedrooms?:      number
  neighborhood?:  string
  city?:          string
  property_type?: string
  size_sqm?:      number
  annual_rent?:   number
  listing_type?:  string
}

export interface IntelligenceReport {
  property:           Record<string, unknown>
  traditional_rental: { gross_pct: number; net_pct: number; annual_rent: number; annual_noi: number }
  shortlet:           { gross_pct: number; net_pct: number; nightly_rate: number; occupancy_rate: number; net_annual: number }
  cap_rate:           { cap_rate_pct: number; noi_annual: number }
  cash_on_cash:       { coc_pct: number; annual_cashflow: number; monthly_mortgage: number; down_payment: number }
  price_vs_market:    { median_price_area: number; pct_vs_median: number; price_position: string }
  affordability:      { accessible_to: string; buyer_profile: string; required_monthly_income: number }
  days_on_market:     { estimated_dom: number; dom_range: string; demand_level: string }
  area_benchmark:     { area_tier: string; demand_level: string }
  recommendation:     { strategy: string; strategy_label: string; reason: string }
}

export async function getIntelligenceReport(prop: PropertyInput): Promise<IntelligenceReport | null> {
  try {
    const res = await fetch(`${INTEL_API}/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(prop),
      cache:   'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// Format NGN amounts
export function fmtNGN(amount: number): string {
  if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(1)}B`
  if (amount >= 1_000_000)     return `₦${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)         return `₦${(amount / 1_000).toFixed(0)}K`
  return `₦${amount.toFixed(0)}`
}

export function yieldColor(pct: number): string {
  if (pct >= 10) return '#22c55e'  // green
  if (pct >= 7)  return '#84cc16'  // lime
  if (pct >= 5)  return '#eab308'  // yellow
  return '#f97316'                  // orange
}

export function positionLabel(pos: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    below_market:  { label: 'Below Market',   color: '#22c55e' },
    at_market:     { label: 'At Market',      color: '#eab308' },
    above_market:  { label: 'Above Market',   color: '#f97316' },
    premium:       { label: 'Premium Priced', color: '#ef4444' },
  }
  return map[pos] || { label: pos, color: '#94a3b8' }
}
