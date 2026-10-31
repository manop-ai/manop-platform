'use client'
// components/CurrencyContext.tsx
//
// Diaspora currency context for a price shown in NGN. Per the standing
// rule, this never invents a number: it reads sourced, dated rates via
// lib/currency.ts and shows "Exchange rate unavailable" rather than
// guessing when there's no current rate on file. This is deliberately
// NOT a "Diaspora Score" or any kind of certainty device — it's a plain
// unit conversion, labelled as indicative and dated.

import { useEffect, useState } from 'react'
import { getCurrencyRates, convertNgn, formatCurrency, type CurrencyRate } from '../lib/currency'

export default function CurrencyContext({ amountNgn, dark }: { amountNgn: number; dark: boolean }) {
  const [rates, setRates] = useState<CurrencyRate[] | null>(null)

  useEffect(() => { getCurrencyRates().then(setRates) }, [])

  const text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const text2 = dark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.68)'

  if (rates === null) return null // still loading — say nothing rather than flash an empty state
  if (rates.length === 0) {
    return <div style={{ fontSize: 11, color: text3, marginTop: 4 }}>Exchange rate unavailable.</div>
  }

  const ORDER: Array<'USD' | 'GBP' | 'EUR'> = ['USD', 'GBP', 'EUR']
  const byCurrency = new Map(rates.map(r => [r.quote_currency, r]))

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
        {ORDER.map(cur => {
          const rate = byCurrency.get(cur)
          const converted = convertNgn(amountNgn, rate)
          return (
            <span key={cur} style={{ fontSize: 12.5, color: text2 }}>
              ≈ {converted != null ? formatCurrency(converted, cur) : 'unavailable'}
            </span>
          )
        })}
      </div>
      {rates[0] && (
        <div style={{ fontSize: 10.5, color: text3, marginTop: 3 }}>
          Indicative reference rate · {rates[0].source_name} · checked {new Date(rates[0].last_verified_at).toLocaleDateString()}. Not a live quote — confirm current rates before paying.
        </div>
      )}
    </div>
  )
}