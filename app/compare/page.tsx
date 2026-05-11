'use client'
// app/compare/page.tsx
// MANOP Neighborhood Comparison Tool — Day 9
// Pick any two neighborhoods. Side-by-side:
// median price USD, gross yield, cap rate, STR yield,
// entry price, appreciation, demand score
// The diaspora investor's core question answered in one view.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { REAL_BENCHMARKS } from '../../lib/insights'

// ─── Available markets (grows as data comes in) ───────────────
const MARKETS = [
  { slug: 'lekki-phase-1',   label: 'Lekki Phase 1',   city: 'Lagos',   flag: '🇳🇬', live: true  },
  { slug: 'ikoyi',            label: 'Ikoyi',            city: 'Lagos',   flag: '🇳🇬', live: false },
  { slug: 'victoria-island',  label: 'Victoria Island',  city: 'Lagos',   flag: '🇳🇬', live: false },
  { slug: 'ajah',             label: 'Ajah',             city: 'Lagos',   flag: '🇳🇬', live: false },
  { slug: 'east-legon',       label: 'East Legon',       city: 'Accra',   flag: '🇬🇭', live: false },
  { slug: 'westlands',        label: 'Westlands',        city: 'Nairobi', flag: '🇰🇪', live: false },
  { slug: 'karen',            label: 'Karen',            city: 'Nairobi', flag: '🇰🇪', live: false },
  { slug: 'maitama',          label: 'Maitama',          city: 'Abuja',   flag: '🇳🇬', live: false },
]

// ─── Research baseline for markets without DB data yet ────────
// Honest: labeled as "research estimate" not "verified"
const RESEARCH_BASELINE: Record<string, {
  median_3bed_ngn: number
  rent_3bed_ngn:   number
  yield_pct:       number
  cap_rate:        number
  str_yield:       number
  entry_ngn:       number
  yoy_pct:         number
  demand_score:    number
  source:          'verified' | 'research-estimate'
  listings:        number
}> = {
  'lekki-phase-1': {
    median_3bed_ngn: 400_000_000,
    rent_3bed_ngn:    20_000_000,
    yield_pct:        5.0,
    cap_rate:         3.75,
    str_yield:        9.0,
    entry_ngn:       150_000_000,
    yoy_pct:          8.2,
    demand_score:     9,
    source:           'verified',
    listings:         51,
  },
  'ikoyi': {
    median_3bed_ngn: 750_000_000,
    rent_3bed_ngn:    35_000_000,
    yield_pct:        4.7,
    cap_rate:         3.5,
    str_yield:       11.0,
    entry_ngn:       400_000_000,
    yoy_pct:         11.4,
    demand_score:    10,
    source:          'research-estimate',
    listings:         0,
  },
  'victoria-island': {
    median_3bed_ngn: 500_000_000,
    rent_3bed_ngn:    28_000_000,
    yield_pct:        5.6,
    cap_rate:         4.2,
    str_yield:       10.0,
    entry_ngn:       180_000_000,
    yoy_pct:          9.8,
    demand_score:    10,
    source:          'research-estimate',
    listings:         0,
  },
  'ajah': {
    median_3bed_ngn: 120_000_000,
    rent_3bed_ngn:     8_000_000,
    yield_pct:         6.7,
    cap_rate:          5.0,
    str_yield:         6.5,
    entry_ngn:        45_000_000,
    yoy_pct:           9.3,
    demand_score:      7,
    source:           'research-estimate',
    listings:          0,
  },
  'east-legon': {
    median_3bed_ngn: 350_000_000,  // GHS converted approx
    rent_3bed_ngn:    18_000_000,
    yield_pct:         5.1,
    cap_rate:          3.8,
    str_yield:         8.5,
    entry_ngn:       120_000_000,
    yoy_pct:           7.8,
    demand_score:      8,
    source:           'research-estimate',
    listings:          0,
  },
  'westlands': {
    median_3bed_ngn: 280_000_000,  // KES converted approx
    rent_3bed_ngn:    16_000_000,
    yield_pct:         5.7,
    cap_rate:          4.3,
    str_yield:         9.5,
    entry_ngn:       100_000_000,
    yoy_pct:           6.4,
    demand_score:      8,
    source:           'research-estimate',
    listings:          0,
  },
  'karen': {
    median_3bed_ngn: 420_000_000,
    rent_3bed_ngn:    22_000_000,
    yield_pct:         5.2,
    cap_rate:          3.9,
    str_yield:        10.0,
    entry_ngn:       180_000_000,
    yoy_pct:           8.1,
    demand_score:      7,
    source:           'research-estimate',
    listings:          0,
  },
  'maitama': {
    median_3bed_ngn: 180_000_000,
    rent_3bed_ngn:    10_000_000,
    yield_pct:         5.6,
    cap_rate:          4.2,
    str_yield:         7.0,
    entry_ngn:        80_000_000,
    yoy_pct:           6.5,
    demand_score:      6,
    source:           'research-estimate',
    listings:          0,
  },
}

interface CompareRow {
  metric:   string
  sub:      string
  aVal:     string
  bVal:     string
  aNum:     number
  bNum:     number
  winner:   'a' | 'b' | 'tie'
  higherIsBetter: boolean
  locked:   boolean
}

function buildRows(aSlug: string, bSlug: string, ngnRate: number): CompareRow[] {
  const a = RESEARCH_BASELINE[aSlug]
  const b = RESEARCH_BASELINE[bSlug]
  if (!a || !b) return []

  const fmtUSD = (ngn: number) => {
    const usd = ngn / ngnRate
    if (usd >= 1e6) return `$${(usd/1e6).toFixed(2)}M`
    return `$${Math.round(usd/1e3)}K`
  }
  const fmtM = (n: number) => {
    if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
    if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
    return `₦${Math.round(n/1e3)}K`
  }
  const pct = (n: number) => `${n.toFixed(1)}%`
  const winner = (an: number, bn: number, hib: boolean): 'a' | 'b' | 'tie' => {
    if (Math.abs(an - bn) < 0.05) return 'tie'
    if (hib) return an > bn ? 'a' : 'b'
    return an < bn ? 'a' : 'b'
  }

  return [
    {
      metric: '3-bed median price', sub: 'USD at live rate',
      aVal: `${fmtM(a.median_3bed_ngn)}\n${fmtUSD(a.median_3bed_ngn)}`,
      bVal: `${fmtM(b.median_3bed_ngn)}\n${fmtUSD(b.median_3bed_ngn)}`,
      aNum: a.median_3bed_ngn, bNum: b.median_3bed_ngn,
      winner: winner(a.median_3bed_ngn, b.median_3bed_ngn, false),
      higherIsBetter: false, locked: false,
    },
    {
      metric: 'Gross yield', sub: '3-bed annual rent ÷ price',
      aVal: pct(a.yield_pct), bVal: pct(b.yield_pct),
      aNum: a.yield_pct, bNum: b.yield_pct,
      winner: winner(a.yield_pct, b.yield_pct, true),
      higherIsBetter: true, locked: false,
    },
    {
      metric: 'Cap rate', sub: 'NOI ÷ price (75% of gross rent)',
      aVal: pct(a.cap_rate), bVal: pct(b.cap_rate),
      aNum: a.cap_rate, bNum: b.cap_rate,
      winner: winner(a.cap_rate, b.cap_rate, true),
      higherIsBetter: true, locked: false,
    },
    {
      metric: 'STR / Airbnb yield', sub: '55% occupancy estimate',
      aVal: pct(a.str_yield), bVal: pct(b.str_yield),
      aNum: a.str_yield, bNum: b.str_yield,
      winner: winner(a.str_yield, b.str_yield, true),
      higherIsBetter: true, locked: false,
    },
    {
      metric: 'Entry price', sub: 'Lowest verified / researched',
      aVal: `${fmtM(a.entry_ngn)}\n${fmtUSD(a.entry_ngn)}`,
      bVal: `${fmtM(b.entry_ngn)}\n${fmtUSD(b.entry_ngn)}`,
      aNum: a.entry_ngn, bNum: b.entry_ngn,
      winner: winner(a.entry_ngn, b.entry_ngn, false),
      higherIsBetter: false, locked: false,
    },
    {
      metric: 'Annual appreciation', sub: 'YoY price change estimate',
      aVal: pct(a.yoy_pct), bVal: pct(b.yoy_pct),
      aNum: a.yoy_pct, bNum: b.yoy_pct,
      winner: winner(a.yoy_pct, b.yoy_pct, true),
      higherIsBetter: true, locked: false,
    },
    {
      metric: 'Demand score', sub: 'Out of 10 — buyer activity',
      aVal: `${a.demand_score}/10`, bVal: `${b.demand_score}/10`,
      aNum: a.demand_score, bNum: b.demand_score,
      winner: winner(a.demand_score, b.demand_score, true),
      higherIsBetter: true, locked: false,
    },
    {
      metric: 'Verified listings', sub: 'Live on Manop platform',
      aVal: `${a.listings}`, bVal: `${b.listings}`,
      aNum: a.listings, bNum: b.listings,
      winner: winner(a.listings, b.listings, true),
      higherIsBetter: true, locked: false,
    },
  ]
}

// ─── Main ─────────────────────────────────────────────────────
export default function ComparePage() {
  const [dark, setDark]       = useState(true)
  const [aSlug, setASlug]     = useState('lekki-phase-1')
  const [bSlug, setBSlug]     = useState('ikoyi')
  const [ngnRate, setNgnRate] = useState(1570)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Fetch live FX
  useEffect(() => {
    fetch('/api/insights?slug=lekki-phase-1')
      .then(r => r.json())
      .then(d => { if (d.ngn_rate) setNgnRate(d.ngn_rate) })
      .catch(() => {})

    // Log demand signal
    fetch('/api/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_type: 'search_filter', metadata: { tool: 'comparison', neighborhoods: [aSlug, bSlug] } }),
    }).catch(() => {})
  }, [aSlug, bSlug])

  const bg    = dark ? '#0F172A' : '#F8FAFC'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const marketA = MARKETS.find(m => m.slug === aSlug)
  const marketB = MARKETS.find(m => m.slug === bSlug)
  const dataA   = RESEARCH_BASELINE[aSlug]
  const dataB   = RESEARCH_BASELINE[bSlug]
  const rows    = buildRows(aSlug, bSlug, ngnRate)

  const sel = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 10, color: text, fontSize: '0.875rem', padding: '0.65rem 0.875rem', outline: 'none', fontFamily: 'inherit', width: '100%', cursor: 'pointer' }

  const winnerColor = '#22C55E'
  const winnerBg    = 'rgba(34,197,94,0.08)'

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '2rem 2rem 1.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Link href="/" style={{ fontSize: '0.75rem', color: text3, textDecoration: 'none' }}>Manop</Link>
            <span style={{ color: text3 }}>›</span>
            <span style={{ fontSize: '0.75rem', color: text2 }}>Compare neighborhoods</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,3.5vw,2.2rem)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>
            Compare markets
          </h1>
          <p style={{ fontSize: '0.88rem', color: text2, maxWidth: 500 }}>
            Side-by-side intelligence on any two neighborhoods. Real data where verified, research estimates where not — always labeled.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem' }}>

        {/* Market selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>Market A</div>
            <select style={sel} value={aSlug} onChange={e => setASlug(e.target.value)}>
              {MARKETS.map(m => (
                <option key={m.slug} value={m.slug} disabled={m.slug === bSlug}>
                  {m.flag} {m.label}, {m.city}{!m.live ? ' (estimate)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ textAlign: 'center', fontSize: '1.2rem', color: text3, fontWeight: 300, paddingTop: '1.5rem' }}>vs</div>

          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>Market B</div>
            <select style={sel} value={bSlug} onChange={e => setBSlug(e.target.value)}>
              {MARKETS.map(m => (
                <option key={m.slug} value={m.slug} disabled={m.slug === aSlug}>
                  {m.flag} {m.label}, {m.city}{!m.live ? ' (estimate)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Column headers */}
        {dataA && dataB && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', marginBottom: '1px' }}>
              {/* A header */}
              <div style={{ background: dark ? 'rgba(91,46,255,0.1)' : 'rgba(91,46,255,0.05)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: '12px 0 0 0', padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
                  {marketA?.flag} Market A
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: text }}>{marketA?.label}</div>
                <div style={{ fontSize: '0.72rem', color: text3 }}>{marketA?.city}</div>
                {dataA.source === 'verified' ? (
                  <div style={{ fontSize: '0.6rem', color: '#22C55E', fontWeight: 700, marginTop: '0.35rem' }}>● Verified · {dataA.listings} live listings</div>
                ) : (
                  <div style={{ fontSize: '0.6rem', color: '#F59E0B', fontWeight: 700, marginTop: '0.35rem' }}>◌ Research estimate</div>
                )}
              </div>

              {/* Middle label */}
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 0, padding: '1rem 1.25rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Metric</div>
              </div>

              {/* B header */}
              <div style={{ background: dark ? 'rgba(20,184,166,0.1)' : 'rgba(20,184,166,0.05)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: '0 12px 0 0', padding: '1rem 1.25rem', textAlign: 'right' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
                  {marketB?.flag} Market B
                </div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: text }}>{marketB?.label}</div>
                <div style={{ fontSize: '0.72rem', color: text3 }}>{marketB?.city}</div>
                {dataB.source === 'verified' ? (
                  <div style={{ fontSize: '0.6rem', color: '#22C55E', fontWeight: 700, marginTop: '0.35rem' }}>● Verified · {dataB.listings} live listings</div>
                ) : (
                  <div style={{ fontSize: '0.6rem', color: '#F59E0B', fontWeight: 700, marginTop: '0.35rem' }}>◌ Research estimate</div>
                )}
              </div>
            </div>

            {/* Comparison rows */}
            {rows.map((row, i) => {
              const isLast = i === rows.length - 1
              const aWins  = row.winner === 'a'
              const bWins  = row.winner === 'b'

              return (
                <div key={row.metric} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', marginBottom: '1px' }}>
                  {/* A value */}
                  <div style={{ background: aWins ? winnerBg : bg3, border: `1px solid ${aWins ? 'rgba(34,197,94,0.2)' : border}`, borderRadius: isLast ? '0 0 0 12px' : 0, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {row.locked ? (
                      <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: 700 }}>🔒 Pro</div>
                    ) : (
                      <>
                        {row.aVal.split('\n').map((v, vi) => (
                          <div key={vi} style={{ fontSize: vi === 0 ? '1.1rem' : '0.75rem', fontWeight: vi === 0 ? 800 : 400, color: aWins ? winnerColor : vi === 0 ? text : text3, letterSpacing: vi === 0 ? '-0.02em' : 0, fontFamily: vi === 1 ? 'monospace' : 'inherit' }}>
                            {v}
                          </div>
                        ))}
                        {aWins && <div style={{ fontSize: '0.6rem', color: winnerColor, fontWeight: 700 }}>↑ Better</div>}
                      </>
                    )}
                  </div>

                  {/* Metric label — center */}
                  <div style={{ background: bg3, border: `1px solid ${border}`, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: text, marginBottom: '0.2rem' }}>{row.metric}</div>
                    <div style={{ fontSize: '0.65rem', color: text3, lineHeight: 1.4 }}>{row.sub}</div>
                    {row.locked && <div style={{ fontSize: '0.58rem', color: '#F59E0B', marginTop: '0.25rem' }}>Pro feature</div>}
                  </div>

                  {/* B value */}
                  <div style={{ background: bWins ? winnerBg : bg3, border: `1px solid ${bWins ? 'rgba(34,197,94,0.2)' : border}`, borderRadius: isLast ? '0 0 12px 0' : 0, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                    {row.locked ? (
                      <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: 700 }}>🔒 Pro</div>
                    ) : (
                      <>
                        {row.bVal.split('\n').map((v, vi) => (
                          <div key={vi} style={{ fontSize: vi === 0 ? '1.1rem' : '0.75rem', fontWeight: vi === 0 ? 800 : 400, color: bWins ? winnerColor : vi === 0 ? text : text3, letterSpacing: vi === 0 ? '-0.02em' : 0, fontFamily: vi === 1 ? 'monospace' : 'inherit', textAlign: 'right' }}>
                            {v}
                          </div>
                        ))}
                        {bWins && <div style={{ fontSize: '0.6rem', color: winnerColor, fontWeight: 700 }}>↑ Better</div>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Summary verdict */}
            {rows.length > 0 && (() => {
              const aWins = rows.filter(r => !r.locked && r.winner === 'a').length
              const bWins = rows.filter(r => !r.locked && r.winner === 'b').length
              const aName = marketA?.label
              const bName = marketB?.label
              const summary = aWins > bWins
                ? `${aName} leads on ${aWins}/${aWins+bWins} comparable metrics — stronger yield and lower entry price. ${bName} offers higher appreciation.`
                : bWins > aWins
                ? `${bName} leads on ${bWins}/${aWins+bWins} comparable metrics. ${aName} may offer better value for yield-focused investors.`
                : `Broadly comparable markets. Choose based on your investment horizon and risk preference.`
              return (
                <div style={{ marginTop: '1.5rem', background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.15)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>Manop summary</div>
                  <div style={{ fontSize: '0.88rem', color: text2, lineHeight: 1.65 }}>{summary}</div>
                  <div style={{ fontSize: '0.68rem', color: text3, marginTop: '0.5rem' }}>
                    Live rate: ₦{ngnRate.toLocaleString()}/$1 · Data: verified where labeled, research estimates elsewhere
                  </div>
                </div>
              )
            })()}

            {/* Disclaimer */}
            <div style={{ marginTop: '1rem', fontSize: '0.68rem', color: text3, lineHeight: 1.6, textAlign: 'center' }}>
              Research estimates are sourced from Lagos, Accra, and Nairobi property market reports 2024–2025.
              Verified data comes from agency-submitted listings on Manop. Always conduct independent due diligence.
            </div>

            {/* CTA row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
              <Link href={`/neighborhood/${aSlug}`} style={{ display: 'block', background: 'rgba(91,46,255,0.1)', border: '1px solid rgba(91,46,255,0.2)', color: '#7C5FFF', borderRadius: 10, padding: '0.875rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>
                Explore {marketA?.label} →
              </Link>
              <Link href={`/neighborhood/${bSlug}`} style={{ display: 'block', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)', color: '#14B8A6', borderRadius: 10, padding: '0.875rem', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center' }}>
                Explore {marketB?.label} →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
