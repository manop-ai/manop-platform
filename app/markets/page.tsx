'use client'
// app/markets/page.tsx — Market Intelligence (rebuilt)
//
// REPLACES the previous resale-property map/heatmap page entirely.
// That version computed "avg_yield" from raw_data.intel.trad_yield_pct
// — a number traced back to a rent_benchmarks table seeded with 5
// manually-entered rows, not real rental transactions. Showing it
// implied a confidence MANOP didn't have.
//
// This version shows exactly what MANOP has actually gathered for an
// area, as counts — never a derived score, yield, or percentage. The
// one exception: median sold price, and ONLY once an area has at least
// 3 verified transactions — the same threshold already used for the
// sold-price index. Areas below that threshold show the raw count
// instead of a number, honestly.
//
// This is meant to visibly get smarter over time: as more developments
// get reviewed, more sites get submitted, and more transactions get
// verified in a given area, that area's panel fills in — in front of
// the user, not behind a fabricated placeholder.

import { Suspense } from 'react'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../lib/theme'
import { sb } from '../../lib/supabase/client'
import { Building2, LandPlot, Activity, TrendingUp, ArrowRight, MapPin } from 'lucide-react'
import ManopLoader from '../../components/ManopLoader'


// Minimum verified transactions before a median price is shown for an
// area — same rule already used for the sold-price index. Below this,
// the raw count is shown instead of a number.
const MIN_VERIFIED_TXNS_FOR_PRICE = 3

const AREAS = [
  { name: 'Lekki Phase 1',  city: 'Lagos' },
  { name: 'Ikoyi',          city: 'Lagos' },
  { name: 'Victoria Island',city: 'Lagos' },
  { name: 'Ajah',           city: 'Lagos' },
  { name: 'Chevron',        city: 'Lagos' },
  { name: 'Gbagada',        city: 'Lagos' },
  { name: 'East Legon',     city: 'Accra' },
]

interface AreaIntel {
  reviewedDevelopments: number
  sitesSubmitted: number
  recordedActivity30d: number
  verifiedTransactions: number
  medianSoldPrice: number | null
}

function fmtNGN(n: number | null): string {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1000)}K`
}

function MarketsContent() {
  const [dark, setDark] = useState(getInitialDark)
  const searchParams = useSearchParams()
  // Support deep links like /markets?area=East%20Legon from the footer,
  // calculator, and anywhere else pointing at a specific area — falls
  // back to the fixed list, but an unlisted area still resolves instead
  // of silently doing nothing.
  const areaParam = searchParams.get('area')
  const initialArea = areaParam
    ? AREAS.find(a => a.name.toLowerCase() === areaParam.toLowerCase())
      || { name: areaParam, city: '' }
    : AREAS[0]
  const [selected, setSelected] = useState(initialArea)
  const [intel, setIntel] = useState<AreaIntel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { return listenTheme(setDark) }, [])

  const loadIntel = useCallback(async (area: typeof AREAS[number]) => {
    setLoading(true)
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [devRes, siteRes, activityRes, txnRes] = await Promise.all([
      sb.from('developer_projects').select('id', { count: 'exact', head: true })
        .ilike('neighborhood', `%${area.name}%`).eq('publish_status', 'published'),
      sb.from('sites').select('id', { count: 'exact', head: true })
        .ilike('neighborhood', `%${area.name}%`).eq('site_status', 'published'),
      sb.from('activity_log').select('id', { count: 'exact', head: true })
        .ilike('neighborhood', `%${area.name}%`).eq('signal_category', 'demand').gte('created_at', since30d),
      sb.from('market_transactions').select('sold_price')
        .ilike('neighborhood', `%${area.name}%`).eq('verification_status', 'verified'),
    ])

    const verifiedPrices = (txnRes.data || []).map(t => t.sold_price).filter((p): p is number => typeof p === 'number')
    const verifiedCount = verifiedPrices.length
    let median: number | null = null
    if (verifiedCount >= MIN_VERIFIED_TXNS_FOR_PRICE) {
      const sorted = [...verifiedPrices].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    setIntel({
      reviewedDevelopments: devRes.count || 0,
      sitesSubmitted:       siteRes.count || 0,
      recordedActivity30d:  activityRes.count || 0,
      verifiedTransactions: verifiedCount,
      medianSoldPrice:      median,
    })
    setLoading(false)
  }, [])

  useEffect(() => { loadIntel(selected) }, [selected, loadIntel])

  const c = getDesignColors(dark)

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: 'clamp(2.5rem,6vw,4rem) clamp(1.25rem,4vw,2.5rem)' }}>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 10 }}>
          Market Intelligence
        </div>
        <h1 style={{ fontSize: 'clamp(1.6rem,3.2vw,2.3rem)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: 12 }}>
          What MANOP actually knows about an area.
        </h1>
        <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.7, maxWidth: 620, fontWeight: 300, marginBottom: 32 }}>
          Real counts of what's been reviewed, submitted, and observed — never a fabricated score,
          yield, or percentage. Median sold price only appears once an area has at least{' '}
          {MIN_VERIFIED_TXNS_FOR_PRICE} independently verified transactions behind it. This page
          gets more useful as MANOP accumulates more evidence — that's the honest version of
          "market intelligence" at this stage.
        </p>

        {/* Area selector */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 28 }}>
          {AREAS.map(a => (
            <button key={a.name} onClick={() => setSelected(a)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0.5rem 0.9rem', borderRadius: designTokens.radius.sm,
                border: `1px solid ${selected.name === a.name ? c.intelligencePurple : c.border}`,
                background: selected.name === a.name ? c.intelligencePurpleBg : 'transparent',
                color: selected.name === a.name ? c.textPrimary : c.textMuted,
                fontSize: 13, fontWeight: selected.name === a.name ? 700 : 500, cursor: 'pointer',
                fontFamily: designTokens.font.family,
              }}>
              <MapPin size={13} /> {a.name}
            </button>
          ))}
        </div>

        {/* Intel panel */}
        <div style={{ background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: 14, padding: 'clamp(1.5rem,3vw,2rem)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.name}</div>
              <div style={{ fontSize: 12, color: c.textMuted }}>{selected.city}</div>
            </div>
            <Link href={`/developments?area=${encodeURIComponent(selected.name)}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#14B8A6', textDecoration: 'none' }}>
              View reviewed developments <ArrowRight size={13} />
            </Link>
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: c.textFaint, padding: '2rem 0', textAlign: 'center' as const }}>Loading…</div>
          ) : intel && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { icon: Building2, label: 'Reviewed developments', value: intel.reviewedDevelopments },
                  { icon: LandPlot,  label: 'Sites submitted',       value: intel.sitesSubmitted },
                  { icon: Activity,  label: 'Recorded interest (30d)', value: intel.recordedActivity30d },
                ].map(s => (
                  <div key={s.label} style={{ background: c.surfaceCardHigh, borderRadius: designTokens.radius.sm, padding: '1rem' }}>
                    <s.icon size={16} color={c.intelligencePurple} style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: c.textMuted }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Price — only shown once the threshold is actually met */}
              <div style={{ background: c.surfaceCardHigh, borderRadius: designTokens.radius.sm, padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <TrendingUp size={15} color="#14B8A6" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                    Median sold price
                  </span>
                </div>
                {intel.medianSoldPrice !== null ? (
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{fmtNGN(intel.medianSoldPrice)}</div>
                ) : (
                  <div style={{ fontSize: 13, color: c.textFaint, lineHeight: 1.6 }}>
                    {intel.verifiedTransactions} of {MIN_VERIFIED_TXNS_FOR_PRICE} verified transactions
                    needed — not enough evidence yet to show a price honestly.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <p style={{ fontSize: 11.5, color: c.textFaint, lineHeight: 1.6, marginTop: 20, maxWidth: 620 }}>
          Reviewed developments and sites reflect what's currently published on MANOP.
          Recorded interest is real platform activity (views and enquiries), not a market forecast.
          None of this is investment advice.
        </p>
      </div>
    </div>
  )
}

export default function MarketsPage() {
  return (
    <Suspense fallback={<ManopLoader dark={true} label="Loading market intelligence…" />}>
      <MarketsContent />
    </Suspense>
  )
}