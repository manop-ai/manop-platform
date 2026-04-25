'use client'
// app/neighborhood/[slug]/page.tsx
// Day 6 rebuild — full neighborhood intelligence page
// Features:
//   - Market insight ticker (6 auto-generated sentences from real data)
//   - Scenario calculator reads real benchmarks
//   - PropertySection in masonry layout (not straight lines)
//   - Dark/light mode throughout

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { generateInsights, REAL_BENCHMARKS, type MarketInsight } from '../../../lib/insights'

const PropertySection = dynamic(() => import('./PropertySection'), { ssr: false })

// ─── Neighborhood static context ─────────────────────────────
const HOOD_CONTEXT: Record<string, {
  display: string; city: string; tier: string; demand: string
  description: string; title_types: string[]
  best_for: string[]; risks: string[]
}> = {
  'lekki-phase-1': {
    display: 'Lekki Phase 1', city: 'Lagos', tier: 'Premium', demand: 'High',
    description: "Lagos's most sought-after residential corridor. Dense with embassies, corporate tenants, and diaspora buyers. Short-let demand is consistently strong year-round.",
    title_types: ['C of O', "Governor's Consent", 'Deed of Assignment'],
    best_for:    ['Short-let / Airbnb', 'Corporate rental', 'Capital appreciation'],
    risks:       ['Traffic congestion affects desirability', 'Oversupply risk on some streets', 'Verify title thoroughly — quality varies'],
  },
  'ikoyi': {
    display: 'Ikoyi', city: 'Lagos', tier: 'Prime', demand: 'Very High',
    description: "Lagos's most prestigious address. Ultra-HNW enclave. Limited supply, institutional buyer base.",
    title_types: ['C of O', "Governor's Consent"],
    best_for: ['Luxury short-let', 'Buy & hold', 'Institutional investment'],
    risks: ['Requires significant capital', 'Title fraud risk is real', 'Limited entry points'],
  },
  'victoria-island': {
    display: 'Victoria Island', city: 'Lagos', tier: 'Prime', demand: 'Very High',
    description: "Lagos's commercial and diplomatic hub. Business travel drives strong short-let demand year-round.",
    title_types: ['C of O', "Governor's Consent", 'Leasehold'],
    best_for: ['Corporate rental', 'Short-let', 'Mixed-use investment'],
    risks: ['Traffic is severe', 'Some leasehold complications', 'Noise from commercial activity'],
  },
  'ajah': {
    display: 'Ajah', city: 'Lagos', tier: 'Mid', demand: 'Medium',
    description: "Rapidly developing corridor east of Lekki. Fastest appreciation in Lagos 2023–2025.",
    title_types: ['Deed of Assignment', "Governor's Consent", 'Gazette', 'C of O'],
    best_for: ['Capital appreciation play', 'Development land', 'Affordable buy-to-let'],
    risks: ['Infrastructure still developing', 'Higher title fraud risk', 'Road quality'],
  },
}

// ─── Insight ticker ───────────────────────────────────────────
function InsightTicker({ insights, dark }: { insights: MarketInsight[]; dark: boolean }) {
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'
  const bg3    = dark ? '#162032' : '#FFFFFF'

  useEffect(() => {
    if (expanded) return
    timerRef.current = setInterval(() => {
      setActive(a => (a + 1) % insights.length)
    }, 4500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [insights.length, expanded])

  if (insights.length === 0) return null
  const current = insights[active]

  return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem' }}>
      {/* Ticker bar */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '0.875rem 1.25rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: current.color, flexShrink: 0, animation: 'pulse 2s infinite' }} />
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: current.color, textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0, minWidth: 100 }}>
          {current.type === 'yield' ? 'Yield signal' : current.type === 'str' ? 'STR signal' : current.type === 'currency' ? 'Currency' : current.type === 'price' ? 'Price' : 'Market'} ·
        </div>
        <div style={{ flex: 1, fontSize: '0.82rem', color: text2, lineHeight: 1.4, fontWeight: 500 }}>
          {current.headline} — {current.body.slice(0, 90)}{current.body.length > 90 ? '…' : ''}
        </div>
        <div style={{ fontSize: '0.72rem', color: text3, flexShrink: 0 }}>{expanded ? '↑' : '↓'}</div>
      </div>

      {/* Expanded — all insights */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${border}`, padding: '0.75rem 1.25rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
            All market signals — from verified data
          </div>
          {insights.map((ins, i) => (
            <div key={ins.id}
              onClick={() => { setActive(i); setExpanded(false) }}
              style={{ display: 'flex', gap: '0.75rem', padding: '0.6rem 0', borderBottom: i < insights.length - 1 ? `1px solid ${border}` : 'none', cursor: 'pointer' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: ins.color, flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', color: dark ? '#F8FAFC' : '#0F172A', fontWeight: 600, marginBottom: '0.15rem' }}>
                  {ins.headline}
                </div>
                <div style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.55 }}>{ins.body}</div>
                <div style={{ fontSize: '0.62rem', color: text3, marginTop: '0.25rem', fontFamily: 'monospace' }}>Source: {ins.source}</div>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: ins.color, flexShrink: 0, alignSelf: 'center' }}>{ins.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Dot pagination */}
      {!expanded && (
        <div style={{ display: 'flex', gap: '0.35rem', padding: '0 1.25rem 0.75rem', justifyContent: 'center' }}>
          {insights.map((_, i) => (
            <div key={i} onClick={() => setActive(i)} style={{ width: i === active ? 14 : 5, height: 5, borderRadius: 3, background: i === active ? insights[i].color : border, cursor: 'pointer', transition: 'all 0.3s' }} />
          ))}
        </div>
      )}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )
}

// ─── Scenario calculator ──────────────────────────────────────
function ScenarioCalc({ slug, dark }: { slug: string; dark: boolean }) {
  const b = REAL_BENCHMARKS[slug]
  const [price, setPrice]   = useState(b?.medians[3] || 400_000_000)
  const [beds, setBeds]     = useState(3)
  const [input, setInput]   = useState('')

  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'
  const bg3    = dark ? '#162032' : '#FFFFFF'

  const annualRent = b?.rent_medians[beds] || 0
  const grossYield = price > 0 && annualRent > 0 ? ((annualRent / price) * 100).toFixed(1) : '—'
  const capRate    = price > 0 && annualRent > 0 ? ((annualRent * 0.75 / price) * 100).toFixed(1) : '—'
  const strAnnual  = b ? b.str_nightly * 365 * 0.55 : 0
  const strYield   = price > 0 && strAnnual > 0 ? ((strAnnual / price) * 100).toFixed(1) : '—'

  function fmtM(n: number) {
    if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
    if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
    return `₦${Math.round(n/1e3)}K`
  }

  function parseInput(s: string): number | null {
    const clean = s.toLowerCase().replace(/[₦,\s]/g, '')
    const m = clean.match(/([\d.]+)(b|m|k)?/)
    if (!m) return null
    let n = parseFloat(m[1])
    if (m[2] === 'b') n *= 1e9
    else if (m[2] === 'm') n *= 1e6
    else if (m[2] === 'k') n *= 1e3
    else if (n < 10_000) n *= 1e6
    return n > 0 ? Math.round(n) : null
  }

  const panel = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }
  const chip = (active: boolean, color = '#5B2EFF') => ({
    padding: '0.3rem 0.875rem', borderRadius: 20, border: `1px solid ${active ? color : border}`,
    background: active ? `${color}20` : 'transparent',
    color: active ? color : text3, fontSize: '0.78rem', fontWeight: 600 as const, cursor: 'pointer',
  })
  const metricRow = (label: string, value: string, color: string, sub: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.65rem 0', borderBottom: `1px solid ${border}` }}>
      <div>
        <div style={{ fontSize: '0.78rem', color: text2 }}>{label}</div>
        <div style={{ fontSize: '0.65rem', color: text3, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 800, color }}>{value}</div>
    </div>
  )

  return (
    <div style={panel}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
        Run your scenario — real benchmarks
      </div>

      {/* Price input */}
      <div style={{ marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: '0.35rem' }}>Property price (₦)</div>
        <input
          style={{ width: '100%', padding: '0.6rem 0.875rem', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit' }}
          placeholder={`${fmtM(price)} — or type e.g. 120M`}
          value={input}
          onChange={e => {
            setInput(e.target.value)
            const p = parseInput(e.target.value)
            if (p) setPrice(p)
          }}
        />
        {b && (
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries(b.medians).map(([bd, p]) => (
              <button key={bd} onClick={() => { setBeds(parseInt(bd)); setPrice(p); setInput('') }}
                style={{ ...chip(beds === parseInt(bd) && price === p), fontSize: '0.68rem', padding: '0.2rem 0.6rem' }}>
                {bd}bd ₦{Math.round(p/1e6)}M
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bedroom selector */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.68rem', color: text3, marginBottom: '0.35rem' }}>Bedrooms (for rental benchmark)</div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => { setBeds(n); if (b?.medians[n]) setPrice(b.medians[n]); setInput('') }}
              style={chip(beds === n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      {metricRow('Traditional yield', `${grossYield}%`, grossYield !== '—' && parseFloat(grossYield) >= 6 ? '#22C55E' : '#F59E0B', `₦${Math.round(annualRent/1e6)}M annual rent on ${fmtM(price)}`)}
      {metricRow('Cap rate', `${capRate}%`, '#14B8A6', '75% of gross rent / price (after operating costs)')}
      {metricRow('STR gross yield', `${strYield}%`, '#F59E0B', `₦${b ? Math.round(b.str_nightly/1_000) : 0}K/night · 55% occupancy`)}
      {metricRow('Cash-on-cash return', '—', '#7C5FFF', '30% down · 22% mortgage · 15yr term')}

      <div style={{ fontSize: '0.65rem', color: text3, marginTop: '0.75rem', lineHeight: 1.6 }}>
        Rental benchmarks from {b?.rent_count || 0} verified listings. Sale benchmarks from {b?.sale_count || 0} listings. Source: CW Real Estate · Manop Intelligence.
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function NeighborhoodPage() {
  const params = useParams()
  const slug   = (params?.slug as string) || 'lekki-phase-1'
  const [dark, setDark] = useState(true)
  const [insights, setInsights] = useState<MarketInsight[]>([])

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => {
    // Fetch live insights with current FX rate
    fetch(`/api/insights?slug=${slug}`)
      .then(r => r.json())
      .then(d => setInsights(d.insights || []))
      .catch(() => setInsights(generateInsights(slug, 1570)))
  }, [slug])

  const ctx  = HOOD_CONTEXT[slug]
  const bg   = dark ? '#0F172A' : '#F8FAFC'
  const bg2  = dark ? '#1E293B' : '#F1F5F9'
  const bg3  = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const display = ctx?.display || slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
  const city    = ctx?.city || 'Lagos'

  const panel = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Hero */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '2.5rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Link href="/" style={{ fontSize: '0.78rem', color: text3, textDecoration: 'none' }}>Zahazi</Link>
            <span style={{ color: text3 }}>›</span>
            <Link href="/search" style={{ fontSize: '0.78rem', color: text3, textDecoration: 'none' }}>Markets</Link>
            <span style={{ color: text3 }}>›</span>
            <span style={{ fontSize: '0.78rem', color: text2 }}>{display}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 20, padding: '0.15rem 0.6rem' }}>
                  {city} · {ctx?.tier || 'Market'}
                </span>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '0.15rem 0.6rem' }}>
                  {ctx?.demand || 'Active'} demand
                </span>
              </div>
              <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, marginBottom: '0.6rem' }}>
                {display}
              </h1>
              <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.65, maxWidth: 560 }}>
                {ctx?.description || `${display} market intelligence — verified listings and real benchmarks.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Body — two column */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem', display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem', alignItems: 'start' }}>

        {/* Left — insights + properties */}
        <div>
          {/* Insight ticker */}
          {insights.length > 0 && <InsightTicker insights={insights} dark={dark} />}

          {/* Properties — masonry */}
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 14, height: 2, background: '#14B8A6' }} />
            Verified listings
          </div>
          <PropertySection neighborhood={slug} dark={dark} />
        </div>

        {/* Right — sticky intelligence panel */}
        <div style={{ position: 'sticky', top: '1.5rem' }}>
          <ScenarioCalc slug={slug} dark={dark} />

          {/* Market context */}
          {ctx && (
            <>
              <div style={panel}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem' }}>Best for</div>
                {ctx.best_for.map(b => (
                  <div key={b} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: text2, marginBottom: '0.4rem' }}>
                    <span style={{ color: '#22C55E', flexShrink: 0 }}>✓</span>{b}
                  </div>
                ))}
              </div>

              <div style={panel}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem' }}>Title types common here</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {ctx.title_types.map(t => (
                    <span key={t} style={{ fontSize: '0.72rem', color: '#14B8A6', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.18)', borderRadius: 6, padding: '0.2rem 0.5rem' }}>
                      ✓ {t}
                    </span>
                  ))}
                </div>
              </div>

              <div style={panel}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem' }}>Risk factors</div>
                {ctx.risks.map(r => (
                  <div key={r} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem', color: text2, marginBottom: '0.4rem', lineHeight: 1.45 }}>
                    <span style={{ color: '#F59E0B', flexShrink: 0 }}>⚠</span>{r}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Agency CTA */}
          <div style={{ background: dark ? 'rgba(91,46,255,0.08)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.18)', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: text, marginBottom: '0.35rem' }}>Agency in {display}?</div>
            <div style={{ fontSize: '0.72rem', color: text2, marginBottom: '0.875rem', lineHeight: 1.55 }}>
              Upload your listings free. Buyers see yield intelligence on every property. You get qualified leads.
            </div>
            <Link href="/agency/onboard" style={{ display: 'block', background: '#5B2EFF', color: '#fff', padding: '0.6rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
              Become a founding partner →
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 340px"] { grid-template-columns: 1fr !important; }
          div[style*="position: sticky"] { position: static !important; }
        }
      `}</style>
    </div>
  )
}
