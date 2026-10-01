'use client'
// components/AreaIntelligence.tsx
//
// This is the "ask where they're interested, show area data" flow. It reads
// the neighborhood_intelligence table that already exists and already
// computes real numbers (demand_score_7d, area_score, active_listings,
// active_developments, data_quality) from real activity signals — this
// component does not invent anything. If a searched area has no row yet,
// it says so plainly instead of showing a zero or a fake placeholder.

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme, getDesignColors, designTokens, getDataQualityStyle } from '../lib/theme'
import { Block, DataBlock, Badge } from './Blocks'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface NeighborhoodIntel {
  neighborhood: string
  city: string
  country_code: string
  demand_score_7d: number
  demand_trend: string
  active_listings: number
  active_developments: number
  listings_for_sale: number
  listings_for_rent: number
  median_price_ngn: number | null
  verified_agencies: number
  total_agencies: number
  trust_composite: number
  verified_transactions: number
  area_score: number
  data_quality: string
  meets_display_threshold: boolean
}

export default function AreaIntelligence() {
  const [dark, setDark] = useState(getInitialDark)
  useEffect(() => {
    return listenTheme(setDark)
  }, [])
  const c = getDesignColors(dark)
  const dataQualityStyle = getDataQualityStyle(dark)

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<NeighborhoodIntel | null | 'not_found'>(null)

  async function search() {
    if (!query.trim()) return
    setLoading(true)
    const { data } = await sb
      .from('neighborhood_intelligence')
      .select('*')
      .ilike('neighborhood', `%${query.trim()}%`)
      .order('area_score', { ascending: false })
      .limit(1)
      .maybeSingle()
    setResult((data as NeighborhoodIntel) || 'not_found')
    setLoading(false)
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Which area are you interested in? e.g. Lekki Phase 1, Ikoyi, East Legon…"
          style={{
            flex: 1, padding: '0.75rem 1rem', borderRadius: designTokens.radius.sm,
            border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary,
            fontSize: 14, outline: 'none', fontFamily: designTokens.font.family,
          }}
        />
        <button onClick={search} disabled={loading} style={{
          padding: '0.75rem 1.5rem', borderRadius: designTokens.radius.sm, background: c.intelligencePurple,
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: designTokens.font.family,
        }}>
          {loading ? 'Searching…' : 'Search area →'}
        </button>
      </div>

      {result === 'not_found' && (
        <Block dark={dark}>
          <div style={{ fontSize: 13, color: c.textMuted }}>
            No area intelligence recorded yet for "{query}" — this fills in automatically as activity and
            listings in that area grow.
          </div>
        </Block>
      )}

      {result && result !== 'not_found' && (
        <>
          {!result.meets_display_threshold && (
            <div style={{ fontSize: 12, color: c.statusAmber, marginBottom: 10 }}>
              Limited data for this area — shown for context, not yet enough activity for a confident read.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <DataBlock dark={dark}
              label="Median Price"
              value={result.median_price_ngn ? `₦${(result.median_price_ngn / 1_000_000).toFixed(1)}M` : '—'}
              source="MANOP listings"
            />
            <DataBlock dark={dark}
              label="Active Listings"
              value={String(result.active_listings)}
              sublabel={<span style={{ color: c.textMuted, fontSize: 11 }}>{result.listings_for_sale} for sale · {result.listings_for_rent} for rent</span>}
            />
            <DataBlock dark={dark}
              label="Reviewed Developments"
              value={String(result.active_developments)}
              sublabel={result.active_developments > 0 ? <span style={{ color: c.verificationTeal, fontSize: 11 }}>Available in this area</span> : undefined}
            />
            <DataBlock dark={dark}
              label="Demand (7d)"
              value={`${result.demand_score_7d}/100`}
              sublabel={<span style={{ color: c.textMuted, fontSize: 11, textTransform: 'capitalize' as const }}>{result.demand_trend}</span>}
            />
            <DataBlock dark={dark}
              label="Verified Agencies"
              value={`${result.verified_agencies}/${result.total_agencies}`}
              source="MANOP verification"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: c.textMuted }}>Area Score: <strong style={{ color: c.textPrimary }}>{result.area_score}/100</strong></span>
            <Badge
              dark={dark}
              label={dataQualityStyle[result.data_quality]?.label || result.data_quality}
              color={dataQualityStyle[result.data_quality]?.color || c.textMuted}
            />
          </div>
        </>
      )}
    </div>
  )
}