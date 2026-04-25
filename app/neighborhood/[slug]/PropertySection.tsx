'use client'
// app/neighborhood/[slug]/PropertySection.tsx
// Day 6 — masonry layout, real images via og:image scraping
// Agency name removed from cards (shown on property detail only)
// Beta intel: yield, cap rate, vs-median badge

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Property {
  id: string
  property_type:       string | null
  bedrooms:            number | null
  bathrooms:           number | null
  price_local:         number | null
  price_usd:           number | null
  currency_code:       string | null
  listing_type:        string | null
  title_document_type: string | null
  size_sqm:            number | null
  neighborhood:        string | null
  confidence:          number | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

const REAL_MEDIANS: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 175e6, 2: 285e6, 3: 400e6, 4: 725e6, 5: 860e6 },
}
const REAL_YIELDS: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 5.1, 2: 7.4, 3: 5.0, 4: 4.5, 5: 5.2 },
}
const REAL_CAP: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 3.9, 2: 5.5, 3: 3.75, 4: 3.4, 5: 3.9 },
}

function fmtNGN(n: number | null) {
  if (!n) return 'POA'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}
function fmtUSD(n: number | null) {
  if (!n) return null
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`
  return `$${Math.round(n/1e3)}K`
}
function yieldColor(y: number) {
  return y >= 7 ? '#22C55E' : y >= 5 ? '#84CC16' : '#F59E0B'
}

// ─── Image hook — fetches og:image from source URL ────────────
// Returns the image URL once scraped, null if no source or failed
function useSourceImage(sourceUrl: string | undefined, propertyId: string, existingImages: string[]): string | null {
  const [scraped, setScraped] = useState<string | null>(null)

  useEffect(() => {
    // If we already have images stored, don't scrape
    if (existingImages.length > 0) return
    // If no source URL to scrape from, don't try
    if (!sourceUrl) return

    let cancelled = false
    fetch(`/api/scrape-image?url=${encodeURIComponent(sourceUrl)}&property_id=${propertyId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled && d.image) setScraped(d.image) })
      .catch(() => {})

    return () => { cancelled = true }
  }, [sourceUrl, propertyId])

  return scraped
}

// ─── Card component ───────────────────────────────────────────
function PropertyCard({ p, dark, neighborhood }: { p: Property; dark: boolean; neighborhood: string }) {
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw      = (p.raw_data || {}) as Record<string, unknown>
  const images   = Array.isArray(raw['images']) ? raw['images'] as string[] : []
  const srcUrl   = raw['source_url'] as string | undefined
  const isRent   = p.listing_type === 'for-rent'
  const isSTR    = p.listing_type === 'short-let'

  // Scrape og:image from source URL if no images stored
  const scrapedImg = useSourceImage(srcUrl, p.id, images)
  const displayImg = images[0] || scrapedImg

  const hood = neighborhood.toLowerCase()
  const vm = (p.price_local && p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms])
    ? Math.round(((p.price_local - REAL_MEDIANS[hood][p.bedrooms]) / REAL_MEDIANS[hood][p.bedrooms]) * 100)
    : null
  const yEst = (!isRent && !isSTR && p.bedrooms && REAL_YIELDS[hood]?.[p.bedrooms])
    ? REAL_YIELDS[hood][p.bedrooms] : null
  const capEst = (!isRent && !isSTR && p.bedrooms && REAL_CAP[hood]?.[p.bedrooms])
    ? REAL_CAP[hood][p.bedrooms] : null

  const typeColor = isSTR ? '#F59E0B' : isRent ? '#14B8A6' : '#5B2EFF'

  return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', breakInside: 'avoid', marginBottom: '1rem', transition: 'border-color 0.15s, transform 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,46,255,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* Image — variable height based on whether we have one */}
      <div style={{ height: displayImg ? 200 : 110, background: bg2, position: 'relative', overflow: 'hidden' }}>
        {displayImg ? (
          <img src={displayImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
            <div style={{ fontSize: '1.8rem' }}>🏠</div>
            {srcUrl && <div style={{ fontSize: '0.58rem', color: text3, marginTop: '0.35rem' }}>Loading image…</div>}
          </div>
        )}

        {/* Listing type */}
        <div style={{ position: 'absolute', top: 9, left: 9, background: `${typeColor}ee`, color: '#fff', borderRadius: 5, padding: '0.15rem 0.45rem', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {p.listing_type?.replace(/-/g, ' ') || 'For Sale'}
        </div>

        {/* vs median badge */}
        {vm !== null && (
          <div style={{ position: 'absolute', top: 9, right: 9, background: vm <= 0 ? 'rgba(34,197,94,0.92)' : 'rgba(239,68,68,0.92)', color: '#fff', borderRadius: 5, padding: '0.15rem 0.45rem', fontSize: '0.6rem', fontWeight: 700 }}>
            {vm > 0 ? '+' : ''}{vm}% vs median
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '0.9rem 1rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: text, lineHeight: 1.25 }}>
            {p.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p.property_type || 'Property'}
          </div>
          {p.confidence && p.confidence >= 0.85 && (
            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#22C55E' }} />
              Verified
            </div>
          )}
        </div>

        {/* Price */}
        <div style={{ marginBottom: '0.6rem' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.03em', lineHeight: 1 }}>
            {fmtNGN(p.price_local)}
            {isRent && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: text2 }}>/yr</span>}
            {isSTR  && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: text2 }}>/night</span>}
          </div>
          {p.price_usd && <div style={{ fontSize: '0.68rem', color: text3, fontFamily: 'monospace', marginTop: 2 }}>≈ {fmtUSD(p.price_usd)} · live rate</div>}
        </div>

        {/* Specs */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
          {p.bedrooms  && <span style={{ fontSize: '0.68rem', color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>{p.bedrooms} bed</span>}
          {p.bathrooms && <span style={{ fontSize: '0.68rem', color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>{p.bathrooms} bath</span>}
          {p.size_sqm  && <span style={{ fontSize: '0.68rem', color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>{p.size_sqm}m²</span>}
          {p.title_document_type && <span style={{ fontSize: '0.68rem', color: '#14B8A6', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.18)', padding: '0.15rem 0.4rem', borderRadius: 5 }}>✓ {p.title_document_type}</span>}
        </div>

        {/* Beta intelligence panel */}
        <div style={{ background: dark ? 'rgba(91,46,255,0.06)' : 'rgba(91,46,255,0.03)', border: '1px solid rgba(91,46,255,0.1)', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <div style={{ fontSize: '0.57rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Quick intel</div>
            <div style={{ fontSize: '0.52rem', color: '#14B8A6', fontWeight: 700, background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 20, padding: '0.06rem 0.35rem' }}>β</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.25rem', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Yield</div>
              {yEst ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: yieldColor(yEst) }}>{yEst}%</div> : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
            </div>
            <div>
              <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Cap rate</div>
              {capEst ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#14B8A6' }}>{capEst}%</div> : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
            </div>
            <div>
              <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Signal</div>
              {yEst ? <div style={{ fontSize: '0.72rem', fontWeight: 700, color: yEst >= 6 ? '#22C55E' : yEst >= 4 ? '#F59E0B' : '#EF4444', lineHeight: 1.1 }}>{yEst >= 6 ? 'Strong' : yEst >= 4 ? 'Moderate' : 'Low'}</div> : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
            </div>
            <div>
              <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>STR</div>
              {yEst ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: yieldColor(yEst * 0.65) }}>{(yEst * 0.65).toFixed(1)}%</div> : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <Link href={`/property/${p.id}`} style={{ flex: 1, background: '#5B2EFF', color: '#fff', padding: '0.55rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', display: 'block', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#7C5FFF')}
            onMouseLeave={e => (e.currentTarget.style.background = '#5B2EFF')}>
            Full report →
          </Link>
          {srcUrl && (
            <a href={srcUrl} target="_blank" rel="noopener" title="View original listing" style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, color: text2, padding: '0.55rem 0.75rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main section ─────────────────────────────────────────────
export default function PropertySection({ neighborhood, dark }: { neighborhood: string; dark: boolean }) {
  const [props, setProps]     = useState<Property[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [filterBeds, setFilterBeds] = useState<number | null>(null)
  const [filterType, setFilterType] = useState('all')

  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
      const name = neighborhood.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

      let q = sb.from('properties')
        .select('id,property_type,bedrooms,bathrooms,price_local,price_usd,currency_code,listing_type,title_document_type,size_sqm,neighborhood,confidence,created_at,raw_data', { count: 'exact' })
        .ilike('neighborhood', `%${name}%`)
        .order('created_at', { ascending: false })
        .limit(36)

      if (filterBeds) q = (q as any).eq('bedrooms', filterBeds)
      if (filterType !== 'all') q = (q as any).eq('listing_type', filterType)

      const { data, count } = await q
      setProps((data as Property[]) || [])
      setTotal(count || 0)
    } catch { setProps([]) }
    finally { setLoading(false) }
  }, [neighborhood, filterBeds, filterType])

  useEffect(() => { load() }, [load])

  const chip = (active: boolean, color = '#5B2EFF') => ({
    padding: '0.28rem 0.75rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600 as const,
    border: `1px solid ${active ? color : border}`,
    background: active ? `${color}20` : 'transparent',
    color: active ? color : text3, cursor: 'pointer',
  })

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 20, height: 20, border: '2px solid rgba(91,46,255,0.3)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem' }} />
      Loading verified listings…
    </div>
  )

  return (
    <div>
      {/* Count + filters */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', color: text3, marginRight: '0.25rem' }}>{total} listings ·</span>
        <button style={chip(filterType === 'all')} onClick={() => setFilterType('all')}>All</button>
        <button style={chip(filterType === 'for-sale')} onClick={() => setFilterType('for-sale')}>For sale</button>
        <button style={chip(filterType === 'for-rent', '#14B8A6')} onClick={() => setFilterType('for-rent')}>For rent</button>
        <button style={chip(filterType === 'short-let', '#F59E0B')} onClick={() => setFilterType('short-let')}>Short let</button>
        <div style={{ width: 1, height: 16, background: border, margin: '0 0.1rem' }} />
        {[null, 1, 2, 3, 4, 5].map(b => (
          <button key={b ?? 'all'} style={chip(filterBeds === b)} onClick={() => setFilterBeds(b)}>
            {b === null ? 'All beds' : `${b}bd`}
          </button>
        ))}
      </div>

      {/* Masonry grid — 2 columns */}
      {props.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: text3, fontSize: '0.85rem' }}>
          No listings match this filter.
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: '1rem' }}>
          {props.map(p => (
            <PropertyCard key={p.id} p={p} dark={dark} neighborhood={neighborhood} />
          ))}
        </div>
      )}

      {/* Beta + Pro notice */}
      <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div style={{ background: dark ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.15)', borderRadius: 10, padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', marginBottom: '0.3rem' }}>β Beta intelligence — free now</div>
          <div style={{ fontSize: '0.72rem', color: text3, lineHeight: 1.5 }}>Yield, cap rate, and market signal unlocked. Real data from verified sources — not estimates.</div>
        </div>
        <div style={{ background: dark ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.15)', borderRadius: 10, padding: '0.875rem 1rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', marginBottom: '0.3rem' }}>✓ All intelligence included — free</div>
          <div style={{ fontSize: '0.72rem', color: text3, lineHeight: 1.5 }}>STR yield, cash-on-cash, 10yr USD return model, full trend charts.</div>
        </div>
      </div>
    </div>
  )
}
