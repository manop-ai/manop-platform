'use client'
// app/calculator/page.tsx — Manop Deal Analyzer v3
// FIXED: PDF download with clean professional layout
// FIXED: Login gate before download (email capture)
// FIXED: Rent input clarity — supports both thousands and millions
// FIXED: Dark mode via listenTheme on all pages

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../lib/theme'

// ─── UNIT CONVENTION ─────────────────────────────────────────
// ALL internal values are in ACTUAL NAIRA
// price = 285_000_000 (₦285M)
// monthlyRent = 1_750_000 (₦1.75M/month) OR 850_000 (₦850K/month)
// User enters decimal millions: 1.75 = ₦1,750,000 | 0.85 = ₦850,000

function fmtNGN(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)         return `${sign}₦${(abs / 1_000).toFixed(0)}K`
  return `${sign}₦${Math.round(abs)}`
}

function fmtNGNClean(n: number): string {
  // For report tables — no decimals on large numbers
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}₦${Math.round(abs / 1_000).toLocaleString()}K`
  return `${sign}₦${Math.round(abs)}`
}

function fmtUSD(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${Math.round(abs).toLocaleString()}`
}

function pct(n: number): string { return `${n.toFixed(1)}%` }

function parseMillion(v: string): number {
  const n = parseFloat(v.replace(/[,₦\s]/g, ''))
  if (isNaN(n) || n <= 0) return 0
  return n * 1_000_000
}

function calcMortgageMonthly(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0 || n === 0) return principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ─── Types ────────────────────────────────────────────────────
interface StructResult {
  label:           string
  grossYield:      number
  capRate:         number
  annualCashFlow:  number
  monthlyCashFlow: number
  coc:             number
  monthlyDebt:     number
  equityIn:        number
}

interface Analysis {
  priceNGN:       number
  monthlyRentNGN: number
  annualGrossNGN: number
  effectiveNGN:   number
  noiNGN:         number
  priceUSD:       number
  annualNoiUSD:   number
  fx:             number
  selected:       StructResult[]
  primary:        StructResult
  verdict:        'viable' | 'borderline' | 'notviable'
  loc:            string
  propType:       string
  vacancyPct:     number
  opExpPct:       number
  appreciation:   number
  generatedAt:    string
}

const VS = {
  viable:     { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',   color: '#22C55E', label: 'Viable'      },
  borderline: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)',  color: '#F59E0B', label: 'Borderline'  },
  notviable:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',   color: '#EF4444', label: 'Not Viable'  },
}

function getVerdict(cf: number, coc: number, gy: number): 'viable' | 'borderline' | 'notviable' {
  if (gy >= 6 && coc >= 5 && cf > 0) return 'viable'
  if (gy >= 4 && cf > 0)             return 'borderline'
  return 'notviable'
}

// ─── Login Gate Modal ─────────────────────────────────────────
function LoginGate({ onSuccess, dark, onClose }: { onSuccess: (email: string) => void; dark: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [name,  setName]  = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.12)'
  const INP: React.CSSProperties = { width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.9rem', padding: '0.65rem 0.875rem', outline: 'none', fontFamily: 'inherit', marginBottom: 12 }

  async function submit() {
    if (!name.trim())  { setError('Please enter your name'); return }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return }
    setLoading(true)
    setError('')
    // Save to localStorage for session — also send to Supabase signals
    try {
      localStorage.setItem('manop_user_email', email.trim())
      localStorage.setItem('manop_user_name', name.trim())
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'calculator_download',
          metadata: { email: email.trim(), name: name.trim(), action: 'deal_report_download' }
        }),
      }).catch(() => {})
    } catch {}
    setLoading(false)
    onSuccess(email.trim())
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: bg3, borderRadius: 16, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ background: '#5B2EFF', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Manop</div>
          </div>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Get your deal report</h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.5 }}>
            Free to download. We send you the PDF and keep you updated with African market intelligence.
          </p>
        </div>

        <div style={{ padding: '1.5rem' }}>
          <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 5, fontWeight: 500 }}>Your name</label>
          <input style={INP} type="text" placeholder="e.g. Joel Mensah" value={name} onChange={e => setName(e.target.value)} autoFocus />

          <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 5, fontWeight: 500 }}>Email address</label>
          <input style={INP} type="email" placeholder="e.g. joel@example.com" value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()} />

          {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{error}</div>}

          <button onClick={submit} disabled={loading} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : 'Download deal report →'}
          </button>

          <button onClick={onClose} style={{ width: '100%', background: 'transparent', border: 'none', color: text2, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '0.4rem' }}>
            Cancel
          </button>

          <p style={{ fontSize: 11, color: text2, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            No spam. Unsubscribe anytime. Manop is free — always.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── PDF Generator ────────────────────────────────────────────
function generatePDF(a: Analysis, userName: string) {
  // Build a clean HTML document and use browser print API
  // This produces a much cleaner PDF than canvas-based approaches
  const vs = VS[a.verdict]
  const today = a.generatedAt

  const verdictDesc = a.verdict === 'viable'
    ? `At ${pct(a.primary.grossYield)} gross yield and ${pct(a.primary.coc)} cash-on-cash return, this deal clears the core investment benchmarks. Net monthly income of ${fmtNGNClean(a.primary.monthlyCashFlow)} after all costs and debt service.`
    : a.verdict === 'borderline'
    ? `Yield of ${pct(a.primary.grossYield)} is below the 6% benchmark but cash flow is positive at ${fmtNGNClean(a.primary.monthlyCashFlow)}/month. Negotiate price down 5–10% or explore short-let to improve returns.`
    : `Negative cash flow of ${fmtNGNClean(a.primary.monthlyCashFlow)}/month under current inputs. The asking price of ${fmtNGNClean(a.priceNGN)} is too high relative to achievable rent. Renegotiate or explore a different property.`

  const verdictColorHex = a.verdict === 'viable' ? '#15803d' : a.verdict === 'borderline' ? '#b45309' : '#dc2626'
  const verdictBgHex    = a.verdict === 'viable' ? '#f0fdf4' : a.verdict === 'borderline' ? '#fffbeb' : '#fef2f2'
  const verdictBdrHex   = a.verdict === 'viable' ? '#86efac' : a.verdict === 'borderline' ? '#fcd34d' : '#fca5a5'

  const structRows = a.selected.map(s => {
    const v = getVerdict(s.annualCashFlow, s.coc, s.grossYield)
    const vc = VS[v]
    return `
      <tr>
        <td>${s.label}</td>
        <td class="num">${fmtNGNClean(s.monthlyCashFlow)}/mo</td>
        <td class="num">${pct(s.grossYield)}</td>
        <td class="num">${pct(s.coc)}</td>
        <td class="num"><span style="color:${vc.color};font-weight:600">${vc.label}</span></td>
      </tr>`
  }).join('')

  const projRows = [1, 3, 5, 10].map(yr => {
    let cumRentUSD = 0
    let propNGN = a.priceNGN
    let rate = a.fx
    for (let y = 1; y <= yr; y++) {
      propNGN  *= (1 + a.appreciation)
      rate     *= 1.08
      cumRentUSD += (a.noiNGN / rate)
    }
    const propUSD  = propNGN / rate
    const totalUSD = propUSD + cumRentUSD
    const totalPct = Math.round(((totalUSD - a.priceUSD) / a.priceUSD) * 100)
    return `
      <tr>
        <td>Year ${yr}</td>
        <td class="num">${fmtUSD(propUSD)}</td>
        <td class="num">+${fmtUSD(cumRentUSD)}</td>
        <td class="num" style="color:${totalPct >= 0 ? '#15803d' : '#dc2626'};font-weight:600">${totalPct >= 0 ? '+' : ''}${totalPct}%</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Manop Deal Report — ${a.loc}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0F172A; background: #fff; font-size: 13px; line-height: 1.5; }

  /* Page layout */
  .page { max-width: 720px; margin: 0 auto; padding: 0; }

  /* Header */
  .header { background: #5B2EFF; color: #fff; padding: 32px 40px 24px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 16px; }
  .logo-text { font-weight: 700; font-size: 16px; }
  .logo-sub { font-size: 9px; opacity: 0.7; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 1px; }
  .header-meta { text-align: right; font-size: 11px; opacity: 0.7; line-height: 1.6; }
  .header h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px; }
  .header .subtitle { opacity: 0.8; font-size: 14px; }

  /* Verdict banner */
  .verdict { background: ${verdictBgHex}; border: 1.5px solid ${verdictBdrHex}; border-radius: 10px; padding: 20px 24px; margin: 24px 40px; }
  .verdict-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .verdict-badge { font-size: 20px; font-weight: 800; color: ${verdictColorHex}; }
  .verdict-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${verdictColorHex}; }
  .verdict-stars { font-size: 22px; }
  .verdict-desc { font-size: 13px; color: #374151; line-height: 1.65; }

  /* Sections */
  .section { padding: 0 40px; margin-bottom: 28px; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #5B2EFF; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #5B2EFF; }

  /* Key metrics grid */
  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 0; }
  .metric { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; }
  .metric-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px; font-weight: 600; }
  .metric-value { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; color: #0F172A; line-height: 1; margin-bottom: 3px; }
  .metric-sub { font-size: 10px; color: #94a3b8; }
  .metric.green .metric-value { color: #15803d; }
  .metric.amber .metric-value { color: #b45309; }
  .metric.red   .metric-value { color: #dc2626; }
  .metric.purple .metric-value { color: #5B2EFF; }
  .metric.teal .metric-value { color: #0d9488; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 7px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #64748b; border-bottom: 1.5px solid #E2E8F0; background: #F8FAFC; }
  td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; color: #374151; }
  td.num { text-align: right; font-weight: 500; color: #0F172A; }
  th.num { text-align: right; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #FAFAFA; }

  /* Data rows (key-value) */
  .data-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #F1F5F9; }
  .data-row:last-child { border-bottom: none; }
  .data-label { color: #64748b; font-size: 13px; }
  .data-value { font-weight: 600; color: #0F172A; font-size: 13px; }

  /* Risk items */
  .risk-item { padding: 8px 0; border-bottom: 1px solid #F1F5F9; }
  .risk-item:last-child { border-bottom: none; }
  .risk-scenario { font-weight: 600; color: #0F172A; font-size: 13px; margin-bottom: 2px; }
  .risk-note { font-size: 12px; color: #64748b; }

  /* Footer */
  .footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 40px; margin-top: 32px; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 11px; color: #64748b; line-height: 1.6; }
  .footer-right { font-size: 11px; color: #94a3b8; text-align: right; }
  .footer-logo { font-weight: 700; color: #5B2EFF; font-size: 13px; }

  /* Divider */
  .divider { height: 1px; background: #E2E8F0; margin: 0 40px 28px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-top">
      <div class="logo">
        <div class="logo-box">M</div>
        <div>
          <div class="logo-text">Manop</div>
          <div class="logo-sub">Africa Property Intelligence</div>
        </div>
      </div>
      <div class="header-meta">
        Deal Report<br>
        ${today}<br>
        Prepared for ${userName}<br>
        manopintel.com
      </div>
    </div>
    <h1>Deal Analysis Report</h1>
    <div class="subtitle">${a.propType} · ${a.loc}</div>
  </div>

  <!-- Verdict -->
  <div class="verdict">
    <div class="verdict-top">
      <div>
        <div class="verdict-label">Overall Assessment</div>
        <div class="verdict-badge">${VS[a.verdict].label}</div>
      </div>
      <div class="verdict-stars">${a.verdict === 'viable' ? '✅' : a.verdict === 'borderline' ? '⚠️' : '❌'}</div>
    </div>
    <div class="verdict-desc">${verdictDesc}</div>
  </div>

  <!-- Key metrics -->
  <div class="section">
    <div class="section-title">Key investment metrics</div>
    <div class="metrics">
      <div class="metric ${a.primary.grossYield >= 7 ? 'green' : a.primary.grossYield >= 5 ? 'amber' : 'red'}">
        <div class="metric-label">Gross Yield</div>
        <div class="metric-value">${pct(a.primary.grossYield)}</div>
        <div class="metric-sub">Annual rent ÷ price</div>
      </div>
      <div class="metric teal">
        <div class="metric-label">Cap Rate</div>
        <div class="metric-value">${pct(a.primary.capRate)}</div>
        <div class="metric-sub">NOI ÷ price</div>
      </div>
      <div class="metric teal">
        <div class="metric-label">Cash-on-Cash Return</div>
        <div class="metric-value">${pct(a.primary.coc)}</div>
        <div class="metric-sub">Cash-on-cash</div>
      </div>
      <div class="metric ${a.primary.monthlyCashFlow > 0 ? 'green' : 'red'}">
        <div class="metric-label">Net Monthly Income</div>
        <div class="metric-value">${fmtNGNClean(a.primary.monthlyCashFlow)}</div>
        <div class="metric-sub">After all costs & debt</div>
      </div>
      <div class="metric purple">
        <div class="metric-label">Purchase Price (USD)</div>
        <div class="metric-value">${fmtUSD(a.priceUSD)}</div>
        <div class="metric-sub">At ₦${a.fx.toLocaleString()}/$1</div>
      </div>
      <div class="metric ${a.primary.annualCashFlow > 0 ? 'green' : 'red'}">
        <div class="metric-label">Annual Cash Flow</div>
        <div class="metric-value">${fmtNGNClean(a.primary.annualCashFlow)}</div>
        <div class="metric-sub">Net of all costs</div>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Property details -->
  <div class="section">
    <div class="section-title">Property information</div>
    <div class="data-row"><span class="data-label">Location</span><span class="data-value">${a.loc}</span></div>
    <div class="data-row"><span class="data-label">Property type</span><span class="data-value">${a.propType}</span></div>
    <div class="data-row"><span class="data-label">Purchase price</span><span class="data-value">${fmtNGNClean(a.priceNGN)}</span></div>
    <div class="data-row"><span class="data-label">Purchase price (USD)</span><span class="data-value">${fmtUSD(a.priceUSD)}</span></div>
    <div class="data-row"><span class="data-label">Monthly rent estimate</span><span class="data-value">${fmtNGNClean(a.monthlyRentNGN)}/month</span></div>
    <div class="data-row"><span class="data-label">Annual gross rent</span><span class="data-value">${fmtNGNClean(a.annualGrossNGN)}/year</span></div>
    <div class="data-row"><span class="data-label">Effective rent (after vacancy)</span><span class="data-value">${fmtNGNClean(a.effectiveNGN)}/year</span></div>
    <div class="data-row"><span class="data-label">Net operating income</span><span class="data-value">${fmtNGNClean(a.noiNGN)}/year</span></div>
    <div class="data-row"><span class="data-label">Annual NOI (USD)</span><span class="data-value">${fmtUSD(a.annualNoiUSD)}/year</span></div>
  </div>

  <div class="divider"></div>

  <!-- Structure comparison -->
  <div class="section">
    <div class="section-title">Financing structure${a.selected.length > 1 ? ' comparison' : ''}</div>
    <table>
      <thead>
        <tr>
          <th>Structure</th>
          <th class="num">Monthly income</th>
          <th class="num">Gross yield</th>
          <th class="num">CoC return</th>
          <th class="num">Assessment</th>
        </tr>
      </thead>
      <tbody>${structRows}</tbody>
    </table>
    ${a.primary.monthlyDebt > 0 ? `<p style="font-size:11px;color:#64748b;margin-top:8px">Best structure: ${a.primary.label} — monthly debt service: ${fmtNGNClean(a.primary.monthlyDebt)}/month · Equity invested: ${fmtNGNClean(a.primary.equityIn)}</p>` : ''}
  </div>

  <div class="divider"></div>

  <!-- Risk sensitivity -->
  <div class="section">
    <div class="section-title">Risk & sensitivity analysis</div>
    <div class="risk-item">
      <div class="risk-scenario">Rent drops 10%</div>
      <div class="risk-note">Cash flow: ${fmtNGNClean(a.noiNGN * 0.9 - a.primary.monthlyDebt * 12)}/year — ${(a.noiNGN * 0.9 - a.primary.monthlyDebt * 12) > 0 ? 'deal survives' : 'cash flow goes negative'}</div>
    </div>
    <div class="risk-item">
      <div class="risk-scenario">Vacancy increases to 20%</div>
      <div class="risk-note">Cash flow drops to ${fmtNGNClean(a.annualGrossNGN * 0.8 * (1 - a.opExpPct) - a.primary.monthlyDebt * 12)}/year</div>
    </div>
    <div class="risk-item">
      <div class="risk-scenario">Interest rate rises 2% (if loan)</div>
      <div class="risk-note">${a.selected.some(s => s.label === 'Mortgage') ? 'Monthly debt service increases — recalculate with updated rate before committing' : 'Not applicable — cash purchase'}</div>
    </div>
    <div class="risk-item">
      <div class="risk-scenario">NGN depreciates 15%/year vs USD</div>
      <div class="risk-note">USD annual income falls to ${fmtUSD(a.annualNoiUSD * 0.85)}/year — key risk for diaspora investors</div>
    </div>
    <div class="risk-item">
      <div class="risk-scenario">Price negotiated down 5%</div>
      <div class="risk-note">Gross yield improves to ${pct(a.primary.grossYield * (1 / 0.95))} — always negotiate</div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- 10-year projection -->
  <div class="section">
    <div class="section-title">10-year USD return projection (cash purchase basis)</div>
    <table>
      <thead>
        <tr>
          <th>Year</th>
          <th class="num">Property value (USD)</th>
          <th class="num">Cumulative rent (USD)</th>
          <th class="num">Total return</th>
        </tr>
      </thead>
      <tbody>${projRows}</tbody>
    </table>
    <p style="font-size:11px;color:#64748b;margin-top:8px">
      Assumes ${pct(a.appreciation * 100)} NGN property appreciation and 8%/yr NGN depreciation vs USD (CBN historical average).
      Entry price: ${fmtUSD(a.priceUSD)}. This is a guidance model — actual returns depend on market conditions.
    </p>
  </div>

  <div class="divider"></div>

  <!-- Assumptions -->
  <div class="section">
    <div class="section-title">Assumptions used</div>
    <div class="data-row"><span class="data-label">Vacancy rate</span><span class="data-value">${pct(a.vacancyPct * 100)}</span></div>
    <div class="data-row"><span class="data-label">Operating expenses</span><span class="data-value">${pct(a.opExpPct * 100)} of effective rent</span></div>
    <div class="data-row"><span class="data-label">Annual property appreciation</span><span class="data-value">${pct(a.appreciation * 100)}</span></div>
    <div class="data-row"><span class="data-label">NGN/USD exchange rate</span><span class="data-value">₦${a.fx.toLocaleString()}/$1</span></div>
    <div class="data-row"><span class="data-label">Analysis date</span><span class="data-value">${today}</span></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <div class="footer-logo">Manop — Africa Property Intelligence</div>
      This report was generated by Manop (manopintel.com).<br>
      All figures are estimates based on inputs provided by the user.<br>
      <strong>Not financial advice.</strong> Conduct independent due diligence before investing.
    </div>
    <div class="footer-right">
      Prepared for<br><strong>${userName}</strong><br>${today}
    </div>
  </div>

</div>
</body>
</html>`

  // Open in new tab and trigger print dialog (saves as PDF)
  const win = window.open('', '_blank')
  if (!win) { alert('Please allow popups to download the report'); return }
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 500)
}

// ─── Main component ───────────────────────────────────────────
const LOCATIONS = [
  '', 'Lekki Phase 1, Lagos', 'Ikoyi, Lagos', 'Victoria Island, Lagos',
  'Ajah, Lagos', 'Chevron, Lagos', 'Ikota, Lagos', 'Gbagada, Lagos',
  'Ikeja GRA, Lagos', 'Maitama, Abuja', 'Asokoro, Abuja', 'Wuse 2, Abuja',
  'East Legon, Accra', 'Cantonments, Accra', 'Westlands, Nairobi',
  'Karen, Nairobi', 'Other / custom',
]

const PROP_TYPES = ['Apartment', 'Duplex', 'Detached house', 'Semi-detached', 'Bungalow', 'Land', 'Commercial']

export default function CalculatorPage() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const [priceM,    setPriceM]    = useState('285')
  const [rentM,     setRentM]     = useState('1.75')
  const [location,  setLocation]  = useState('')
  const [propType,  setPropType]  = useState('Duplex')
  const [structs,   setStructs]   = useState({ cash: true, loan: true, install: false })
  const [intRate,   setIntRate]   = useState(18)
  const [loanTerm,  setLoanTerm]  = useState(15)
  const [downPct,   setDownPct]   = useState(30)
  const [instDur,   setInstDur]   = useState(24)
  const [vacancy,   setVacancy]   = useState(10)
  const [opExp,     setOpExp]     = useState(25)
  const [appPct,    setAppPct]    = useState(8)
  const [fx,        setFx]        = useState(1570)
  const [analysis,  setAnalysis]  = useState<Analysis | null>(null)
  const [error,     setError]     = useState('')
  const [showGate,  setShowGate]  = useState(false)

  const priceNGN     = parseMillion(priceM)
  const monthlyNGN   = parseMillion(rentM)
  const loanNGN      = priceNGN * (1 - downPct / 100)
  const mortgageMonthly = calcMortgageMonthly(loanNGN, intRate, loanTerm)
  const instMonthly  = priceNGN / instDur

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'

  const CARD: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 12 }
  const INP:  React.CSSProperties = { width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.9rem', padding: '0.65rem 0.875rem', outline: 'none', fontFamily: 'inherit' }
  const LBL:  React.CSSProperties = { fontSize: '0.72rem', color: text2, marginBottom: '0.35rem', display: 'block', fontWeight: 500 }
  const HINT: React.CSSProperties = { fontSize: '0.62rem', color: text3, marginTop: '0.25rem', lineHeight: 1.4 }

  function STag({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ width: 12, height: 2, background: '#14B8A6' }} />{children}
    </div>
  }

  function analyze() {
    setError('')
    if (!priceNGN || priceNGN < 1_000_000) { setError('Enter purchase price in millions — e.g. 285 for ₦285M'); return }
    if (!monthlyNGN || monthlyNGN < 10_000) { setError('Enter monthly rent in millions — e.g. 1.75 for ₦1.75M/month, or 0.85 for ₦850K/month'); return }
    if (!location)                           { setError('Select a location'); return }
    if (!structs.cash && !structs.loan && !structs.install) { setError('Select at least one financing structure'); return }

    const annualGrossNGN = monthlyNGN * 12
    const effectiveNGN   = annualGrossNGN * (1 - vacancy / 100)
    const noiNGN         = effectiveNGN * (1 - opExp / 100)
    const selected: StructResult[] = []

    if (structs.cash) {
      selected.push({ label: 'Cash', grossYield: (annualGrossNGN / priceNGN) * 100, capRate: (noiNGN / priceNGN) * 100, annualCashFlow: noiNGN, monthlyCashFlow: noiNGN / 12, coc: (noiNGN / priceNGN) * 100, monthlyDebt: 0, equityIn: priceNGN })
    }
    if (structs.loan) {
      const downNGN = priceNGN * (downPct / 100)
      const annualDebt = mortgageMonthly * 12
      const annualCF = noiNGN - annualDebt
      selected.push({ label: 'Mortgage', grossYield: (annualGrossNGN / priceNGN) * 100, capRate: (noiNGN / priceNGN) * 100, annualCashFlow: annualCF, monthlyCashFlow: annualCF / 12, coc: downNGN > 0 ? (annualCF / downNGN) * 100 : 0, monthlyDebt: mortgageMonthly, equityIn: downNGN })
    }
    if (structs.install) {
      const depositNGN = priceNGN * 0.3
      const annualInst = instMonthly * 12
      const annualCF = noiNGN - annualInst
      selected.push({ label: 'Installment', grossYield: (annualGrossNGN / priceNGN) * 100, capRate: (noiNGN / priceNGN) * 100, annualCashFlow: annualCF, monthlyCashFlow: annualCF / 12, coc: depositNGN > 0 ? (annualCF / depositNGN) * 100 : 0, monthlyDebt: instMonthly, equityIn: depositNGN })
    }

    const primary = selected.reduce((b, s) => s.coc > b.coc ? s : b, selected[0])
    const verdict = getVerdict(primary.annualCashFlow, primary.coc, primary.grossYield)

    setAnalysis({
      priceNGN, monthlyRentNGN: monthlyNGN, annualGrossNGN, effectiveNGN, noiNGN,
      priceUSD: priceNGN / fx, annualNoiUSD: noiNGN / fx, fx, selected, primary, verdict,
      loc: location, propType, vacancyPct: vacancy / 100, opExpPct: opExp / 100,
      appreciation: appPct / 100,
      generatedAt: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    })
  }

  function handleDownload() {
    // Check if user already logged in this session
    const savedEmail = localStorage.getItem('manop_user_email')
    const savedName  = localStorage.getItem('manop_user_name')
    if (savedEmail && savedName) {
      generatePDF(analysis!, savedName)
    } else {
      setShowGate(true)
    }
  }

  const toggleStruct = (k: keyof typeof structs) => setStructs(p => ({ ...p, [k]: !p[k] }))
  const TogBtn = ({ k, label }: { k: keyof typeof structs; label: string }) => (
    <button onClick={() => toggleStruct(k)} style={{ padding: '0.45rem 1rem', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${structs[k] ? '#5B2EFF' : border}`, background: structs[k] ? '#5B2EFF' : 'transparent', color: structs[k] ? '#fff' : text2, fontWeight: structs[k] ? 600 : 400 }}>{label}</button>
  )

  const vs = analysis ? VS[analysis.verdict] : null

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s, color 0.3s' }}>

      {/* Hero */}
      <div style={{ background: '#5B2EFF', padding: '1.5rem 1.25rem 2rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Manop</Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 6 }}>Deal Analyzer v1</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, maxWidth: 480 }}>
            Is this deal viable? Enter any property and Manop analyses the numbers under cash, loan, or installment — then generates a shareable report. Less promises. More clarity.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.25rem 1rem 4rem' }}>

        {/* Property info */}
        <div style={CARD}>
          <STag>Property information</STag>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LBL}>Purchase price (₦M)</label>
              <input style={INP} type="number" value={priceM} min="1" step="1" onChange={e => setPriceM(e.target.value)} placeholder="e.g. 285" />
              <div style={HINT}>{priceNGN > 0 ? `= ${fmtNGN(priceNGN)}` : 'Enter in millions — 285 = ₦285,000,000'}</div>
            </div>
            <div>
              <label style={LBL}>Monthly rent estimate (₦M)</label>
              <input style={INP} type="number" value={rentM} min="0.01" step="0.05" onChange={e => setRentM(e.target.value)} placeholder="e.g. 1.75 or 0.85" />
              <div style={HINT}>
                {monthlyNGN > 0
                  ? `= ${fmtNGN(monthlyNGN)}/month · ${fmtNGN(monthlyNGN * 12)}/year`
                  : '1.75 = ₦1.75M/month · 0.85 = ₦850K/month'}
              </div>
            </div>
            <div>
              <label style={LBL}>Location</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Select area</option>
                {LOCATIONS.filter(Boolean).map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Property type</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={propType} onChange={e => setPropType(e.target.value)}>
                {PROP_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Structure */}
        <div style={CARD}>
          <STag>Purchase structure — select all that apply</STag>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 12 }}>
            <TogBtn k="cash" label="Cash" />
            <TogBtn k="loan" label="Mortgage / Loan" />
            <TogBtn k="install" label="Installment" />
          </div>
          {structs.loan && (
            <div style={{ background: dark ? 'rgba(91,46,255,0.08)' : 'rgba(91,46,255,0.05)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 10, padding: '1rem', marginBottom: structs.install ? 8 : 0 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Loan details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ ...LBL, color: text3 }}>Interest rate (%)</label><input style={INP} type="number" value={intRate} min={1} max={40} step={0.5} onChange={e => setIntRate(+e.target.value)} /><div style={HINT}>{intRate}% per annum</div></div>
                <div><label style={{ ...LBL, color: text3 }}>Loan term (years)</label><input style={INP} type="number" value={loanTerm} min={1} max={30} step={1} onChange={e => setLoanTerm(+e.target.value)} /><div style={HINT}>{loanTerm * 12} monthly payments</div></div>
                <div><label style={{ ...LBL, color: text3 }}>Down payment (%)</label><input style={INP} type="number" value={downPct} min={10} max={80} step={5} onChange={e => setDownPct(+e.target.value)} /><div style={HINT}>= {fmtNGN(priceNGN * downPct / 100)} down · loan {fmtNGN(loanNGN)}</div></div>
                <div><label style={{ ...LBL, color: text3 }}>Monthly payment</label><div style={{ ...INP, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', color: text3, display: 'flex', alignItems: 'center', borderStyle: 'dashed' }}>{fmtNGN(mortgageMonthly)}/mo</div></div>
              </div>
            </div>
          )}
          {structs.install && (
            <div style={{ background: dark ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Installment details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={{ ...LBL, color: text3 }}>Duration (months)</label><input style={INP} type="number" value={instDur} min={6} max={120} step={6} onChange={e => setInstDur(+e.target.value)} /><div style={HINT}>{(instDur / 12).toFixed(1)} years</div></div>
                <div><label style={{ ...LBL, color: text3 }}>Monthly payment</label><div style={{ ...INP, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', color: text3, display: 'flex', alignItems: 'center', borderStyle: 'dashed' }}>{fmtNGN(instMonthly)}/mo</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Assumptions */}
        <div style={CARD}>
          <STag>Assumptions — edit to match your deal</STag>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Vacancy rate (%)',       val: vacancy, set: setVacancy, step: 1, hint: 'Months empty per year as %' },
              { label: 'Operating expenses (%)', val: opExp,   set: setOpExp,   step: 1, hint: 'Maintenance, agent fees, etc.' },
              { label: 'Annual appreciation (%)',val: appPct,  set: setAppPct,  step: 1, hint: 'Conservative Lagos estimate' },
              { label: 'USD rate (₦)',           val: fx,      set: setFx,      step: 10, hint: 'Used for dollar conversion' },
            ].map(f => (
              <div key={f.label}>
                <label style={LBL}>{f.label}</label>
                <input style={INP} type="number" value={f.val} step={f.step} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
                <div style={HINT}>{f.hint}</div>
              </div>
            ))}
          </div>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 12, fontSize: 13, color: '#EF4444' }}>{error}</div>}

        <button onClick={analyze} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit' }}>
          Analyze this deal →
        </button>

        {/* Results */}
        {analysis && vs && (
          <>
            <div style={{ background: vs.bg, border: `1.5px solid ${vs.border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: vs.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>Deal assessment — {analysis.loc}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: vs.color, marginBottom: 8 }}>{vs.label}</div>
              <div style={{ fontSize: 13, color: text2, lineHeight: 1.65 }}>
                {analysis.verdict === 'viable'
                  ? `At ${pct(analysis.primary.grossYield)} gross yield and ${pct(analysis.primary.coc)} cash-on-cash return, this deal clears the core benchmarks. Net monthly income of ${fmtNGN(analysis.primary.monthlyCashFlow)} after all costs.`
                  : analysis.verdict === 'borderline'
                  ? `Yield of ${pct(analysis.primary.grossYield)} is below the 6% benchmark but cash flow is positive at ${fmtNGN(analysis.primary.monthlyCashFlow)}/month. Negotiate the price or model short-let.`
                  : `Negative cash flow of ${fmtNGN(analysis.primary.monthlyCashFlow)}/month. Rent of ${fmtNGN(analysis.monthlyRentNGN)}/month is insufficient for ${fmtNGN(analysis.priceNGN)}. Renegotiate.`}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {[
                { l: 'Gross yield',     v: pct(analysis.primary.grossYield), s: 'annual rent ÷ price',  c: analysis.primary.grossYield >= 7 ? '#22C55E' : analysis.primary.grossYield >= 5 ? '#F59E0B' : '#EF4444' },
                { l: 'Cap rate',        v: pct(analysis.primary.capRate),    s: 'NOI ÷ price',          c: '#14B8A6' },
                { l: 'Annual cash flow',v: fmtNGN(analysis.primary.annualCashFlow), s: 'net of all costs', c: analysis.primary.annualCashFlow > 0 ? '#22C55E' : '#EF4444' },
                { l: 'Price in USD',    v: fmtUSD(analysis.priceUSD),        s: `at ₦${fx.toLocaleString()}/$1`, c: '#7C5FFF' },
                { l: 'Net monthly',     v: fmtNGN(analysis.primary.monthlyCashFlow), s: 'after costs & debt', c: analysis.primary.monthlyCashFlow > 0 ? '#22C55E' : '#EF4444' },
                { l: 'CoC return',      v: pct(analysis.primary.coc),        s: 'cash-on-cash',         c: '#14B8A6' },
              ].map(m => (
                <div key={m.l} style={{ background: bg2, borderRadius: 10, padding: '0.875rem 1rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{m.l}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: m.c, lineHeight: 1.1 }}>{m.v}</div>
                  <div style={{ fontSize: '0.62rem', color: text3, marginTop: 3 }}>{m.s}</div>
                </div>
              ))}
            </div>

            {analysis.selected.length > 1 && (
              <div style={CARD}>
                <STag>Structure comparison</STag>
                {analysis.selected.map((s, i) => {
                  const isBest = s.label === analysis.primary.label
                  const sv = VS[getVerdict(s.annualCashFlow, s.coc, s.grossYield)]
                  return (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: i < analysis.selected.length - 1 ? 6 : 0, border: isBest ? '1.5px solid #5B2EFF' : `1px solid ${border}`, background: isBest ? (dark ? 'rgba(91,46,255,0.1)' : 'rgba(91,46,255,0.05)') : 'transparent' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isBest ? '#7C5FFF' : text }}>{s.label}{isBest && <span style={{ fontSize: 10, color: '#7C5FFF', marginLeft: 6 }}>BEST</span>}</div>
                        <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>{fmtNGN(s.monthlyCashFlow)}/mo · CoC {pct(s.coc)}</div>
                        {s.monthlyDebt > 0 && <div style={{ fontSize: 11, color: text3 }}>Debt: {fmtNGN(s.monthlyDebt)}/mo</div>}
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.annualCashFlow > 0 ? '#22C55E' : '#EF4444' }}>{pct(s.grossYield)}</div>
                        <div style={{ fontSize: 11, color: sv.color, fontWeight: 600 }}>{sv.label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={CARD}>
              <STag>Risk & sensitivity</STag>
              {[
                { l: 'Rent drops 10%', n: `Cash flow: ${fmtNGN(analysis.noiNGN * 0.9 - analysis.primary.monthlyDebt * 12)}/year` },
                { l: 'Vacancy increases to 20%', n: `Cash flow drops to ${fmtNGN(analysis.annualGrossNGN * 0.8 * (1 - analysis.opExpPct) - analysis.primary.monthlyDebt * 12)}/year` },
                { l: 'No appreciation (0%/yr)', n: 'Rental income unaffected. Capital gains at risk only.' },
                { l: 'NGN depreciates 15%/yr', n: `USD income falls to ${fmtUSD(analysis.annualNoiUSD * 0.85)}/year` },
              ].map(r => (
                <div key={r.l} style={{ padding: '8px 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: text, marginBottom: 2 }}>{r.l}</div>
                  <div style={{ color: text3, fontSize: 12 }}>{r.n}</div>
                </div>
              ))}
            </div>

            <div style={CARD}>
              <STag>10-year projection (cash purchase basis)</STag>
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px', gap: 4, fontSize: 11, color: text3, padding: '4px 0 8px', borderBottom: `1px solid ${border}`, marginBottom: 4 }}>
                <span>Year</span><span>Value (USD)</span><span>+Rent (USD)</span><span style={{ textAlign: 'right' }}>Total</span>
              </div>
              {[1, 3, 5, 10].map(yr => {
                let cumRentUSD = 0, propNGN = analysis.priceNGN, rate = fx
                for (let y = 1; y <= yr; y++) { propNGN *= (1 + analysis.appreciation); rate *= 1.08; cumRentUSD += (analysis.noiNGN / rate) }
                const propUSD = propNGN / rate
                const totalPct = Math.round(((propUSD + cumRentUSD - analysis.priceUSD) / analysis.priceUSD) * 100)
                return (
                  <div key={yr} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px', gap: 4, padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: text3 }}>Yr {yr}</span>
                    <span style={{ color: text2 }}>{fmtUSD(propUSD)}</span>
                    <span style={{ color: text2 }}>+{fmtUSD(cumRentUSD)}</span>
                    <span style={{ fontWeight: 700, color: totalPct >= 0 ? '#22C55E' : '#EF4444', textAlign: 'right' }}>{totalPct >= 0 ? '+' : ''}{totalPct}%</span>
                  </div>
                )
              })}
              <p style={{ fontSize: '0.65rem', color: text3, marginTop: 10, lineHeight: 1.6 }}>Assumes {appPct}%/yr NGN property appreciation and 8%/yr NGN depreciation vs USD. Guidance only.</p>
            </div>

            {/* Download button */}
            <button onClick={handleDownload} style={{ width: '100%', background: '#14B8A6', color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginBottom: 12, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span>⬇</span> Download deal report (PDF)
            </button>

            <div style={{ ...CARD, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>Find properties matching these numbers</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <Link href="/search" style={{ flex: 1, background: '#5B2EFF', color: '#fff', padding: '0.6rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, textAlign: 'center' as const, minWidth: 120 }}>Browse properties →</Link>
                <Link href="/neighborhood/lekki-phase-1" style={{ flex: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: text, padding: '0.6rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, textAlign: 'center' as const, minWidth: 120, border: `1px solid ${border}` }}>Lekki Ph 1 market →</Link>
              </div>
            </div>
          </>
        )}
      </div>

      {showGate && analysis && (
        <LoginGate
          dark={dark}
          onClose={() => setShowGate(false)}
          onSuccess={(email) => {
            setShowGate(false)
            const name = localStorage.getItem('manop_user_name') || email.split('@')[0]
            generatePDF(analysis, name)
          }}
        />
      )}

      <style>{`
        @media (max-width: 480px) {
          div[style*="grid-template-columns: 40px 1fr 1fr 60px"] { font-size: 11px !important; }
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>
    </div>
  )
}
