'use client'
// app/markets/page.tsx
// Country → State → Neighborhood hierarchy
// Leaflet + OpenStreetMap for property pin map
// Shows neighborhood benchmarks + sample properties per area

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { REAL_BENCHMARKS } from '../../lib/insights'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ── Market data hierarchy ─────────────────────────────────────
const MARKET_TREE = {
  NG: {
    name: 'Nigeria', flag: '🇳🇬', currency: 'NGN',
    states: {
      Lagos: {
        name: 'Lagos', center: [6.5244, 3.3792] as [number, number],
        neighborhoods: [
          { slug: 'lekki-phase-1',  name: 'Lekki Phase 1',  lat: 6.4698, lng: 3.5852, tier: 'Premium', live: true,  img: 'https://images.unsplash.com/photo-1577948000111-9c970dfe3743?w=400&q=80' },
          { slug: 'ikoyi',           name: 'Ikoyi',           lat: 6.4531, lng: 3.4270, tier: 'Prime',   live: true,  img: 'https://images.unsplash.com/photo-1569336415962-a4bd9f69c5b7?w=400&q=80' },
          { slug: 'victoria-island', name: 'Victoria Island', lat: 6.4281, lng: 3.4219, tier: 'Prime',   live: true,  img: 'https://images.unsplash.com/photo-1580746738099-b543b97b36f7?w=400&q=80' },
          { slug: 'ajah',            name: 'Ajah',            lat: 6.4698, lng: 3.6011, tier: 'Mid',     live: true,  img: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=400&q=80' },
          { slug: 'chevron',         name: 'Chevron',         lat: 6.4350, lng: 3.5300, tier: 'Mid',     live: false, img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&q=80' },
          { slug: 'ikota',           name: 'Ikota',           lat: 6.4512, lng: 3.5700, tier: 'Mid',     live: false, img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&q=80' },
        ],
      },
      Abuja: {
        name: 'Abuja', center: [9.0765, 7.3986] as [number, number],
        neighborhoods: [
          { slug: 'maitama',  name: 'Maitama',  lat: 9.0800, lng: 7.4800, tier: 'Premium', live: false, img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80' },
          { slug: 'asokoro',  name: 'Asokoro',  lat: 9.0500, lng: 7.5100, tier: 'Prime',   live: false, img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&q=80' },
          { slug: 'wuse-2',   name: 'Wuse 2',   lat: 9.0700, lng: 7.4700, tier: 'Mid',     live: false, img: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&q=80' },
        ],
      },
    },
  },
  GH: {
    name: 'Ghana', flag: '🇬🇭', currency: 'GHS',
    states: {
      'Greater Accra': {
        name: 'Greater Accra', center: [5.6037, -0.1870] as [number, number],
        neighborhoods: [
          { slug: 'east-legon',         name: 'East Legon',        lat: 5.6500, lng: -0.1500, tier: 'Premium', live: false, img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80' },
          { slug: 'cantonments-accra',  name: 'Cantonments',       lat: 5.5800, lng: -0.1900, tier: 'Prime',   live: false, img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&q=80' },
          { slug: 'labone',             name: 'Labone',             lat: 5.5700, lng: -0.1750, tier: 'Prime',   live: false, img: 'https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=400&q=80' },
        ],
      },
    },
  },
  KE: {
    name: 'Kenya', flag: '🇰🇪', currency: 'KES',
    states: {
      Nairobi: {
        name: 'Nairobi', center: [-1.2921, 36.8219] as [number, number],
        neighborhoods: [
          { slug: 'westlands', name: 'Westlands', lat: -1.2700, lng: 36.8100, tier: 'Premium', live: false, img: 'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=400&q=80' },
          { slug: 'karen',     name: 'Karen',     lat: -1.3300, lng: 36.7100, tier: 'Prime',   live: false, img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&q=80' },
          { slug: 'kilimani',  name: 'Kilimani',  lat: -1.2900, lng: 36.7800, tier: 'Mid',     live: false, img: 'https://images.unsplash.com/photo-1513584684374-8bab748fbf90?w=400&q=80' },
        ],
      },
    },
  },
}

type CountryCode = keyof typeof MARKET_TREE

interface NeighborhoodPin {
  slug: string; name: string; lat: number; lng: number
  tier: string; live: boolean; img: string
}

// ── Benchmark display helper ──────────────────────────────────
function fmtM(n: number) {
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}

// ── Leaflet map (loaded client-side only) ─────────────────────
function NeighborhoodMap({ neighborhoods, selectedSlug, onSelect, dark }: {
  neighborhoods: NeighborhoodPin[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
  dark: boolean
}) {
  const mapRef     = useRef<HTMLDivElement>(null)
  const leafletRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return

    // Load Leaflet dynamically
    const loadMap = async () => {
      const L = (await import('leaflet' as any)).default

      // Leaflet CSS
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'
        document.head.appendChild(link)
      }

      // Fix default icon path issue with webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      })

      // Init map
      if (leafletRef.current) {
        leafletRef.current.remove()
      }

      const center = neighborhoods.length > 0
        ? [neighborhoods[0].lat, neighborhoods[0].lng] as [number, number]
        : [6.5244, 3.3792] as [number, number]

      const map = L.map(mapRef.current!, {
        center,
        zoom: 12,
        zoomControl: true,
        attributionControl: false,
      })
      leafletRef.current = map

      // Tile layer — dark/light
      const tileUrl = dark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

      L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map)

      // Add markers
      markersRef.current = []
      neighborhoods.forEach(n => {
        const isSelected = n.slug === selectedSlug
        const isLive     = n.live

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width: ${isSelected ? 44 : 34}px;
            height: ${isSelected ? 44 : 34}px;
            border-radius: 50%;
            background: ${isSelected ? '#5B2EFF' : isLive ? '#14B8A6' : '#64748B'};
            border: 3px solid ${isSelected ? '#fff' : isLive ? 'rgba(20,184,166,0.4)' : 'rgba(100,116,139,0.4)'};
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 16px rgba(0,0,0,0.35);
            cursor: pointer;
            font-size: ${isSelected ? '14px' : '11px'};
            font-weight: 800;
            color: #fff;
            font-family: sans-serif;
            transition: all 0.2s;
            ${isSelected ? 'animation: mapPulse 1.5s infinite;' : ''}
          ">
            ${isLive ? '●' : '○'}
          </div>`,
          iconSize: [isSelected ? 44 : 34, isSelected ? 44 : 34],
          iconAnchor: [isSelected ? 22 : 17, isSelected ? 22 : 17],
        })

        const marker = L.marker([n.lat, n.lng], { icon })
          .addTo(map)
          .on('click', () => onSelect(n.slug))

        // Tooltip
        marker.bindTooltip(`
          <div style="font-family:sans-serif;padding:4px 6px;font-size:12px;font-weight:700;">
            ${n.name}
            <br><span style="font-size:10px;font-weight:400;color:#94a3b8">${n.tier}${n.live ? ' · Live data' : ' · Coming soon'}</span>
          </div>
        `, { permanent: false, direction: 'top', offset: [0, -8] })

        markersRef.current.push(marker)
      })

      // Fit bounds to all markers
      if (neighborhoods.length > 1) {
        const bounds = L.latLngBounds(neighborhoods.map(n => [n.lat, n.lng]))
        map.fitBounds(bounds, { padding: [40, 40] })
      }
    }

    loadMap()
    return () => { leafletRef.current?.remove(); leafletRef.current = null }
  }, [neighborhoods, dark])

  return (
    <>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: 14, overflow: 'hidden' }} />
      <style>{`
        @keyframes mapPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(91,46,255,0.4), 0 4px 16px rgba(0,0,0,0.35); }
          50% { box-shadow: 0 0 0 12px rgba(91,46,255,0), 0 4px 16px rgba(0,0,0,0.35); }
        }
        .leaflet-container { background: transparent !important; }
        .leaflet-tooltip { background: #0F172A; border: 1px solid rgba(248,250,252,0.1); color: #F8FAFC; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
        .leaflet-tooltip::before { border-top-color: rgba(248,250,252,0.1); }
      `}</style>
    </>
  )
}

// ── Neighborhood card ─────────────────────────────────────────
function NeighborhoodCard({ n, isSelected, onClick, dark }: {
  n: NeighborhoodPin; isSelected: boolean; onClick: () => void; dark: boolean
}) {
  const b     = REAL_BENCHMARKS[n.slug]
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const bestYield = b ? Math.max(...Object.values(b.yields)) : null
  const medianM   = b ? Math.round((b.medians[3] || b.medians[2] || 0) / 1e6) : null

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? (dark ? 'rgba(91,46,255,0.12)' : 'rgba(91,46,255,0.06)') : bg3,
        border: `1.5px solid ${isSelected ? '#5B2EFF' : border}`,
        borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
        transition: 'all 0.18s',
      }}
    >
      {/* Image */}
      <div style={{ height: 100, overflow: 'hidden', position: 'relative' }}>
        <img src={n.img} alt={n.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          {n.live
            ? <span style={{ fontSize: '0.55rem', fontWeight: 700, background: 'rgba(20,184,166,0.9)', color: '#fff', borderRadius: 10, padding: '2px 6px' }}>● LIVE</span>
            : <span style={{ fontSize: '0.55rem', fontWeight: 600, background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.7)', borderRadius: 10, padding: '2px 6px' }}>SOON</span>
          }
        </div>
        <div style={{ position: 'absolute', bottom: 6, left: 8 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff' }}>{n.name}</div>
          <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.7)' }}>{n.tier}</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '0.6rem 0.75rem' }}>
        {b ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.58rem', color: text3, marginBottom: 2 }}>Best yield</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: bestYield && bestYield >= 6 ? '#22C55E' : '#F59E0B' }}>{bestYield?.toFixed(1)}%</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.58rem', color: text3, marginBottom: 2 }}>3-bed median</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#7C5FFF' }}>₦{medianM}M</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.58rem', color: text3, marginBottom: 2 }}>Listings</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: text }}>{b.sale_count + b.rent_count}</div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.72rem', color: text3, textAlign: 'center', padding: '0.3rem 0' }}>
            {n.live ? 'Loading benchmarks…' : 'Data coming soon'}
          </div>
        )}
        <Link
          href={`/neighborhood/${n.slug}`}
          onClick={e => e.stopPropagation()}
          style={{ display: 'block', marginTop: '0.5rem', background: '#5B2EFF', color: '#fff', padding: '0.4rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.68rem', fontWeight: 600, textAlign: 'center' }}
        >
          Full analysis →
        </Link>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function MarketsPage() {
  const [dark, setDark]           = useState(true)
  const [country, setCountry]     = useState<CountryCode>('NG')
  const [state, setState]         = useState('Lagos')
  const [selectedSlug, setSlug]   = useState<string | null>('lekki-phase-1')
  const [listingCounts, setCounts]= useState<Record<string, number>>({})

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Fetch listing counts per neighborhood for the current state
  useEffect(() => {
    const hoods = (MARKET_TREE[country]?.states as any)?.[state]?.neighborhoods || []
    if (hoods.length === 0) return
    const names = hoods.map((n: NeighborhoodPin) => n.name)
    sb.from('properties')
      .select('neighborhood')
      .in('neighborhood', names)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach(r => {
          if (r.neighborhood) counts[r.neighborhood] = (counts[r.neighborhood] || 0) + 1
        })
        setCounts(counts)
      })
  }, [country, state])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.08)'

  const countryData  = MARKET_TREE[country]
  const stateData    = (countryData?.states as any)?.[state]
  const neighborhoods: NeighborhoodPin[] = stateData?.neighborhoods || []
  const stateNames   = Object.keys(countryData?.states || {})

  const selectedHood = neighborhoods.find(n => n.slug === selectedSlug) || neighborhoods[0]
  const selectedBenchmark = selectedHood ? REAL_BENCHMARKS[selectedHood.slug] : null

  const tabStyle = (active: boolean, color = '#5B2EFF'): React.CSSProperties => ({
    padding: '0.45rem 1rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
    cursor: 'pointer', border: `1.5px solid ${active ? color : border}`,
    background: active ? `${color}20` : 'transparent',
    color: active ? color : text2, fontFamily: 'inherit', transition: 'all 0.15s',
  })

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '1.75rem 2rem 1.25rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Link href="/" style={{ fontSize: '0.75rem', color: text3, textDecoration: 'none' }}>Manop</Link>
            <span style={{ color: text3 }}>›</span>
            <span style={{ fontSize: '0.75rem', color: text2 }}>Markets</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '0.35rem' }}>
            African property markets
          </h1>
          <p style={{ fontSize: '0.85rem', color: text2, maxWidth: 500 }}>
            Browse by country, state, and neighborhood. See verified benchmarks and live listings on the map.
          </p>

          {/* Country tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
            {(Object.keys(MARKET_TREE) as CountryCode[]).map(c => (
              <button key={c} style={tabStyle(country === c)} onClick={() => {
                setCountry(c)
                const firstState = Object.keys(MARKET_TREE[c].states)[0]
                setState(firstState)
                setSlug((MARKET_TREE[c].states as any)[firstState]?.neighborhoods?.[0]?.slug || null)
              }}>
                {MARKET_TREE[c].flag} {MARKET_TREE[c].name}
              </button>
            ))}
            <button style={{ ...tabStyle(false), opacity: 0.45, cursor: 'not-allowed' }}>🇿🇦 South Africa (soon)</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem' }}>

        {/* State tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {stateNames.map(s => (
            <button key={s} style={tabStyle(state === s, '#14B8A6')} onClick={() => {
              setState(s)
              setSlug((MARKET_TREE[country].states as any)[s]?.neighborhoods?.[0]?.slug || null)
            }}>
              {s}
            </button>
          ))}
        </div>

        {/* Two-col: map + cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.25rem', alignItems: 'start' }}>

          {/* Left: Map */}
          <div>
            <div style={{ height: 460, borderRadius: 14, overflow: 'hidden', border: `1px solid ${border}`, background: bg2 }}>
              <NeighborhoodMap
                neighborhoods={neighborhoods}
                selectedSlug={selectedSlug}
                onSelect={slug => setSlug(slug)}
                dark={dark}
              />
            </div>

            {/* Selected neighborhood detail */}
            {selectedHood && selectedBenchmark && (
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>Selected · {selectedHood.tier}</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: text, letterSpacing: '-0.03em' }}>{selectedHood.name}</div>
                  </div>
                  <Link href={`/neighborhood/${selectedHood.slug}`} style={{ background: '#5B2EFF', color: '#fff', padding: '0.5rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                    Full analysis →
                  </Link>
                </div>

                {/* Benchmark grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { l: 'Best yield',   v: `${Math.max(...Object.values(selectedBenchmark.yields)).toFixed(1)}%`, c: '#22C55E' },
                    { l: 'Cap rate',     v: `${Math.max(...Object.values(selectedBenchmark.cap_rates)).toFixed(1)}%`, c: '#14B8A6' },
                    { l: 'STR yield',    v: `${selectedBenchmark.str_yield}%`, c: '#F59E0B' },
                    { l: '3-bed median', v: fmtM(selectedBenchmark.medians[3] || 0), c: '#7C5FFF' },
                    { l: 'For sale',     v: String(selectedBenchmark.sale_count), c: text },
                    { l: 'Rentals',      v: String(selectedBenchmark.rent_count), c: text },
                    { l: 'Entry from',   v: fmtM(selectedBenchmark.price_min), c: text },
                    { l: 'Market top',   v: fmtM(selectedBenchmark.price_max), c: text },
                  ].map(m => (
                    <div key={m.l} style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                      <div style={{ fontSize: '0.56rem', color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{m.l}</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: m.c, letterSpacing: '-0.02em' }}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedHood && !selectedBenchmark && (
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginTop: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: text, marginBottom: 4 }}>Benchmarks coming for {selectedHood.name}</div>
                <div style={{ fontSize: '0.75rem', color: text2 }}>We're collecting verified data from local agencies. Check back soon or help by submitting transaction data.</div>
              </div>
            )}
          </div>

          {/* Right: Neighborhood grid */}
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 2, background: '#14B8A6' }} />
              {neighborhoods.length} neighborhoods in {state}
            </div>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {neighborhoods.map(n => (
                <NeighborhoodCard
                  key={n.slug}
                  n={{ ...n, name: n.name + (listingCounts[n.name] ? ` · ${listingCounts[n.name]}` : '') }}
                  isSelected={selectedSlug === n.slug}
                  onClick={() => setSlug(n.slug)}
                  dark={dark}
                />
              ))}
            </div>

            {/* Legend */}
            <div style={{ marginTop: '1rem', padding: '0.875rem', background: bg2, borderRadius: 10, fontSize: '0.7rem', color: text3 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#14B8A6', display: 'inline-block' }} />
                  Live data
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#64748B', display: 'inline-block' }} />
                  Coming soon
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5B2EFF', display: 'inline-block' }} />
                  Selected
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 360px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}