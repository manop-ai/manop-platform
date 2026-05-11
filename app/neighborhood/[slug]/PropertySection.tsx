'use client'
// app/neighborhood/[slug]/PropertySection.tsx — FIXED
// FIX 1: Rental cards no longer show "Yield —" — they show rent context instead
// FIX 2: STR cards show actual STR yield computed from nightly rate
// FIX 3: USD formatting shows $114 not $0K for small amounts
// FIX 4: Blank neighborhood shows fallback label

import { useState } from 'react'
import Link from 'next/link'
import { getTrustBadge, mapPartnerTrustLevel } from '../../../lib/agent-trust'

interface Property {
  id:                  string
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
  city:                string | null
  source_type:         string | null
  confidence:          number | null
  agent_phone:         string | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

// ─── Verified benchmarks (source of truth for Lekki Ph 1) ────
const REAL_MEDIANS: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 175_000_000, 2: 285_000_000, 3: 400_000_000, 4: 725_000_000, 5: 860_000_000 },
}
const REAL_YIELDS: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 5.1, 2: 7.4, 3: 5.0, 4: 4.5, 5: 5.2 },
}
const REAL_CAP: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 3.9, 2: 5.5, 3: 3.75, 4: 3.4, 5: 3.9 },
}
const REAL_STR: Record<string, number> = {
  'lekki-phase-1': 9.0,
}
// Rent medians (annual NGN) — for rental yield context
const REAL_RENT_MEDIANS: Record<string, Record<number, number>> = {
  'lekki-phase-1': { 1: 9_000_000, 2: 21_000_000, 3: 20_000_000, 4: 32_500_000, 5: 45_000_000 },
}
// STR nightly rates
const REAL_STR_NIGHTLY: Record<string, number> = {
  'lekki-phase-1': 180_000,
}

function yieldColor(y: number) {
  if (y >= 7)  return '#22C55E'
  if (y >= 5)  return '#F59E0B'
  return '#EF4444'
}

// ─── FIXED: fmtUSD handles small amounts correctly ───────────
function fmtUSD(n: number | null): string | null {
  if (!n || n <= 0) return null
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`  // ← was showing $0K, now shows $114
}

function fmtNGN(n: number): string {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `₦${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)         return `₦${Math.round(n / 1_000)}K`
  return `₦${Math.round(n)}`
}

// ─── Image validation: reject Avif and watermarks ────────────
function isValidImage(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  const bad = ['watermark','placeholder','no-image','noimage','default',
    '/logo','icon','banner','cwrealestate.com.ng/assets',
    'propertypro.ng/images/no','propertypro.ng/assets/img/default']
  if (bad.some(b => lower.includes(b))) return false
  if (lower.endsWith('.avif') || lower.includes('.avif?')) return false
  return true
}

function PropCard({ p, dark, slug }: { p: Property; dark: boolean; slug: string }) {
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw       = (p.raw_data || {}) as Record<string, unknown>
  const images    = Array.isArray(raw['images']) ? raw['images'] as string[] : []
  const validImgs = images.filter(isValidImage)
  const coverImg  = validImgs[0] || null
  const srcAgency = raw['source_agency'] as string | undefined
  const trustLevel = mapPartnerTrustLevel(raw['trust_level'] as string | null)
  const trustBadge = getTrustBadge(trustLevel)

  const hood    = slug
  const isRent  = p.listing_type === 'for-rent'
  const isSTR   = p.listing_type === 'short-let'
  const isSale  = !isRent && !isSTR

  // vs median (only meaningful for sale listings)
  const vm = (isSale && p.price_local && p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms])
    ? Math.round(((p.price_local - REAL_MEDIANS[hood][p.bedrooms]) / REAL_MEDIANS[hood][p.bedrooms]) * 100)
    : null

  // Yield — only for SALE listings
  const yEst   = (isSale && p.bedrooms && REAL_YIELDS[hood]?.[p.bedrooms])
    ? REAL_YIELDS[hood][p.bedrooms] : null
  const capEst = (isSale && p.bedrooms && REAL_CAP[hood]?.[p.bedrooms])
    ? REAL_CAP[hood][p.bedrooms] : null
  const strEst = REAL_STR[hood] || null

  // For RENTAL listings: show rent yield context instead
  // "This rent represents X% yield on the ₦Ym median sale price"
  const rentYieldContext = (isRent && p.price_local && p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms])
    ? ((p.price_local / REAL_MEDIANS[hood][p.bedrooms]) * 100).toFixed(1)
    : null

  // For STR: compute actual STR yield from nightly rate
  const strNightly    = REAL_STR_NIGHTLY[hood]
  const strAnnual     = strNightly ? strNightly * 365 * 0.55 : 0
  const strSaleMedian = (p.bedrooms && REAL_MEDIANS[hood]?.[p.bedrooms]) || 0
  const strYieldCalc  = (isSTR && strAnnual > 0 && strSaleMedian > 0)
    ? ((strAnnual / strSaleMedian) * 100).toFixed(1) : null

  const typeColor = isSTR ? '#F59E0B' : isRent ? '#14B8A6' : '#5B2EFF'
  const usdStr    = fmtUSD(p.price_usd)
  const neighborhood = p.neighborhood || p.city || 'Lagos'

  // Signal label
  const signal = yEst
    ? (yEst >= 6 ? 'Strong' : yEst >= 4 ? 'OK' : 'Low')
    : isRent ? 'Rental'
    : isSTR  ? 'STR'
    : null

  return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, overflow: 'hidden', breakInside: 'avoid', marginBottom: '0.75rem' }}>

      {/* Image */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: bg2, overflow: 'hidden' }}>
        {coverImg ? (
          <img src={coverImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', opacity: 0.25 }}>
            <div style={{ fontSize: '2rem' }}>🏠</div>
            <div style={{ fontSize: '0.6rem', marginTop: 4 }}>No photo</div>
          </div>
        )}

        {/* Listing type badge */}
        <div style={{ position: 'absolute', top: 8, left: 8, background: typeColor, color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {p.listing_type?.replace(/-/g, ' ') || 'For Sale'}
        </div>

        {/* vs median badge (sale only) */}
        {vm !== null && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', color: vm > 10 ? '#F87171' : vm < -5 ? '#4ADE80' : '#FCD34D', fontSize: '0.58rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 12, backdropFilter: 'blur(4px)' }}>
            {vm > 0 ? '+' : ''}{vm}% vs median
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '0.875rem 0.875rem 0.5rem' }}>
        {srcAgency && (
          <div style={{ fontSize: '0.6rem', color: text3, marginBottom: 3, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{
              fontSize: '0.5rem', fontWeight: 700, color: trustBadge.color,
              background: trustBadge.bg, border: `1px solid ${trustBadge.border}`,
              borderRadius: 3, padding: '0.1rem 0.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.15rem'
            }}>
              {trustBadge.icon} {trustBadge.label}
            </span>
            Listed by {srcAgency}
          </div>
        )}

        {/* Property name */}
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: text, marginBottom: 2, lineHeight: 1.3 }}>
          {p.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p.property_type || 'Property'}
        </div>

        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: '0.5rem' }}>
          📍 {neighborhood}{p.city && p.neighborhood ? `, ${p.city}` : ''}
        </div>

        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' as const, marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.02em' }}>
            {fmtNGN(p.price_local || 0)}
            {isSTR && <span style={{ fontSize: '0.6rem', fontWeight: 400, color: text2 }}>/night</span>}
            {isRent && <span style={{ fontSize: '0.6rem', fontWeight: 400, color: text2 }}>/yr</span>}
          </span>
          {usdStr && (
            <span style={{ fontSize: '0.65rem', color: text3 }}>≈ {usdStr} · live rate</span>
          )}
        </div>

        {/* Beds / baths */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.6rem', fontSize: '0.72rem', color: text2 }}>
          {p.bedrooms  && <span>{p.bedrooms} bed</span>}
          {p.bathrooms && <span>{p.bathrooms} bath</span>}
        </div>

        {/* ── Intelligence grid ─────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${border}`, paddingTop: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
            Intelligence
          </div>

          {/* SALE properties: show yield, cap rate, STR, signal */}
          {isSale && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Yield</div>
                {yEst
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: yieldColor(yEst) }}>{yEst}%</div>
                  : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Cap rate</div>
                {capEst
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#14B8A6' }}>{capEst}%</div>
                  : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>STR yield</div>
                {strEst
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#F59E0B' }}>{strEst}%</div>
                  : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Signal</div>
                {yEst ? (
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: yEst >= 6 ? '#22C55E' : yEst >= 4 ? '#F59E0B' : '#EF4444', lineHeight: 1.1 }}>
                    {yEst >= 6 ? 'Strong' : yEst >= 4 ? 'OK' : 'Low'}
                  </div>
                ) : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
            </div>
          )}

          {/* RENTAL properties: show what yield this rent implies on median sale price */}
          {isRent && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Rent yield (on median)</div>
                {rentYieldContext
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: yieldColor(parseFloat(rentYieldContext)) }}>{rentYieldContext}%</div>
                  : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>STR alt. yield</div>
                {strEst
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#F59E0B' }}>{strEst}%</div>
                  : <div style={{ fontSize: '0.7rem', color: text3 }}>—</div>}
              </div>
            </div>
          )}

          {/* SHORT-LET properties: show STR yield calculation */}
          {isSTR && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>STR yield (55% occ)</div>
                {strYieldCalc
                  ? <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#F59E0B' }}>{strYieldCalc}%</div>
                  : <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#F59E0B' }}>{strEst}%</div>}
              </div>
              <div>
                <div style={{ fontSize: '0.54rem', color: text3, marginBottom: 2 }}>Occupancy target</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: text2 }}>55%</div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.4rem', paddingTop: '0.4rem' }}>
          <Link href={`/property/${p.id}`} style={{ flex: 1, background: '#5B2EFF', color: '#fff', padding: '0.45rem 0.6rem', borderRadius: 7, textDecoration: 'none', fontSize: '0.68rem', fontWeight: 600, textAlign: 'center' as const }}>
            Full report →
          </Link>
          {(raw['source_url'] as string) && (
            <a href={raw['source_url'] as string} target="_blank" rel="noopener" style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: text3, padding: '0.45rem 0.6rem', borderRadius: 7, fontSize: '0.68rem', fontWeight: 600, textDecoration: 'none', border: `1px solid ${border}` }}>
              ↗
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PropertySection({ properties, dark, slug }: {
  properties: Property[]
  dark:       boolean
  slug:       string
}) {
  const [filter, setFilter] = useState<'all' | 'for-sale' | 'for-rent' | 'short-let'>('all')
  const [beds,   setBeds]   = useState<number | null>(null)

  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const filtered = properties.filter(p => {
    if (filter !== 'all' && p.listing_type !== filter) return false
    if (beds !== null && p.bedrooms !== beds) return false
    return true
  })

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.3rem 0.875rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${active ? '#5B2EFF' : border}`,
    background: active ? 'rgba(91,46,255,0.1)' : 'transparent',
    color: active ? '#7C5FFF' : text3,
  })

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: '0.62rem', color: text3, alignSelf: 'center', marginRight: 4 }}>
            {filtered.length} listings ·
          </span>
          {(['all', 'for-sale', 'for-rent', 'short-let'] as const).map(f => (
            <button key={f} style={btnStyle(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f.replace(/-/g, ' ')}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const }}>
          {[null, 1, 2, 3, 4, 5].map(b => (
            <button key={String(b)} style={btnStyle(beds === b)} onClick={() => setBeds(b)}>
              {b === null ? 'All beds' : `${b}bd`}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: text3, fontSize: '0.85rem' }}>
          No listings match this filter.
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: '0.75rem' }}>
          {filtered.map(p => <PropCard key={p.id} p={p} dark={dark} slug={slug} />)}
        </div>
      )}
    </div>
  )
}