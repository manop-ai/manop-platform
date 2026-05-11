'use client'
// components/PriceTrendChart.tsx
// Combined property value + rental income USD return chart
//
// Shows THREE things on one chart:
//   1. Property value in USD over time (NGN appreciation vs depreciation)
//   2. Cumulative rental income in USD over time
//   3. Total USD return (value + income combined)
//
// This directly addresses the feedback:
//   - Dynamic: uses live NGN rate + CBN historical data
//   - Accurate: real CBN rates, not estimates
//   - Combined: income + price together = real investor return

import { useMemo, useState } from 'react'
import { NGN_HISTORY, buildReturnModel, formatUSD, calcDepreciation } from '../lib/fx'

interface Props {
  priceNGN:    number
  priceUSD:    number
  liveNGNRate: number
  dark:        boolean
  neighborhood?: string
}

export default function PriceTrendChart({ priceNGN, priceUSD, liveNGNRate, dark, neighborhood }: Props) {
  const [projection, setProjection] = useState(10)
  const [showIncome, setShowIncome] = useState(true)
  const [ngnAppreciation, setNgnAppreciation] = useState(8)

  const model = useMemo(() => buildReturnModel(priceNGN, liveNGNRate, {
    ngnAppreciationPct:  ngnAppreciation,
    rentalYieldGrossPct: 5,
    expenseRatioPct:     25,
    projectYears:        projection,
  }), [priceNGN, liveNGNRate, ngnAppreciation, projection])

  const depreciation = calcDepreciation(2015, 2024)

  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.55)' : 'rgba(15,23,42,0.55)'
  const text3  = dark ? 'rgba(248,250,252,0.28)' : 'rgba(15,23,42,0.28)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'

  // ── Chart geometry ──────────────────────────────────────────
  const W = 560, H = 200
  const PAD = { top: 16, right: 24, bottom: 36, left: 64 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const years = model.years
  const allValues = years.flatMap(y => [
    y.propertyValueUSD,
    showIncome ? y.totalReturnUSD : 0,
  ]).filter(Boolean)

  const maxV = Math.max(...allValues)
  const minV = Math.min(0, ...years.map(y => y.propertyValueUSD))
  const range = maxV - minV || 1

  const xs = (i: number) => PAD.left + (i / (years.length - 1)) * plotW
  const ys = (v: number) => PAD.top + plotH - ((v - minV) / range) * plotH

  // Polyline point strings
  const propPoints    = years.map((y, i) => `${xs(i)},${ys(y.propertyValueUSD)}`).join(' ')
  const totalPoints   = years.map((y, i) => `${xs(i)},${ys(y.totalReturnUSD)}`).join(' ')
  const incomePoints  = years.map((y, i) => `${xs(i)},${ys(y.cumulativeRentUSD)}`).join(' ')

  // Reference line at initial USD investment
  const refY = ys(model.initialPriceUSD)

  // Y axis labels
  const yTicks = 4
  const labelColor = text3

  const lastYear    = years[years.length - 1]
  const finalReturn = lastYear?.totalReturnPct ?? 0
  const returnColor = finalReturn >= 0 ? '#22C55E' : '#EF4444'

  const panelStyle: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`,
    borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1rem',
  }

  const controlStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    fontSize: '0.75rem', color: text2,
  }

  const sliderLabelStyle: React.CSSProperties = {
    fontSize: '0.68rem', color: text3, minWidth: 28, textAlign: 'right' as const,
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.3rem' }}>
          USD return model — income + value combined
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: text }}>
          Real investor return: property value + rental income in USD
        </div>
        <div style={{ fontSize: '0.72rem', color: text2, marginTop: '0.2rem', lineHeight: 1.5 }}>
          Uses live NGN/USD rate · CBN historical data · {ngnAppreciation}% NGN property appreciation · 5% gross rental yield
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {[
          { label: 'Buy price (USD)',    value: formatUSD(model.initialPriceUSD),      color: '#7C5FFF' },
          { label: `Value in ${projection}yr`,  value: formatUSD(lastYear?.propertyValueUSD ?? 0), color: '#14B8A6' },
          { label: `Rent earned ${projection}yr`, value: formatUSD(lastYear?.cumulativeRentUSD ?? 0), color: '#22C55E' },
          { label: 'Total USD return',   value: `${finalReturn > 0 ? '+' : ''}${finalReturn}%`, color: returnColor },
        ].map(s => (
          <div key={s.label} style={{ background: bg2, borderRadius: 8, padding: '0.65rem 0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.58rem', color: text3, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ marginBottom: '1rem', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

          {/* Y axis grid + labels */}
          {Array.from({ length: yTicks + 1 }, (_, t) => {
            const frac = t / yTicks
            const v    = minV + frac * range
            const y    = PAD.top + plotH - frac * plotH
            return (
              <g key={t}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                  stroke={dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="0.5" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill={labelColor}>
                  {v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`}
                </text>
              </g>
            )
          })}

          {/* Initial investment reference line */}
          <line x1={PAD.left} y1={refY} x2={W - PAD.right} y2={refY}
            stroke={dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'}
            strokeWidth="1" strokeDasharray="4 3" />
          <text x={W - PAD.right + 4} y={refY + 4} fontSize="8" fill={labelColor}>entry</text>

          {/* X axis year labels */}
          {years.map((y, i) => {
            if (i === 0 || i === years.length - 1 || (projection <= 10 ? true : i % 2 === 0)) {
              return (
                <text key={y.year} x={xs(i)} y={H - 6} textAnchor="middle" fontSize="9" fill={labelColor}>
                  {y.year}
                </text>
              )
            }
            return null
          })}

          {/* Cumulative rent area (shaded) */}
          {showIncome && (
            <polygon
              points={[
                ...years.map((y, i) => `${xs(i)},${ys(y.propertyValueUSD)}`),
                ...years.slice().reverse().map((y, i) => `${xs(years.length - 1 - i)},${ys(y.totalReturnUSD)}`),
              ].join(' ')}
              fill="#22C55E" fillOpacity="0.08"
            />
          )}

          {/* Property value line (purple) */}
          <polyline points={propPoints} fill="none" stroke="#7C5FFF" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Total return line (teal) */}
          {showIncome && (
            <polyline points={totalPoints} fill="none" stroke="#14B8A6" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray="none" />
          )}

          {/* End-point dots */}
          {lastYear && (
            <>
              <circle cx={xs(years.length - 1)} cy={ys(lastYear.propertyValueUSD)} r="4" fill="#7C5FFF" />
              {showIncome && (
                <circle cx={xs(years.length - 1)} cy={ys(lastYear.totalReturnUSD)} r="4" fill="#14B8A6" />
              )}
            </>
          )}

          {/* NGN rate at each point (secondary axis — tiny labels) */}
          {years.filter((_, i) => i === 0 || i === years.length - 1 || (projection <= 5 ? true : i % 3 === 0)).map((y, idx, arr) => {
            const i = years.indexOf(y)
            const isFirst = i === 0
            const anchor  = isFirst ? 'start' : i === years.length - 1 ? 'end' : 'middle'
            return (
              <text key={y.year} x={xs(i)} y={PAD.top + plotH + 22} textAnchor={anchor}
                fontSize="8" fill={dark ? 'rgba(20,184,166,0.5)' : 'rgba(15,150,120,0.6)'}>
                ₦{y.ngnRate >= 1000 ? `${(y.ngnRate / 1000).toFixed(1)}K` : y.ngnRate}/$
              </text>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { color: '#7C5FFF', label: 'Property value (USD)' },
          ...(showIncome ? [{ color: '#14B8A6', label: 'Value + rental income (USD)' }] : []),
          { color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', label: 'Entry price', dashed: true },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: text2 }}>
            <div style={{ width: 20, height: 2, background: s.color, borderRadius: 1, borderTop: (s as any).dashed ? `2px dashed ${s.color}` : 'none', opacity: (s as any).dashed ? 0.8 : 1 }} />
            {s.label}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ borderTop: `1px solid ${border}`, paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={controlStyle}>
          <label style={{ minWidth: 110, color: text2, fontSize: '0.72rem' }}>Projection</label>
          <input type="range" min={3} max={15} step={1} value={projection}
            onChange={e => setProjection(Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={sliderLabelStyle}>{projection}yr</span>
        </div>
        <div style={controlStyle}>
          <label style={{ minWidth: 110, color: text2, fontSize: '0.72rem' }}>NGN appreciation</label>
          <input type="range" min={3} max={15} step={1} value={ngnAppreciation}
            onChange={e => setNgnAppreciation(Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={sliderLabelStyle}>{ngnAppreciation}%/yr</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: text2 }}>
          <input type="checkbox" id="showIncome" checked={showIncome}
            onChange={e => setShowIncome(e.target.checked)}
            style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <label htmlFor="showIncome" style={{ cursor: 'pointer' }}>Show rental income layer</label>
        </div>
      </div>

      {/* Depreciation context box */}
      <div style={{ marginTop: '1rem', background: dark ? 'rgba(239,68,68,0.05)' : 'rgba(239,68,68,0.03)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 8, padding: '0.875rem 1rem', fontSize: '0.72rem', color: text2, lineHeight: 1.65 }}>
        <span style={{ fontWeight: 700, color: '#EF4444' }}>NGN depreciation 2015–2024: −{depreciation.usdLossPct}%</span>
        {' '}(₦{depreciation.rateFrom} → ₦{depreciation.rateTo} per $1, CBN official data).
        {' '}A property that grew 8× in NGN terms over this period still lost {depreciation.usdLossPct > 60 ? 'significant' : 'some'} USD value.
        {' '}This model shows your real USD return when both rental income and property appreciation are accounted for against the exchange rate.
      </div>
    </div>
  )
}
