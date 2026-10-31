// lib/currency.ts
//
// Diaspora currency context. Reads sourced, dated reference rates from
// currency_reference_rates (sql/phase9_user_workspace.sql) — the only
// currency/FX code anywhere in this codebase (confirmed: no other
// exchange-rate logic exists, hardcoded or otherwise, before this file).
//
// This deliberately does NOT call a live FX API. The standing rule for
// this feature is explicit: never fabricate an exchange rate. A number
// an admin entered, with a named source and a verification date, is
// honest; a number this code invented or silently let go stale is not.
// Same discipline as lib/finance-products.ts's staleness handling.

import { sb } from './supabase/client'

export const RATE_STALENESS_THRESHOLD_DAYS = 14

export interface CurrencyRate {
  quote_currency: 'USD' | 'GBP' | 'EUR'
  rate: number // NGN per 1 unit of quote_currency
  source_name: string
  source_url: string | null
  last_verified_at: string
}

export function isRateStale(last_verified_at: string): boolean {
  const ageDays = (Date.now() - new Date(last_verified_at).getTime()) / 86_400_000
  return ageDays > RATE_STALENESS_THRESHOLD_DAYS
}

// Fetches all active NGN reference rates. Returns an empty array (never
// throws, never fabricates) if the table is empty, unreachable, or not
// yet migrated — callers show "Exchange rate unavailable" in that case.
export async function getCurrencyRates(): Promise<CurrencyRate[]> {
  const { data, error } = await sb
    .from('currency_reference_rates')
    .select('quote_currency, rate, source_name, source_url, last_verified_at')
    .eq('status', 'active')
    .eq('base_currency', 'NGN')
  if (error || !data) return []
  return data as CurrencyRate[]
}

// Converts an NGN amount using a specific rate row. Returns null — never
// a guessed number — if the rate is missing or has gone stale past the
// threshold; the caller is expected to show "unavailable" in that case,
// not silently fall back to an old figure.
export function convertNgn(amountNgn: number, rate: CurrencyRate | undefined | null): number | null {
  if (!rate || isRateStale(rate.last_verified_at)) return null
  return amountNgn / rate.rate
}

export function formatCurrency(amount: number, currency: 'USD' | 'GBP' | 'EUR'): string {
  const symbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€'
  if (Math.abs(amount) >= 1e6) return `${symbol}${(amount / 1e6).toFixed(2)}M`
  if (Math.abs(amount) >= 1e3) return `${symbol}${(amount / 1e3).toFixed(1)}K`
  return `${symbol}${Math.round(amount).toLocaleString()}`
}