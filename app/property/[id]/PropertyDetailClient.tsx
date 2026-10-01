'use client'
// app/property/[id]/PropertyDetailClient.tsx
//
// FIXES:
// FIX 1 — TS2339: .catch() on Supabase PromiseLike — async/await + try/catch
// FIX 2 — TS2322: propertyLabel does not exist on InquiryModal Props
//   InquiryModal interface = { propertyId, agencyName?, dark }
//   Removed propertyLabel. Nothing else changes.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { formatNGN, formatUSD, calcDepreciation } from '../../../lib/fx'
import DecisionPanel from '../../../components/DecisionPanel'
import InquiryModal from '../../../components/InquiryModal'
import FinancingModal from '../../../components/FinancingModal'

const PriceTrendChart = dynamic(
  () => import('../../../components/PriceTrendChart'),
  { ssr: false, loading: () => (
    <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35, fontSize: '0.8rem' }}>
      Loading chart…
    </div>
  ) }
)

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

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
  data_partner_id:     string | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

interface Props {
  property:      Property
  liveNGNRate:   number
  rateSource:    string
  rateFetchedAt: string
}

function IntelRow({ label, value, sub, color, border }: {
  label: string; value: string; sub?: string; color?: string; border: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.75rem 0', borderBottom: `1px solid ${border}` }}>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(248,250,252,0.6)' }}>{label}</div>
        {sub && <div style={{ fontSize: '0.67rem', color: 'rgba(248,250,252,0.3)', marginTop: '0.15rem' }}>{sub}</div>}
      </div>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: color || '#F8FAFC', flexShrink: 0, marginLeft: '1rem', textAlign: 'right' as const }}>
        {value}
      </div>
    </div>
  )
}

export default function PropertyDetailClient({ property: p, liveNGNRate, rateSource, rateFetchedAt }: Props) {
  const [dark, setDark]               = useState(getInitialDark)
  const [imgIdx, setImgIdx]           = useState(0)
  const [agencyName, setAgencyName]   = useState<string | null>(null)
  const [agencyBadge, setAgencyBadge] = useState<string | null>(null)
  const [showFinancing, setShowFinancing] = useState(false)

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  // FIX 1: PromiseLike.catch is undefined — converted to async + try/catch
  useEffect(() => {
    if (!p.data_partner_id) return
    async function fetchAgency() {
      try {
        const { data } = await sb
          .from('data_partners')
          .select('name, badge_level, mape_score')
          .eq('id', p.data_partner_id!)
          .maybeSingle()
        if (data?.name)        setAgencyName(data.name)
        if (data?.badge_level) setAgencyBadge(data.badge_level)
      } catch (err) {
        console.error('[PropertyDetail] agency fetch:', err)
      }
    }
    fetchAgency()
  }, [p.data_partner_id])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const raw          = (p.raw_data || {}) as Record<string, unknown>
  const images       = Array.isArray(raw.images) ? raw.images as string[] : []
  const sourceUrl    = raw.source_url as string | undefined
  const sourceAgency = (raw.source_agency as string | undefined) || agencyName || undefined
  const subLocation  = raw.sub_location as string | undefined
  const intel        = raw.intel as Record<string, unknown> | undefined
  const isRent       = p.listing_type === 'for-rent' || p.listing_type === 'short-let'
  const location     = [p.neighborhood, p.city].filter(Boolean).join(', ')

  const tYield = intel?.traditional_yield_pct
    ? `${intel.traditional_yield_pct}%`
    : p.price_local
    ? `~${((6_000_000 / p.price_local) * 100).toFixed(1)}%`
    : null

  const depn = calcDepreciation(2015, 2024)

  const formatRate = (t: string) => {
    try { return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return t }
  }

  const BADGE_CONFIG: Record<string, { icon: string; color: string }> = {
    elite:    { icon: '★', color: '#F59E0B' },
    trust:    { icon: '◈', color: '#14B8A6' },
    verified: { icon: '◇', color: '#60A5FA' },
    listed:   { icon: '◎', color: '#94A3B8' },
  }
  const badge = BADGE_CONFIG[agencyBadge || 'listed'] || BADGE_CONFIG.listed

  const panel: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`,
    borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1rem',
  }
  const sLabel: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6',
    textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.35rem',
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 2rem 0' }}>
        <Link href="/search" style={{ fontSize: '0.8rem', color: text3, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
          ← All properties
        </Link>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 2rem 4rem', display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem', alignItems: 'start' }}>

        {/* ── LEFT ─────────────────────────────────────────── */}
        <div>
          <div style={{ borderRadius: 14, overflow: 'hidden', background: bg2, marginBottom: '1.5rem', position: 'relative' }}>
            {images.length > 0 ? (
              <>
                <img src={images[imgIdx]} alt={`${p.bedrooms || ''}bed in ${p.neighborhood}`}
                  style={{ width: '100%', height: 400, objectFit: 'cover', display: 'block' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                {images.length > 1 && (
                  <>
                    <button onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                      style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer', fontSize: '1.1rem' }}>‹</button>
                    <button onClick={() => setImgIdx(i => (i + 1) % images.length)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', borderRadius: 8, padding: '0.45rem 0.7rem', cursor: 'pointer', fontSize: '1.1rem' }}>›</button>
                    <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 5, padding: '0.15rem 0.5rem', fontSize: '0.68rem' }}>
                      {imgIdx + 1}/{images.length}
                    </div>
                  </>
                )}
                {images.length > 1 && (
                  <div style={{ display: 'flex', gap: '0.4rem', padding: '0.6rem', background: bg2, overflowX: 'auto' }}>
                    {images.map((img, i) => (
                      <img key={i} src={img} onClick={() => setImgIdx(i)} alt=""
                        style={{ width: 68, height: 50, objectFit: 'cover', borderRadius: 5, cursor: 'pointer', flexShrink: 0, opacity: imgIdx === i ? 1 : 0.45, border: `2px solid ${imgIdx === i ? '#5B2EFF' : 'transparent'}` }} />
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

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, borderRadius: 20, padding: '0.2rem 0.7rem', background: isRent ? 'rgba(20,184,166,0.1)' : 'rgba(91,46,255,0.1)', color: isRent ? '#14B8A6' : '#7C5FFF', border: `1px solid ${isRent ? 'rgba(20,184,166,0.3)' : 'rgba(91,46,255,0.3)'}` }}>
                {p.listing_type?.replace(/-/g, ' ') || 'For Sale'}
              </span>
              {sourceAgency && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 600, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: text3, border: `1px solid ${border}`, borderRadius: 20, padding: '0.2rem 0.7rem' }}>
                  <span style={{ color: badge.color }}>{badge.icon}</span>
                  {sourceAgency}
                </span>
              )}
            </div>

            <h1 style={{ fontSize: 'clamp(1.4rem,3.5vw,2rem)', fontWeight: 800, letterSpacing: '-0.03em', color: text, lineHeight: 1.15, marginBottom: '0.6rem' }}>
              {p.bedrooms ? `${p.bedrooms}-Bedroom ` : ''}{p.property_type || 'Property'}
              {p.neighborhood ? ` — ${p.neighborhood}` : ''}
            </h1>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' as const }}>
              <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#7C5FFF', letterSpacing: '-0.04em' }}>
                {formatNGN(p.price_local || 0)}
                {isRent && <span style={{ fontSize: '0.9rem', fontWeight: 400, color: text2 }}>/month</span>}
              </div>
              {p.price_usd && (
                <div style={{ display: 'flex', flexDirection: 'column' as const }}>
                  <div style={{ fontSize: '1rem', color: text3, fontFamily: 'monospace' }}>≈ {formatUSD(p.price_usd)}</div>
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
                  <div style={{ fontSize: '0.58rem', color: text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{String(l)}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: text }}>{String(v)}</div>
                </div>
              ))}
            </div>
          </div>

          {p.price_local && p.price_usd && (
            <PriceTrendChart priceNGN={p.price_local} priceUSD={p.price_usd} liveNGNRate={liveNGNRate} dark={dark} neighborhood={p.neighborhood || undefined} />
          )}

          {sourceUrl && (
            <div style={{ ...panel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={sLabel}>Original listing</div>
                <div style={{ fontSize: '0.8rem', color: text2 }}>View on {sourceAgency || 'partner platform'}</div>
              </div>
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', border: `1px solid ${border}`, color: text, padding: '0.5rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                View ↗
              </a>
            </div>
          )}
        </div>

        {/* ── RIGHT RAIL ───────────────────────────────────── */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>
          <div style={{ ...panel, background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.03)', border: '1px solid rgba(91,46,255,0.14)' }}>
            <div style={sLabel}>Intelligence · free</div>
            {tYield && <IntelRow label="Traditional rental yield" value={tYield} sub="Est. annual rent ÷ price" color="#22C55E" border={border} />}
            <IntelRow label="USD price" value={p.price_usd ? formatUSD(p.price_usd) : 'N/A'} sub={`₦${Math.round(liveNGNRate).toLocaleString()}/$1 live`} color="#7C5FFF" border={border} />
            <IntelRow label="NGN depreciation since 2015" value={`−${depn.usdLossPct}%`} sub="CBN official data · ₦192 → ₦1,480/$1" color="#EF4444" border="none" />
          </div>

          <DecisionPanel property={p} dark={dark} />

          {/*
            FIX 2: Removed propertyLabel — not in InquiryModal Props.
            Interface = { propertyId: string, agencyName?: string | null, dark: boolean }
          */}
          <InquiryModal
            propertyId={p.id}
            agencyName={sourceAgency}
            dark={dark}
          />

          {!isRent && p.listing_type !== 'short-let' && (
            <button
              type="button"
              onClick={() => setShowFinancing(true)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                marginTop: '1rem',
                background: 'rgba(20,184,166,0.08)',
                border: '1px solid rgba(20,184,166,0.25)',
                borderRadius: 10,
                color: '#14B8A6',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.08)')}
            >
              FINANCE
            </button>
          )}
        </div>
      </div>

      {/* Financing Modal */}
      {showFinancing && p.price_local && (
        <FinancingModal
          propertyId={p.id}
          propertyAddress={location}
          estimatedPriceNgn={p.price_local}
          onClose={() => setShowFinancing(false)}
        />
      )}
    </div>
  )
}