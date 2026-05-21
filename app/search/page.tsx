'use client'
// app/search/page.tsx — Map view added
// Changes from original:
// 1. Map/List toggle button in filter bar
// 2. Map view renders ManopMap with property pins
// 3. Clicking a pin scrolls to that card in the list (split view)
// 4. Neighborhood centre coordinates for when lat/lng not on property
// Everything else identical — filters, PropCard, signals, pagination

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { getTrustBadge, mapPartnerTrustLevel } from '../../lib/agent-trust'

// Dynamic import — mapbox-gl uses window, must be client-only
const ManopMap = dynamic(() => import('../../components/ManopMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0F1E', borderRadius: 12 }}>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading map…</div>
    </div>
  ),
})

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

async function signal(type: string, meta: Record<string, unknown> = {}) {
  try {
    fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_type: type, ...meta }),
    })
  } catch { /* never block UI */ }
}

interface Property {
  id:            string
  neighborhood:  string | null
  city:          string | null
  property_type: string | null
  listing_type:  string | null
  bedrooms:      number | null
  bathrooms:     number | null
  price_local:   number | null
  price_usd:     number | null
  currency_code: string | null
  confidence:    number | null
  lat:           number | null
  lng:           number | null
  created_at:    string | null
  raw_data:      Record<string, unknown> | null
}

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Lekki','Ikoyi','Victoria Island',
  'Eko Atlantic','Banana Island','Ikota','Chevron','Ajah','Sangotedo',
  'Osapa London','Gbagada','Yaba','Ikeja','Ikeja GRA','Surulere','Magodo',
  'Maitama','Asokoro','Wuse 2','East Legon','Cantonments','Westlands','Karen','Kilimani',
]

const REAL_MEDIANS: Record<string, Record<number, number>> = {
  'lekki phase 1': { 1: 175e6, 2: 285e6, 3: 400e6, 4: 725e6, 5: 860e6 },
}
const REAL_YIELDS: Record<string, Record<number, number>> = {
  'lekki phase 1': { 1: 5.1, 2: 7.4, 3: 5.0, 4: 4.5, 5: 5.2 },
}

// Neighbourhood centre coordinates — fallback when property has no lat/lng
const HOOD_CENTRES: Record<string, [number, number]> = {
  'lekki phase 1':   [3.4783,  6.4387],
  'lekki phase 2':   [3.5133,  6.4348],
  'lekki':           [3.4900,  6.4400],
  'ikoyi':           [3.4253,  6.4474],
  'victoria island': [3.4163,  6.4281],
  'eko atlantic':    [3.3900,  6.4150],
  'banana island':   [3.4330,  6.4600],
  'ajah':            [3.5725,  6.4667],
  'chevron':         [3.5300,  6.4350],
  'ikota':           [3.5500,  6.4400],
  'sangotedo':       [3.6000,  6.4500],
  'osapa london':    [3.5200,  6.4250],
  'gbagada':         [3.3917,  6.5500],
  'yaba':            [3.3700,  6.5100],
  'ikeja':           [3.3400,  6.6000],
  'ikeja gra':       [3.3500,  6.6100],
  'surulere':        [3.3600,  6.4900],
  'magodo':          [3.3800,  6.6200],
  'maitama':         [7.5130,  9.0740],
  'asokoro':         [7.5300,  9.0600],
  'wuse 2':          [7.4900,  9.0700],
  'east legon':      [-0.1551, 5.6408],
  'cantonments':     [-0.1880, 5.5700],
  'westlands':       [36.8084, -1.2697],
  'karen':           [36.7172, -1.3389],
  'kilimani':        [36.7900, -1.2900],
}

// Default map centre — Lagos
const DEFAULT_CENTRE: [number, number] = [3.3792, 6.5244]

function getCoords(p: Property): [number, number] | null {
  if (p.lat && p.lng) return [p.lng, p.lat]
  const hood = (p.neighborhood || '').toLowerCase().trim()
  return HOOD_CENTRES[hood] || null
}

function getMapCentre(neighborhood: string): [number, number] {
  const hood = neighborhood.toLowerCase().trim()
  return HOOD_CENTRES[hood] || DEFAULT_CENTRE
}

function isValidPropertyImage(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.includes('watermark')) return false
  if (lower.includes('placeholder')) return false
  if (lower.includes('no-image') || lower.includes('noimage')) return false
  if (lower.includes('default') || lower.includes('logo')) return false
  if (lower.includes('propertypro.ng/images/no')) return false
  if (lower.includes('propertypro.ng/assets/img/default')) return false
  if (lower.match(/\d+x\d+/) && !lower.match(/[4-9]\d{2}x[4-9]\d{2}/)) return false
  return true
}

function getDisplayImage(rawData: Record<string, unknown> | null): string | null {
  if (!rawData) return null
  const images = Array.isArray(rawData['images']) ? rawData['images'] as string[] : []
  return images.filter(img => isValidPropertyImage(img))[0] || null
}

function fmt(n: number | null, currency = 'NGN') {
  if (!n) return 'POA'
  const s = currency === 'USD' ? '$' : '₦'
  if (n >= 1e9) return `${s}${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `${s}${(n/1e6).toFixed(0)}M`
  return `${s}${Math.round(n/1e3)}K`
}
function fmtUSD(n: number | null) {
  if (!n) return null
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  return `$${Math.round(n/1e3)}K`
}
function fmtPinPrice(n: number | null): string {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}

// ─── Property card (unchanged from original) ──────────────────
function PropCard({ p, dark, highlighted }: { p: Property; dark: boolean; highlighted?: boolean }) {
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw        = (p.raw_data || {}) as Record<string, unknown>
  const displayImg = getDisplayImage(p.raw_data)
  const sourceUrl  = raw['source_url'] as string | undefined
  const agency     = raw['source_agency'] as string | undefined
  const trustLevel = mapPartnerTrustLevel(raw['trust_level'] as string | null)
  const trustBadge = getTrustBadge(trustLevel)
  const isRent     = p.listing_type === 'for-rent'
  const isSTR      = p.listing_type === 'short-let'
  const hood       = (p.neighborhood || '').toLowerCase()
  const vm = (p.price_local && p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms])
    ? Math.round(((p.price_local - REAL_MEDIANS[hood][p.bedrooms]) / REAL_MEDIANS[hood][p.bedrooms]) * 100)
    : null
  const yEst = (!isRent && !isSTR && p.bedrooms && REAL_YIELDS[hood]?.[p.bedrooms])
    ? REAL_YIELDS[hood][p.bedrooms] : null
  const typeColor = isSTR ? '#F59E0B' : isRent ? '#14B8A6' : '#5B2EFF'

  return (
    <div
      id={`card-${p.id}`}
      style={{
        background: bg3,
        border: `1px solid ${highlighted ? 'rgba(91,46,255,0.6)' : border}`,
        borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
        transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
        boxShadow: highlighted ? '0 0 0 3px rgba(91,46,255,0.15)' : 'none',
        marginBottom: '1rem', breakInside: 'avoid',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,46,255,0.38)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = highlighted ? 'rgba(91,46,255,0.6)' : border; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      <div style={{ height: displayImg ? 190 : 80, background: bg2, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {displayImg ? (
          <img src={displayImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { const p = (e.target as HTMLImageElement).parentElement; if (p) { p.style.height = '80px'; (e.target as HTMLImageElement).style.display = 'none' } }}/>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: 0.25 }}>
            <div style={{ fontSize: '1.4rem' }}>🏠</div>
            <div style={{ fontSize: '0.62rem', color: text3 }}>No photo</div>
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, background: `${typeColor}ee`, color: '#fff', borderRadius: 5, padding: '0.12rem 0.4rem', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {p.listing_type?.replace(/-/g, ' ') || 'For Sale'}
        </div>
        {vm !== null && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: vm <= 0 ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)', color: '#fff', borderRadius: 5, padding: '0.12rem 0.4rem', fontSize: '0.6rem', fontWeight: 700 }}>
            {vm > 0 ? '+' : ''}{vm}% vs median
          </div>
        )}
      </div>

      <div style={{ padding: '0.9rem 1rem 1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {agency && (
          <div style={{ fontSize: '0.62rem', color: text3, marginBottom: '0.3rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.5rem', fontWeight: 700, color: trustBadge.color, background: trustBadge.bg, border: `1px solid ${trustBadge.border}`, borderRadius: 3, padding: '0.1rem 0.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
              {trustBadge.icon} {trustBadge.label}
            </span>
            {agency}
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: text, marginBottom: '0.2rem', lineHeight: 1.25 }}>
          {p.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p.property_type || 'Property'}
        </div>
        <div style={{ fontSize: '0.7rem', color: text2, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          📍 {p.neighborhood}{p.city ? `, ${p.city}` : ''}
        </div>
        <div style={{ marginBottom: '0.65rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {fmt(p.price_local, p.currency_code || 'NGN')}
            {isRent && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: text2 }}>/yr</span>}
            {isSTR  && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: text2 }}>/night</span>}
          </div>
          {p.price_usd && <div style={{ fontSize: '0.68rem', color: text3, fontFamily: 'monospace', marginTop: 2 }}>≈ {fmtUSD(p.price_usd)} · live rate</div>}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
          {p.bedrooms  && <span style={{ fontSize: '0.68rem', color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>{p.bedrooms} bed</span>}
          {p.bathrooms && <span style={{ fontSize: '0.68rem', color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>{p.bathrooms} bath</span>}
          {yEst        && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: yEst >= 6 ? '#22C55E' : yEst >= 4 ? '#F59E0B' : '#EF4444' }}>{yEst}% yield est.</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', marginTop: 'auto' }}>
          <Link
            href={`/property/${p.id}`}
            onClick={() => signal('property_view', { property_id: p.id, neighborhood: p.neighborhood || '', city: p.city || '' })}
            style={{ flex: 1, background: '#5B2EFF', color: '#fff', padding: '0.55rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', display: 'block', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#7C5FFF')}
            onMouseLeave={e => (e.currentTarget.style.background = '#5B2EFF')}>
            View details →
          </Link>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => signal('contact_click', { property_id: p.id, neighborhood: p.neighborhood || '' })}
              style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, color: text3, padding: '0.55rem 0.75rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function SearchPage() {
  const [dark, setDark]             = useState(true)
  const [activeType, setActiveType] = useState('all')
  const [neighborhood, setNeigh]    = useState('')
  const [bedrooms, setBedrooms]     = useState('any')
  const [minPrice, setMinPrice]     = useState('')
  const [maxPrice, setMaxPrice]     = useState('')
  const [results, setResults]       = useState<Property[]>([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(false)
  const [viewMode, setViewMode]     = useState<'list' | 'map'>('list')
  const [highlighted, setHighlighted] = useState<string | null>(null)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const run = useCallback(async () => {
    setLoading(true)
    try {
      let q = sb.from('properties')
        .select('id,neighborhood,city,property_type,listing_type,bedrooms,bathrooms,price_local,price_usd,currency_code,confidence,lat,lng,created_at,raw_data', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(60)

      if (activeType !== 'all') q = q.eq('listing_type', activeType)
      if (neighborhood) {
        q = q.ilike('neighborhood', `%${neighborhood}%`)
        signal('search_location', { neighborhood, listing_type: activeType })
      }
      if (bedrooms !== 'any') q = q.eq('bedrooms', parseInt(bedrooms))
      if (minPrice) {
        const mn = parseFloat(minPrice.replace(/[₦,Mm]/g, ''))
        if (!isNaN(mn)) q = q.gte('price_local', mn < 10_000 ? mn * 1e6 : mn)
      }
      if (maxPrice) {
        const mx = parseFloat(maxPrice.replace(/[₦,Mm]/g, ''))
        if (!isNaN(mx)) q = q.lte('price_local', mx < 10_000 ? mx * 1e6 : mx)
      }

      const { data, count } = await q
      setResults((data as Property[]) || [])
      setTotal(count || 0)
    } catch { setResults([]) }
    finally { setLoading(false) }
  }, [activeType, neighborhood, bedrooms, minPrice, maxPrice])

  useEffect(() => { run() }, [run])

  // Build map pins from results
  const mapPins = results
    .map(p => {
      const coords = getCoords(p)
      if (!coords) return null
      const raw = (p.raw_data || {}) as Record<string, unknown>
      const intel = raw['intel'] as Record<string, unknown> | undefined
      const verdict = intel?.['verdict'] as string | null
      return {
        id:      p.id,
        lng:     coords[0],
        lat:     coords[1],
        price:   fmtPinPrice(p.price_local),
        yield:   undefined,
        verdict: (verdict as 'buy' | 'negotiate' | 'watch' | 'wait' | null) || null,
        badge:   null,
        beds:    p.bedrooms || undefined,
        neighborhood: p.neighborhood || undefined,
        propertyType: p.property_type || undefined,
        onClick: (id: string) => {
          setViewMode('list')
          setHighlighted(id)
          setTimeout(() => {
            document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setTimeout(() => setHighlighted(null), 2500)
          }, 100)
        },
      }
    })
    .filter(Boolean) as any[]

  // Map centre — follow the selected neighborhood filter
  const mapCentre = neighborhood ? getMapCentre(neighborhood) : DEFAULT_CENTRE
  const mapZoom   = neighborhood ? 14 : 12

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const inp = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8,
    color: text, fontSize: '0.82rem', outline: 'none',
    padding: '0.55rem 0.875rem', width: '100%', fontFamily: 'inherit',
  }

  const typeTab = (val: string, label: string, color: string) => (
    <button
      onClick={() => setActiveType(val)}
      style={{ padding: '0.45rem 1.1rem', borderRadius: 20, border: `1px solid ${activeType === val ? color : border}`, background: activeType === val ? `${color}20` : 'transparent', color: activeType === val ? color : text3, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit' }}>
      {label}
    </button>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Filter bar */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '1.25rem 2rem', position: 'sticky', top: 64, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Type tabs + view toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: '0.25rem' }}>Showing</span>
              {typeTab('all',       'Everything', '#5B2EFF')}
              {typeTab('for-sale',  'For sale',   '#5B2EFF')}
              {typeTab('for-rent',  'For rent',   '#14B8A6')}
              {typeTab('short-let', 'Short let',  '#F59E0B')}
              {typeTab('off-plan',  'Off plan',   '#84CC16')}
            </div>

            {/* Map / List toggle */}
            <div style={{ display: 'flex', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 9, padding: 3, gap: 2, flexShrink: 0 }}>
              {(['list', 'map'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  style={{
                    padding: '0.38rem 0.875rem',
                    borderRadius: 7,
                    border: 'none',
                    background: viewMode === m ? (dark ? '#1E293B' : '#FFFFFF') : 'transparent',
                    color: viewMode === m ? text : text3,
                    fontSize: '0.78rem', fontWeight: viewMode === m ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'list' ? (
                    <><span style={{ fontSize: 12 }}>☰</span> List</>
                  ) : (
                    <><span style={{ fontSize: 12 }}>◉</span> Map</>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.6rem' }}>
            <select style={{ ...inp, cursor: 'pointer' }} value={neighborhood} onChange={e => setNeigh(e.target.value)}>
              <option value="">All neighborhoods</option>
              {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select style={{ ...inp, cursor: 'pointer' }} value={bedrooms} onChange={e => setBedrooms(e.target.value)}>
              <option value="any">Any bedrooms</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} bed</option>)}
            </select>
            <input style={inp} placeholder="Min price (e.g. 100M)" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
            <input style={inp} placeholder="Max price (e.g. 500M)" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
            <button
              onClick={() => { setActiveType('all'); setNeigh(''); setBedrooms('any'); setMinPrice(''); setMaxPrice('') }}
              style={{ background: 'transparent', border: `1px solid ${border}`, color: text3, borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Clear
            </button>
          </div>

          <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: text3 }}>
            {loading ? 'Searching…' : `${total} properties${neighborhood ? ` in ${neighborhood}` : ''}`}
            {viewMode === 'map' && mapPins.length < results.length && (
              <span style={{ marginLeft: 8, color: 'rgba(245,158,11,0.7)' }}>
                · {results.length - mapPins.length} without location (shown in list)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '5rem', color: text3 }}>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 24, height: 24, border: '2px solid rgba(91,46,255,0.3)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
            Loading listings…
          </div>
        ) : results.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '5rem', background: bg3, borderRadius: 14, border: `1px solid ${border}` }}>
            <div style={{ fontSize: '2rem', opacity: 0.3, marginBottom: '1rem' }}>🔍</div>
            <div style={{ fontWeight: 700, color: text, marginBottom: '0.5rem' }}>No results</div>
            <div style={{ fontSize: '0.82rem', color: text2 }}>Try a different filter or clear all.</div>
          </div>
        ) : viewMode === 'map' ? (

          /* ── MAP VIEW ── */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1rem', height: 'calc(100vh - 220px)', minHeight: 500 }}>

            {/* Map — left side */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${border}`, height: '100%' }}>
              <ManopMap
                center={mapCentre}
                zoom={mapZoom}
                pins={mapPins}
                height={600}
                mapStyle="satellite-streets"
                showControls
              />
            </div>

            {/* Scrollable list — right side */}
            <div style={{ overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ fontSize: '0.65rem', color: text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                {results.length} properties
              </div>
              {results.map(p => (
                <div key={p.id} style={{ marginBottom: 10 }}>
                  <PropCard p={p} dark={dark} highlighted={highlighted === p.id} />
                </div>
              ))}
            </div>
          </div>

        ) : (

          /* ── LIST VIEW ── */
          <div style={{ columns: 3, columnGap: '1rem' }}>
            {results.map(p => <PropCard key={p.id} p={p} dark={dark} highlighted={highlighted === p.id} />)}
          </div>
        )}

        {/* Agency CTA */}
        {viewMode === 'list' && (
          <div style={{ marginTop: '2rem', background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.15)', borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700, color: text, fontSize: '0.9rem', marginBottom: '0.25rem' }}>Agency in Lagos, Abuja, Accra or Nairobi?</div>
              <div style={{ fontSize: '0.78rem', color: text2 }}>List free. Buyers see real-time yield intelligence on every property.</div>
            </div>
            <Link href="/agency/onboard" style={{ background: '#5B2EFF', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Become a partner →
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}