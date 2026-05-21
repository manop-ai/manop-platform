'use client'
// app/markets/page.tsx — FIXED
//
// CHANGES FROM PREVIOUS VERSION:
// 1. Map height is now numeric (500) not "100%" — fixes infinite spinner
// 2. Neighborhood stat strip only shows data pulled from DB — no hardcoded yield/median
// 3. Non-live neighborhoods show "Coming soon" — no fake stats
// 4. Listings panel is honest: shows only what DB returns
// 5. medianNGN and yieldPct arrays REMOVED — data comes from Supabase only

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

const ManopMap = dynamic(() => import('../../components/ManopMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 500, borderRadius: 14, background: '#0A0F1E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>Loading map…</span>
    </div>
  ),
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ── Neighborhood definitions — NO hardcoded market data ───────
// data comes from Supabase only
interface NeighborhoodDef {
  slug:    string
  name:    string
  city:    string
  country: string
  flag:    string
  centre:  [number, number]  // [lng, lat]
  zoom:    number
  live:    boolean           // true = we have listings; false = coming soon
}

const NEIGHBORHOODS: NeighborhoodDef[] = [
  { slug: 'lekki-phase-1',  name: 'Lekki Phase 1',  city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.4783,  6.4387],  zoom: 14, live: true  },
  { slug: 'ikoyi',           name: 'Ikoyi',           city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.4253,  6.4474],  zoom: 14, live: true  },
  { slug: 'victoria-island', name: 'Victoria Island', city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.4163,  6.4281],  zoom: 14, live: true  },
  { slug: 'ajah',            name: 'Ajah',            city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.5725,  6.4667],  zoom: 14, live: true  },
  { slug: 'chevron',         name: 'Chevron',         city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.5300,  6.4350],  zoom: 14, live: true  },
  { slug: 'gbagada',         name: 'Gbagada',         city: 'Lagos',   country: 'NG', flag: '🇳🇬', centre: [3.3917,  6.5500],  zoom: 14, live: false },
  { slug: 'east-legon',      name: 'East Legon',      city: 'Accra',   country: 'GH', flag: '🇬🇭', centre: [-0.1551, 5.6408],  zoom: 14, live: false },
  { slug: 'westlands',       name: 'Westlands',       city: 'Nairobi', country: 'KE', flag: '🇰🇪', centre: [36.8084, -1.2697], zoom: 14, live: false },
]

// Fallback coords for pins that have no lat/lng stored
const HOOD_COORDS: Record<string, [number, number]> = {
  'lekki phase 1':   [3.4783,  6.4387],
  'ikoyi':           [3.4253,  6.4474],
  'victoria island': [3.4163,  6.4281],
  'ajah':            [3.5725,  6.4667],
  'chevron':         [3.5300,  6.4350],
  'gbagada':         [3.3917,  6.5500],
  'east legon':      [-0.1551, 5.6408],
  'westlands':       [36.8084, -1.2697],
}

interface Property {
  id:            string
  neighborhood:  string | null
  property_type: string | null
  listing_type:  string | null
  bedrooms:      number | null
  price_local:   number | null
  price_usd:     number | null
  lat:           number | null
  lng:           number | null
  raw_data:      Record<string, unknown> | null
}

interface NeighborhoodStats {
  listing_count: number
  median_price:  number | null
  avg_yield:     number | null
}

type ViewMode    = 'for-sale' | 'for-rent' | 'short-let' | 'off-plan'
type DisplayMode = 'listings' | 'heatmap'

function fmtPrice(n: number | null) {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  return `₦${(n/1e6).toFixed(0)}M`
}

function yieldColour(y: number): string {
  if (y >= 7) return '#22C55E'
  if (y >= 5) return '#F59E0B'
  return '#EF4444'
}

// ─── Main ─────────────────────────────────────────────────────
export default function MarketsPage() {
  const [dark,        setDark]        = useState(true)
  const [selected,    setSelected]    = useState<NeighborhoodDef>(NEIGHBORHOODS[0])
  const [viewMode,    setViewMode]    = useState<ViewMode>('for-sale')
  const [displayMode, setDisplayMode] = useState<DisplayMode>('listings')
  const [bedrooms,    setBedrooms]    = useState<number | null>(null)
  const [listings,    setListings]    = useState<Property[]>([])
  const [stats,       setStats]       = useState<NeighborhoodStats | null>(null)
  const [loadingL,    setLoadingL]    = useState(false)
  const [highlighted, setHighlighted] = useState<string | null>(null)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Load listings + compute stats from real DB data
  const loadData = useCallback(async (hood: NeighborhoodDef) => {
    if (!hood.live) { setListings([]); setStats(null); return }
    setLoadingL(true)
    try {
      let q = sb.from('properties')
        .select('id,neighborhood,property_type,listing_type,bedrooms,price_local,price_usd,lat,lng,raw_data')
        .ilike('neighborhood', `%${hood.name}%`)
        .eq('listing_type', viewMode)
        .order('created_at', { ascending: false })
        .limit(80)

      if (bedrooms) q = q.eq('bedrooms', bedrooms)

      const { data } = await q
      const props = (data as Property[]) || []
      setListings(props)

      // Compute stats from actual data — no hardcoding
      if (props.length > 0) {
        const prices   = props.map(p => p.price_local).filter(Boolean) as number[]
        const sorted   = [...prices].sort((a, b) => a - b)
        const median   = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : null
        const yields   = props
          .map(p => (p.raw_data as any)?.intel?.trad_yield_pct as number | undefined)
          .filter(y => y && y > 0) as number[]
        const avgYield = yields.length > 0 ? yields.reduce((a, b) => a + b, 0) / yields.length : null
        setStats({ listing_count: props.length, median_price: median, avg_yield: avgYield })
      } else {
        setStats({ listing_count: 0, median_price: null, avg_yield: null })
      }
    } catch {
      setListings([])
      setStats(null)
    } finally {
      setLoadingL(false)
    }
  }, [viewMode, bedrooms])

  useEffect(() => { loadData(selected) }, [selected, loadData])

  // Build map pins from real listings
  const pins = listings
    .map(p => {
      const raw    = (p.raw_data || {}) as Record<string, unknown>
      const intel  = raw['intel'] as Record<string, unknown> | undefined
      const verdict = intel?.['verdict'] as string | null
      const yld    = intel?.['trad_yield_pct'] as number | undefined
      const hood   = (p.neighborhood || '').toLowerCase().trim()
      const coords = (p.lat && p.lng)
        ? [p.lng, p.lat] as [number, number]
        : HOOD_COORDS[hood] || null
      if (!coords) return null

      const pinVerdict = displayMode === 'heatmap' && yld
        ? (yld >= 7 ? 'buy' : yld >= 5 ? 'negotiate' : 'watch')
        : (verdict as any || null)

      return {
        id:      p.id,
        lng:     coords[0],
        lat:     coords[1],
        price:   fmtPrice(p.price_local),
        yield:   yld ? `${yld.toFixed(1)}%` : undefined,
        verdict: pinVerdict,
        badge:   null as any,
        beds:    p.bedrooms || undefined,
        onClick: (id: string) => {
          setHighlighted(id)
          document.getElementById(`ml-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          setTimeout(() => setHighlighted(null), 2500)
        },
      }
    })
    .filter(Boolean) as any[]

  // ── Theme ────────────────────────────────────────────────────
  const bg     = dark ? '#08091A' : '#F4F6FB'
  const bg2    = dark ? '#111827' : '#FFFFFF'
  const bg3    = dark ? '#162032' : '#F1F5F9'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.62)' : 'rgba(15,23,42,0.62)'
  const text3  = dark ? 'rgba(248,250,252,0.3)'  : 'rgba(15,23,42,0.3)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)'

  function chip(label: string, active: boolean, color: string, onClick: () => void) {
    return (
      <button
        key={label}
        onClick={onClick}
        style={{
          padding: '0.38rem 0.875rem', borderRadius: 20,
          fontSize: '0.78rem', fontWeight: active ? 700 : 400,
          cursor: 'pointer', fontFamily: 'inherit',
          border: `1.5px solid ${active ? color : border}`,
          background: active ? `${color}18` : 'transparent',
          color: active ? color : text2,
          transition: 'all 0.15s',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header + filters */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '1.25rem 1.5rem', position: 'sticky', top: 60, zIndex: 90 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: '0.875rem', flexWrap: 'wrap' as const }}>
            <h1 style={{ fontSize: 'clamp(1.1rem,2vw,1.4rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text }}>Markets</h1>
            <span style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Neighborhood intelligence
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {/* Listing type */}
            {chip('For Sale',  viewMode === 'for-sale',  '#5B2EFF', () => setViewMode('for-sale'))}
            {chip('For Rent',  viewMode === 'for-rent',  '#14B8A6', () => setViewMode('for-rent'))}
            {chip('Short-let', viewMode === 'short-let', '#F59E0B', () => setViewMode('short-let'))}
            {chip('Off-plan',  viewMode === 'off-plan',  '#22C55E', () => setViewMode('off-plan'))}

            <div style={{ width: 1, height: 18, background: border, margin: '0 4px', flexShrink: 0 }} />

            {/* Bedrooms */}
            {[null, 1, 2, 3, 4, 5].map(n =>
              chip(n === null ? 'Any beds' : `${n} bed`, bedrooms === n, '#5B2EFF', () => setBedrooms(n))
            )}

            <div style={{ width: 1, height: 18, background: border, margin: '0 4px', flexShrink: 0 }} />

            {/* Display mode */}
            {chip('📍 Listings', displayMode === 'listings', '#14B8A6', () => setDisplayMode('listings'))}
            {chip('🌡 Yield map', displayMode === 'heatmap',  '#22C55E', () => setDisplayMode('heatmap'))}
          </div>
        </div>
      </div>

      {/* 3-column layout */}
      <div style={{
        maxWidth: 1280, margin: '0 auto',
        padding: '1rem 1.5rem',
        display: 'grid',
        gridTemplateColumns: '220px 1fr 300px',
        gap: '1rem',
        alignItems: 'start',
      }}>

        {/* ── LEFT: Neighborhood list ── */}
        <div style={{ position: 'sticky', top: 140 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Neighborhoods
          </div>

          {NEIGHBORHOODS.map(nb => {
            const isSel = nb.slug === selected.slug
            return (
              <button
                key={nb.slug}
                onClick={() => { setSelected(nb); setHighlighted(null) }}
                style={{
                  width: '100%', textAlign: 'left', padding: '0.7rem 0.875rem',
                  background: isSel ? (dark ? 'rgba(91,46,255,0.12)' : 'rgba(91,46,255,0.06)') : 'transparent',
                  border: `1px solid ${isSel ? 'rgba(91,46,255,0.3)' : border}`,
                  borderRadius: 10, marginBottom: 5, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.12s',
                  opacity: nb.live ? 1 : 0.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: '0.85rem' }}>{nb.flag}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: isSel ? 700 : 500, color: isSel ? '#7C5FFF' : text }}>
                    {nb.name}
                  </span>
                  {!nb.live && (
                    <span style={{ fontSize: '0.5rem', color: text3, marginLeft: 'auto', fontWeight: 500 }}>
                      Soon
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.65rem', color: text3, marginTop: 2, paddingLeft: '1.6rem' }}>
                  {nb.city}
                </div>
              </button>
            )
          })}

          <Link
            href={`/neighborhood/${selected.slug}`}
            style={{
              display: 'block', marginTop: 10, padding: '0.6rem 0.875rem',
              background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)',
              borderRadius: 9, fontSize: '0.75rem', color: '#14B8A6',
              textDecoration: 'none', fontWeight: 600, textAlign: 'center' as const,
            }}
          >
            {selected.name} brief →
          </Link>
        </div>

        {/* ── CENTRE: Stats + Map ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

          {/* Stats strip — only shown if we have real data */}
          {selected.live && stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                {
                  label:  'Listings',
                  value:  stats.listing_count > 0 ? String(stats.listing_count) : '—',
                  color:  '#7C5FFF',
                },
                {
                  label:  bedrooms ? `Median ${bedrooms}-bed` : 'Median price',
                  value:  stats.median_price ? fmtPrice(stats.median_price) : '—',
                  color:  stats.median_price ? '#7C5FFF' : text3,
                  note:   !stats.median_price ? 'No data yet' : undefined,
                },
                {
                  label:  'Avg. yield (where computed)',
                  value:  stats.avg_yield ? `${stats.avg_yield.toFixed(1)}%` : '—',
                  color:  stats.avg_yield ? yieldColour(stats.avg_yield) : text3,
                  note:   !stats.avg_yield ? 'Submit sales data to compute' : undefined,
                },
              ].map(s => (
                <div key={s.label} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 10, padding: '0.75rem 0.875rem' }}>
                  <div style={{ fontSize: '0.58rem', color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>
                    {s.value}
                  </div>
                  {s.note && (
                    <div style={{ fontSize: '0.58rem', color: text3, marginTop: 2 }}>{s.note}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Heatmap legend */}
          {displayMode === 'heatmap' && selected.live && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '0.5rem 0.875rem', background: bg2,
              border: `1px solid ${border}`, borderRadius: 9,
              fontSize: '0.72rem', color: text2, flexWrap: 'wrap' as const,
            }}>
              <span style={{ fontWeight: 600 }}>Yield map:</span>
              {[{ c: '#22C55E', l: '7%+ Strong' }, { c: '#F59E0B', l: '5–7% Moderate' }, { c: '#EF4444', l: '<5% Low' }, { c: '#5B2EFF', l: 'No yield data' }].map(k => (
                <span key={k.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: k.c, display: 'inline-block', flexShrink: 0 }} />
                  {k.l}
                </span>
              ))}
            </div>
          )}

          {/* Map — explicit numeric height fixes the infinite spinner */}
          <ManopMap
            key={`${selected.slug}-${viewMode}`}
            center={selected.centre}
            zoom={selected.zoom}
            pins={pins}
            height={500}
            mapStyle="satellite-streets"
            showControls
          />

          {/* Count */}
          <div style={{ fontSize: '0.7rem', color: text3 }}>
            {!selected.live
              ? `${selected.name} · Coming soon`
              : loadingL
              ? 'Loading…'
              : `${listings.length} ${viewMode.replace('-', ' ')} listing${listings.length !== 1 ? 's' : ''} in ${selected.name}`
            }
          </div>
        </div>

        {/* ── RIGHT: Listings ── */}
        <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingRight: 2 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            {selected.name}
          </div>

          {!selected.live ? (
            /* Coming soon */
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: '2rem 1.5rem', textAlign: 'center' as const }}>
              <div style={{ fontSize: '1.75rem', marginBottom: 12, opacity: 0.35 }}>🔜</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: text, marginBottom: 8 }}>
                {selected.name} — Coming soon
              </div>
              <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, marginBottom: 16 }}>
                We're onboarding agencies in {selected.city}. Listings and market data will appear here once verified.
              </div>
              <Link
                href="/agency/onboard"
                style={{ display: 'inline-block', background: '#5B2EFF', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.78rem', fontWeight: 700 }}
              >
                List in {selected.city} →
              </Link>
            </div>
          ) : loadingL ? (
            <div style={{ color: text3, fontSize: 13, padding: '2rem', textAlign: 'center' as const }}>Loading…</div>
          ) : listings.length === 0 ? (
            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', textAlign: 'center' as const }}>
              <div style={{ fontSize: '0.82rem', color: text2, marginBottom: 10 }}>
                No {viewMode.replace('-', ' ')} listings yet in {selected.name}
                {bedrooms ? ` for ${bedrooms} bedrooms` : ''}.
              </div>
              <button
                onClick={() => { setBedrooms(null); setViewMode('for-sale') }}
                style={{ fontSize: '0.72rem', color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            listings.map(p => {
              const raw    = (p.raw_data || {}) as Record<string, unknown>
              const images = Array.isArray(raw['images']) ? raw['images'] as string[] : []
              const intel  = raw['intel'] as Record<string, unknown> | undefined
              const yld    = intel?.['trad_yield_pct'] as number | null
              const verdict = intel?.['verdict'] as string | null
              const img    = images[0] || null
              const isHigh = highlighted === p.id

              return (
                <div
                  key={p.id}
                  id={`ml-${p.id}`}
                  style={{
                    background: bg2,
                    border: `1px solid ${isHigh ? 'rgba(91,46,255,0.5)' : border}`,
                    borderRadius: 10, marginBottom: 8, overflow: 'hidden',
                    boxShadow: isHigh ? '0 0 0 3px rgba(91,46,255,0.1)' : 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  {img && (
                    <div style={{ height: 100, overflow: 'hidden' }}>
                      <img
                        src={img} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
                      />
                    </div>
                  )}
                  <div style={{ padding: '0.75rem 0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: text, lineHeight: 1.2 }}>
                        {p.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p.property_type || 'Property'}
                      </div>
                      {yld != null && yld > 0 && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: yieldColour(yld), background: `${yieldColour(yld)}15`, padding: '2px 6px', borderRadius: 20, flexShrink: 0, marginLeft: 6 }}>
                          {yld.toFixed(1)}% yield
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.02em', marginBottom: verdict ? 4 : 8 }}>
                      {fmtPrice(p.price_local)}
                    </div>

                    {verdict && (
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, color: verdict === 'buy' ? '#22C55E' : verdict === 'negotiate' ? '#F59E0B' : text3 }}>
                        {verdict === 'buy' ? '✓ BUY' : verdict === 'negotiate' ? '↔ NEGOTIATE' : verdict === 'watch' ? '◎ WATCH' : '⏸ WAIT'}
                      </div>
                    )}

                    <Link
                      href={`/property/${p.id}`}
                      style={{ display: 'block', background: '#5B2EFF', color: '#fff', textAlign: 'center' as const, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem', borderRadius: 7 }}
                    >
                      View details →
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 220px 1fr 300px"] {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 640px) {
          div[style*="position: sticky"] > div[style*="position: sticky"] {
            position: static !important;
          }
        }
      `}</style>
    </div>
  )
}