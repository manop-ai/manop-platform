'use client'
// app/property/[id]/PropertyDetailClient.tsx
// Full property detail — client component
// Receives property + live FX rate as props from server

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { formatNGN, formatUSD, calcDepreciation } from '../../../lib/fx'

// Lazy-load the chart (heavy — has sliders, SVG, useMemo)
const PriceTrendChart = dynamic(() => import('../../../components/PriceTrendChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, fontSize: '0.8rem' }}>
      Loading chart…
    </div>
  ),
})

// ─── Types ────────────────────────────────────────────────────
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
  country_code:        string | null
  source_type:         string | null
  confidence:          number | null
  agent_phone:         string | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

interface Props {
  property:      Property
  liveNGNRate:   number
  rateSource:    string
  rateFetchedAt: string
}

// ─── Helpers ──────────────────────────────────────────────────
function IntelRow({ label, value, sub, color, border }: {
  label: string; value: string; sub?: string; color?: string; border: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.75rem 0', borderBottom: `1px solid ${border}` }}>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.67rem', color: 'var(--color-text-tertiary)', marginTop: '0.15rem' }}>{sub}</div>}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: color || 'var(--color-text-primary)', flexShrink: 0, marginLeft: '1rem', textAlign: 'right' }}>
        {value}
      </div>
    </div>
  )
}

function LockedRow({ label, border }: { label: string; border: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: `1px solid ${border}` }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 5, padding: '0.15rem 0.55rem' }}>
        Pro
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────
export default function PropertyDetailClient({ property: p, liveNGNRate, rateSource, rateFetchedAt }: Props) {
  const [dark, setDark]   = useState(true)
  const [imgIdx, setImgIdx] = useState(0)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const bg    = dark ? '#0F172A' : '#F8FAFC'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw          = (p.raw_data || {}) as Record<string, unknown>
  const images       = Array.isArray(raw['images']) ? raw['images'] as string[] : []
  const sourceUrl    = raw['source_url'] as string | undefined
  const sourceAgency = raw['source_agency'] as string | undefined
  const subLocation  = raw['sub_location'] as string | undefined
  const intel        = raw['intel'] as Record<string, unknown> | undefined
  const isRent       = p.listing_type === 'for-rent' || p.listing_type === 'short-let'
  const location     = [p.neighborhood, p.city].filter(Boolean).join(', ')

  // Traditional yield — from stored intel or estimated
  const tYield = intel?.traditional_yield_pct
    ? `${intel.traditional_yield_pct}%`
    : p.price_local
    ? `~${((6_000_000 / p.price_local) * 100).toFixed(1)}%`
    : null

  const depn = calcDepreciation(2015, 2024)

  const panel: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`,
    borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1rem',
  }

  const sLabel: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6',
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.35rem',
  }

  const formatRate = (t: string) => {
    try { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return t }
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Back */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 2rem 0' }}>
        <Link href="/search" style={{ fontSize: '0.8rem', color: text3, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          ← All properties
        </Link>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 2rem 4rem', display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>

        {/* ── LEFT ─────────────────────────────────────────── */}
        <div>

          {/* Image gallery */}
          <div style={{ borderRadius: 14, overflow: 'hidden', background: bg2, marginBottom: '1.5rem', position: 'relative' }}>
            {images.length > 0 ? (
              <>
                <img
                  src={images[imgIdx]}
                  alt={`${p.bedrooms || ''}bed property in ${p.neighborhood}`}
                  style={{ width: '100%', height: 400, objectFit: 'cover', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer', fontSize: '1.1rem' }}>‹</button>
                    <button onClick={() => setImgIdx(i => (i + 1) % images.length)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer', fontSize: '1.1rem' }}>›</button>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 5, padding: '0.15rem 0.5rem', fontSize: '0.68rem' }}>
                      {imgIdx + 1}/{images.length}
                    </div>
                  </>
                )}
                {images.length > 1 && (
                  <div style={{ display: 'flex', gap: '0.4rem', padding: '0.6rem', background: bg2, overflowX: 'auto' }}>
                    {images.map((img, i) => (
                      <img key={i} src={img} onClick={() => setImgIdx(i)} alt="" style={{ width: 68, height: 50, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0, opacity: imgIdx === i ? 1 : 0.45, border: `2px solid ${imgIdx === i ? '#5B2EFF' : 'transparent'}`, transition: 'opacity 0.15s, border-color 0.15s' }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: 0.3 }}>
                <div style={{ fontSize: '3rem' }}>🏠</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>No images available</div>
              </div>
            )}
          </div>

          {/* Title block */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: isRent ? 'rgba(20,184,166,0.1)' : 'rgba(91,46,255,0.1)', color: isRent ? '#14B8A6' : '#7C5FFF', border: `1px solid ${isRent ? 'rgba(20,184,166,0.3)' : 'rgba(91,46,255,0.3)'}`, borderRadius: 20, padding: '0.2rem 0.7rem' }}>
                {p.listing_type?.replace(/-/g, ' ') || 'For Sale'}
              </span>
              {sourceAgency && (
                <span style={{ fontSize: '0.7rem', fontWeight: 600, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: text3, border: `1px solid ${border}`, borderRadius: 20, padding: '0.2rem 0.7rem' }}>
                  {sourceAgency}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(1.4rem,3.5vw,2rem)', fontWeight: 800, letterSpacing: '-0.03em', color: text, lineHeight: 1.15, marginBottom: '0.6rem' }}>
              {p.bedrooms ? `${p.bedrooms}-Bedroom ` : ''}{p.property_type || 'Property'}
              {p.neighborhood ? ` — ${p.neighborhood}` : ''}
            </h1>

            {/* Dual currency price */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.04em' }}>
                {formatNGN(p.price_local || 0)}
                {isRent && <span style={{ fontSize: '0.9rem', fontWeight: 400, color: text2 }}>/month</span>}
              </div>
              {p.price_usd && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '1rem', color: text3, fontFamily: 'monospace' }}>
                    ≈ {formatUSD(p.price_usd)}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: text3, lineHeight: 1 }}>
                    ₦{Math.round(liveNGNRate).toLocaleString()}/$1 · {rateSource} · {formatRate(rateFetchedAt)}
                  </div>
                </div>
              )}
            </div>

            {location && (
              <div style={{ fontSize: '0.82rem', color: text2, marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                📍 {location}{subLocation ? ` · ${subLocation}` : ''}
              </div>
            )}
          </div>

          {/* Specs */}
          <div style={panel}>
            <div style={sLabel}>Property details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem', marginTop: '0.5rem' }}>
              {[
                ['Type',      p.property_type],
                ['Bedrooms',  p.bedrooms],
                ['Bathrooms', p.bathrooms],
                ['Size',      p.size_sqm ? `${p.size_sqm}m²` : null],
                ['Title',     p.title_document_type],
                ['Listing',   p.listing_type?.replace(/-/g, ' ')],
              ].filter(r => r[1] != null && r[1] !== '').map(([l, v]) => (
                <div key={String(l)} style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderRadius: 7, padding: '0.6rem 0.8rem' }}>
                  <div style={{ fontSize: '0.58rem', color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{String(l)}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: text }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── THE CHART ── */}
          {p.price_local && p.price_usd && (
            <PriceTrendChart
              priceNGN={p.price_local}
              priceUSD={p.price_usd}
              liveNGNRate={liveNGNRate}
              dark={dark}
              neighborhood={p.neighborhood || undefined}
            />
          )}

          {/* Source link */}
          {sourceUrl && (
            <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={sLabel}>Original listing</div>
                <div style={{ fontSize: '0.8rem', color: text2 }}>View on {sourceAgency || 'partner platform'}</div>
              </div>
              <a href={sourceUrl} target="_blank" rel="noopener" style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', border: `1px solid ${border}`, color: text, padding: '0.5rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                View ↗
              </a>
            </div>
          )}
        </div>

        {/* ── RIGHT ────────────────────────────────────────── */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>

          {/* Free intel */}
          <div style={{ ...panel, background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.03)', border: '1px solid rgba(91,46,255,0.14)' }}>
            <div style={sLabel}>Intelligence · free</div>
            {tYield && <IntelRow label="Traditional rental yield" value={tYield} sub="Est. annual rent ÷ price" color="#22C55E" border={border} />}
            <IntelRow label="USD price" value={p.price_usd ? formatUSD(p.price_usd) : 'N/A'} sub={`₦${Math.round(liveNGNRate).toLocaleString()}/$1 live`} color="#7C5FFF" border={border} />
            <IntelRow label="NGN depreciation since 2015" value={`−${depn.usdLossPct}%`} sub="CBN official data · ₦192 → ₦1,480/$1" color="#EF4444" border="none" />
          </div>

          {/* Pro intel (locked) */}
          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <div style={sLabel}>Intelligence · pro</div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)', borderRadius: 4, padding: '0.12rem 0.45rem' }}>Upgrade</div>
            </div>
            <LockedRow label="Short-let / Airbnb yield" border={border} />
            <LockedRow label="Cap rate" border={border} />
            <LockedRow label="Cash-on-cash return" border={border} />
            <LockedRow label="Net operating income" border={border} />
            <LockedRow label="Price vs market median" border={border} />
            <LockedRow label="Demand score + days on market" border="none" />
            <button style={{ width: '100%', marginTop: '1rem', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.7rem', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
              Unlock full intelligence
            </button>
          </div>

          {/* Enquire */}
          <div style={panel}>
            <div style={sLabel}>Make an enquiry</div>
            <div style={{ fontSize: '0.75rem', color: text2, marginBottom: '0.875rem', lineHeight: 1.55 }}>
              Your enquiry goes directly to the agent. Manop logs intent to build market data.
            </div>
            {p.agent_phone && p.agent_phone.replace(/\D/g, '').length > 7 && (
              <a href={`https://wa.me/${p.agent_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#25D366', color: '#fff', padding: '0.7rem', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none', marginBottom: '0.5rem' }}>
                WhatsApp agent
              </a>
            )}
            <button style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.7rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              Send enquiry
            </button>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener" style={{ display: 'block', textAlign: 'center', fontSize: '0.72rem', color: text3, marginTop: '0.75rem', textDecoration: 'none' }}>
                View original on {sourceAgency || 'partner platform'} ↗
              </a>
            )}
          </div>

          {/* Data notice */}
          <div style={{ padding: '0.75rem 1rem', background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: `1px solid ${border}`, borderRadius: 9, fontSize: '0.65rem', color: text3, lineHeight: 1.6 }}>
            FX data: {rateSource} · Intelligence: Manop · Conduct independent due diligence before investing.
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 360px"] {
            grid-template-columns: 1fr !important;
          }
          div[style*="position: sticky"] {
            position: static !important;
          }
        }
      `}</style>
    </div>
  )
}
