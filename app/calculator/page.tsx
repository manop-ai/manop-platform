'use client'
// app/calculator/page.tsx — Manop Deal Analyzer v2
// FIXED: All internal calculations in actual NGN (not millions/thousands)
// FIXED: Dark mode controlled by theme system — full page responds
// FIXED: Monthly rent input is raw NGN, displayed cleanly
// Philosophy: Less promises. More clarity.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../lib/theme'

// ─── UNIT CONVENTION ─────────────────────────────────────────
// ALL internal values are in ACTUAL NAIRA (not millions, not thousands)
// price = 285_000_000 (₦285M)
// monthlyRent = 1_750_000 (₦1.75M/month)
// Display functions convert to readable strings

// ─── Display helpers ──────────────────────────────────────────
function fmtNGN(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `${sign}₦${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${sign}₦${(abs / 1_000).toFixed(0)}K`
  return `${sign}₦${Math.round(abs)}`
}

function fmtUSD(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${Math.round(abs)}`
}

function pct(n: number): string { return `${n.toFixed(1)}%` }

// Parse user input: "285" → 285_000_000 (assumes millions for price)
// "1.75" → 1_750_000 (assumes millions for rent)
function parseMillion(v: string): number {
  const n = parseFloat(v.replace(/[,₦\s]/g, ''))
  if (isNaN(n)) return 0
  return n * 1_000_000
}

// Mortgage payment in NGN/month
function calcMortgageMonthly(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12
  const n = years * 12
  if (r === 0 || n === 0) return principal / n
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

// ─── Types ────────────────────────────────────────────────────
interface StructResult {
  label:          string
  grossYield:     number   // %
  capRate:        number   // %
  annualCashFlow: number   // NGN
  monthlyCashFlow: number  // NGN
  coc:            number   // %
  monthlyDebt:    number   // NGN (mortgage or installment payment)
  equityIn:       number   // NGN (down payment or deposit)
}

interface Analysis {
  // inputs (all in NGN)
  priceNGN:        number
  monthlyRentNGN:  number
  annualGrossNGN:  number
  effectiveNGN:    number
  noiNGN:          number
  // USD equivalents
  priceUSD:        number
  annualNoiUSD:    number
  fx:              number
  // results
  selected:        StructResult[]
  primary:         StructResult
  verdict:         'viable' | 'borderline' | 'notviable'
  loc:             string
  propType:        string
  vacancyPct:      number
  opExpPct:        number
  appreciation:    number
}

const VERDICT_STYLES = {
  viable:     { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.4)',   color: '#22C55E', label: 'Viable'      },
  borderline: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)',  color: '#F59E0B', label: 'Borderline'  },
  notviable:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.4)',   color: '#EF4444', label: 'Not Viable'  },
}

function getVerdict(annualCF: number, coc: number, grossYield: number): 'viable' | 'borderline' | 'notviable' {
  if (grossYield >= 6 && coc >= 5 && annualCF > 0) return 'viable'
  if (grossYield >= 4 && annualCF > 0)              return 'borderline'
  return 'notviable'
}

// ─── Report Modal ─────────────────────────────────────────────
function ReportModal({ a, onClose, dark }: { a: Analysis; onClose: () => void; dark: boolean }) {
  const vs = VERDICT_STYLES[a.verdict]
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(15,23,42,0.07)', fontSize: 13 }}>
      <span style={{ color: 'rgba(15,23,42,0.55)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: highlight || '#0F172A' }}>{value}</span>
    </div>
  )

  const STitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '16px 0 8px', paddingBottom: 4, borderBottom: '1.5px solid #5B2EFF' }}>{children}</div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, overflowY: 'auto', padding: '1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, margin: 'auto', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#5B2EFF', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>M</div>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>Manop Deal Report</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>manopintel.com · {today}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', background: '#fff', color: '#0F172A' }}>
          {/* Verdict banner */}
          <div style={{ background: vs.bg, border: `1.5px solid ${vs.border}`, borderRadius: 10, padding: '1rem', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: vs.color, marginBottom: 4 }}>Assessment · {a.loc}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: vs.color, marginBottom: 6 }}>{vs.label}</div>
            <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.6)', lineHeight: 1.6 }}>
              {a.verdict === 'viable'
                ? `Gross yield ${pct(a.primary.grossYield)} · CoC return ${pct(a.primary.coc)} · Net monthly income ${fmtNGN(a.primary.monthlyCashFlow)}`
                : a.verdict === 'borderline'
                ? `Yield ${pct(a.primary.grossYield)} is below 6% benchmark. Positive cash flow of ${fmtNGN(a.primary.monthlyCashFlow)}/month — negotiate price or explore short-let.`
                : `Negative cash flow of ${fmtNGN(a.primary.monthlyCashFlow)}/month under current inputs. Price too high or rent too low.`
              }
            </div>
          </div>

          <STitle>Property details</STitle>
          <Row label="Location" value={a.loc} />
          <Row label="Property type" value={a.propType} />
          <Row label="Purchase price" value={fmtNGN(a.priceNGN)} />
          <Row label="Price in USD" value={fmtUSD(a.priceUSD)} />
          <Row label="Monthly rent estimate" value={fmtNGN(a.monthlyRentNGN)} />
          <Row label="Annual gross rent" value={fmtNGN(a.annualGrossNGN)} />

          <STitle>Financial analysis</STitle>
          <Row label="Gross yield" value={pct(a.primary.grossYield)} highlight={a.primary.grossYield >= 7 ? '#22C55E' : a.primary.grossYield >= 5 ? '#F59E0B' : '#EF4444'} />
          <Row label="Cap rate" value={pct(a.primary.capRate)} />
          <Row label="Annual net operating income" value={fmtNGN(a.noiNGN)} />
          <Row label="Annual cash flow (after debt)" value={fmtNGN(a.primary.annualCashFlow)} />
          <Row label="Net monthly income" value={`${fmtNGN(a.primary.monthlyCashFlow)}/month`} highlight={a.primary.monthlyCashFlow > 0 ? '#22C55E' : '#EF4444'} />
          <Row label="Cash-on-cash return" value={pct(a.primary.coc)} />
          <Row label="Annual income in USD" value={`${fmtUSD(a.annualNoiUSD)}/year`} />

          {a.selected.length > 1 && (
            <>
              <STitle>Structure comparison</STitle>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(15,23,42,0.1)' }}>
                    {['Structure', 'Monthly income', 'Yield', 'CoC', 'Verdict'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Structure' ? 'left' : 'right', padding: '4px 4px', color: 'rgba(15,23,42,0.5)', fontSize: 11, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.selected.map(s => {
                    const v = getVerdict(s.annualCashFlow, s.coc, s.grossYield)
                    const vc = VERDICT_STYLES[v]
                    return (
                      <tr key={s.label} style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
                        <td style={{ padding: '5px 4px', fontWeight: 600 }}>{s.label}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>{fmtNGN(s.monthlyCashFlow)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>{pct(s.grossYield)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>{pct(s.coc)}</td>
                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                          <span style={{ background: vc.bg, color: vc.color, padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{vc.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}

          <STitle>Assumptions</STitle>
          <Row label="Vacancy rate" value={pct(a.vacancyPct * 100)} />
          <Row label="Operating expenses" value={pct(a.opExpPct * 100)} />
          <Row label="Annual appreciation" value={pct(a.appreciation * 100)} />
          <Row label="NGN/USD rate" value={`₦${a.fx.toLocaleString()}/$1`} />

          <div style={{ marginTop: 16, padding: '10px', background: 'rgba(15,23,42,0.04)', borderRadius: 8, fontSize: 11, color: 'rgba(15,23,42,0.5)', lineHeight: 1.6 }}>
            Generated by Manop — Africa's property intelligence platform. All figures are estimates based on inputs. Not financial advice. Conduct independent due diligence before investing.
          </div>
        </div>
      </div>
    </div>
  )
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
  // ── Theme ──────────────────────────────────────────────────
  const [dark, setDark] = useState(true)
  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // ── Inputs — all prices in millions (user-facing), converted internally ──
  const [priceM,     setPriceM]     = useState('285')        // ₦M
  const [rentM,      setRentM]      = useState('1.75')       // ₦M/month
  const [location,   setLocation]   = useState('')
  const [propType,   setPropType]   = useState('Duplex')
  const [structs,    setStructs]    = useState({ cash: true, loan: true, install: false })
  const [intRate,    setIntRate]    = useState(18)
  const [loanTerm,   setLoanTerm]   = useState(15)
  const [downPct,    setDownPct]    = useState(30)
  const [instDur,    setInstDur]    = useState(24)
  const [vacancy,    setVacancy]    = useState(10)
  const [opExp,      setOpExp]      = useState(25)
  const [appreciationPct, setApp]   = useState(8)
  const [fx,         setFx]         = useState(1570)
  const [analysis,   setAnalysis]   = useState<Analysis | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [error,      setError]      = useState('')

  // ── Derived display values ──────────────────────────────────
  const priceNGN      = parseMillion(priceM)
  const monthlyNGN    = parseMillion(rentM)
  const loanNGN       = priceNGN * (1 - downPct / 100)
  const mortgageMonthly = calcMortgageMonthly(loanNGN, intRate, loanTerm)
  const instMonthly   = priceNGN / instDur

  // ── Styles ──────────────────────────────────────────────────
  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'

  const CARD: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 12 }
  const INP:  React.CSSProperties = { width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.9rem', padding: '0.65rem 0.875rem', outline: 'none', fontFamily: 'inherit' }
  const LBL:  React.CSSProperties = { fontSize: '0.72rem', color: text2, marginBottom: '0.35rem', display: 'block', fontWeight: 500 }
  const HINT: React.CSSProperties = { fontSize: '0.62rem', color: text3, marginTop: '0.25rem' }
  const STAG: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }

  function STag({ children }: { children: React.ReactNode }) {
    return <div style={STAG}><div style={{ width: 12, height: 2, background: '#14B8A6' }} />{children}</div>
  }

  // ── Calculation ─────────────────────────────────────────────
  function analyze() {
    setError('')
    if (!priceNGN || priceNGN < 1_000_000) { setError('Enter a valid purchase price (e.g. 285 for ₦285M)'); return }
    if (!monthlyNGN || monthlyNGN < 10_000) { setError('Enter a valid monthly rent (e.g. 1.75 for ₦1.75M/month)'); return }
    if (!location)                           { setError('Select a location'); return }
    if (!structs.cash && !structs.loan && !structs.install) { setError('Select at least one financing structure'); return }

    // Core income math — all in NGN
    const annualGrossNGN = monthlyNGN * 12
    const effectiveNGN   = annualGrossNGN * (1 - vacancy / 100)
    const noiNGN         = effectiveNGN * (1 - opExp / 100)

    // Structure results
    const selected: StructResult[] = []

    if (structs.cash) {
      const annualCF = noiNGN
      selected.push({
        label: 'Cash',
        grossYield: (annualGrossNGN / priceNGN) * 100,
        capRate:    (noiNGN / priceNGN) * 100,
        annualCashFlow: annualCF,
        monthlyCashFlow: annualCF / 12,
        coc: (noiNGN / priceNGN) * 100,
        monthlyDebt: 0,
        equityIn: priceNGN,
      })
    }

    if (structs.loan) {
      const downNGN    = priceNGN * (downPct / 100)
      const annualDebt = mortgageMonthly * 12
      const annualCF   = noiNGN - annualDebt
      selected.push({
        label: 'Mortgage',
        grossYield: (annualGrossNGN / priceNGN) * 100,
        capRate:    (noiNGN / priceNGN) * 100,
        annualCashFlow: annualCF,
        monthlyCashFlow: annualCF / 12,
        coc: downNGN > 0 ? (annualCF / downNGN) * 100 : 0,
        monthlyDebt: mortgageMonthly,
        equityIn: downNGN,
      })
    }

    if (structs.install) {
      const depositNGN = priceNGN * 0.3
      const annualInst = instMonthly * 12
      const annualCF   = noiNGN - annualInst
      selected.push({
        label: 'Installment',
        grossYield: (annualGrossNGN / priceNGN) * 100,
        capRate:    (noiNGN / priceNGN) * 100,
        annualCashFlow: annualCF,
        monthlyCashFlow: annualCF / 12,
        coc: depositNGN > 0 ? (annualCF / depositNGN) * 100 : 0,
        monthlyDebt: instMonthly,
        equityIn: depositNGN,
      })
    }

    // Best structure = highest CoC
    const primary = selected.reduce((best, s) => s.coc > best.coc ? s : best, selected[0])
    const verdict = getVerdict(primary.annualCashFlow, primary.coc, primary.grossYield)

    setAnalysis({
      priceNGN, monthlyRentNGN: monthlyNGN,
      annualGrossNGN, effectiveNGN, noiNGN,
      priceUSD: priceNGN / fx,
      annualNoiUSD: noiNGN / fx,
      fx, selected, primary, verdict,
      loc: location, propType,
      vacancyPct: vacancy / 100,
      opExpPct:   opExp / 100,
      appreciation: appreciationPct / 100,
    })
    setShowReport(false)
  }

  const toggleStruct = (k: keyof typeof structs) => setStructs(p => ({ ...p, [k]: !p[k] }))

  const TogBtn = ({ k, label }: { k: keyof typeof structs; label: string }) => (
    <button onClick={() => toggleStruct(k)} style={{
      padding: '0.45rem 1rem', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
      border: `1px solid ${structs[k] ? '#5B2EFF' : border}`,
      background: structs[k] ? '#5B2EFF' : 'transparent',
      color: structs[k] ? '#fff' : text2, fontWeight: structs[k] ? 600 : 400,
    }}>{label}</button>
  )

  const vs = analysis ? VERDICT_STYLES[analysis.verdict] : null

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s, color 0.3s' }}>

      {/* Hero */}
      <div style={{ background: '#5B2EFF', padding: '1.5rem 1.25rem 2rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', textDecoration: 'none', display: 'block', marginBottom: 12 }}>← Manop</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>M</div>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 6 }}>Deal Analyzer</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, maxWidth: 480 }}>
            Is this deal viable? Enter any property and Manop analyses cash, loan, or installment — then gives you a clear verdict and a shareable report.
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
              <input style={INP} type="number" value={priceM} min="1" step="1"
                onChange={e => setPriceM(e.target.value)} placeholder="e.g. 285" />
              <div style={HINT}>Enter in millions — 285 = ₦285,000,000</div>
            </div>
            <div>
              <label style={LBL}>Monthly rent estimate (₦M)</label>
              <input style={INP} type="number" value={rentM} min="0.01" step="0.05"
                onChange={e => setRentM(e.target.value)} placeholder="e.g. 1.75" />
              <div style={HINT}>
                {monthlyNGN > 0 ? `= ${fmtNGN(monthlyNGN)}/month · ${fmtNGN(monthlyNGN * 12)}/year` : 'Enter in millions — 1.75 = ₦1,750,000/month'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={LBL}>Location</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={location} onChange={e => setLocation(e.target.value)}>
                <option value="">Select area</option>
                {LOCATIONS.filter(l => l).map(l => <option key={l}>{l}</option>)}
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
            <TogBtn k="cash"    label="Cash" />
            <TogBtn k="loan"    label="Mortgage / Loan" />
            <TogBtn k="install" label="Installment" />
          </div>

          {structs.loan && (
            <div style={{ background: dark ? 'rgba(91,46,255,0.08)' : 'rgba(91,46,255,0.05)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 10, padding: '1rem', marginBottom: structs.install ? 8 : 0 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Loan details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Interest rate (%)', val: intRate,  set: setIntRate, min: 1, max: 40, step: 0.5, hint: `${intRate}% per annum` },
                  { label: 'Loan term (years)', val: loanTerm, set: setLoanTerm, min: 1, max: 30, step: 1,   hint: `${loanTerm * 12} monthly payments` },
                  { label: 'Down payment (%)',  val: downPct,  set: setDownPct, min: 10, max: 80, step: 5,  hint: `= ${fmtNGN(loanNGN * downPct / (100 - downPct))} down` },
                  { label: 'Loan amount (auto)', val: null, set: () => {}, min: 0, max: 0, step: 0, hint: `Monthly payment ≈ ${fmtNGN(mortgageMonthly)}/month` },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ ...LBL, color: text3 }}>{f.label}</label>
                    {f.val !== null
                      ? <input style={INP} type="number" value={f.val} min={f.min} max={f.max} step={f.step} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
                      : <div style={{ ...INP, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', color: text3, display: 'flex', alignItems: 'center', borderStyle: 'dashed' }}>{fmtNGN(loanNGN)}</div>
                    }
                    <div style={HINT}>{f.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {structs.install && (
            <div style={{ background: dark ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.2)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Installment details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...LBL, color: text3 }}>Duration (months)</label>
                  <input style={INP} type="number" value={instDur} min={6} max={120} step={6} onChange={e => setInstDur(parseInt(e.target.value) || 24)} />
                  <div style={HINT}>{instDur} months = {(instDur / 12).toFixed(1)} years</div>
                </div>
                <div>
                  <label style={{ ...LBL, color: text3 }}>Monthly payment (auto)</label>
                  <div style={{ ...INP, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', color: text3, display: 'flex', alignItems: 'center', borderStyle: 'dashed' }}>{fmtNGN(instMonthly)}</div>
                  <div style={HINT}>= {fmtNGN(instMonthly * 12)}/year</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Assumptions */}
        <div style={CARD}>
          <STag>Assumptions — edit to match your deal</STag>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Vacancy rate (%)',      val: vacancy,         set: setVacancy,  hint: 'Months empty per year as %' },
              { label: 'Operating expenses (%)', val: opExp,           set: setOpExp,    hint: 'Maintenance, agent fees, etc.' },
              { label: 'Annual appreciation (%)', val: appreciationPct, set: setApp,      hint: 'Conservative Lagos estimate' },
              { label: 'USD rate (₦)',           val: fx,              set: setFx,       hint: 'Used for dollar conversion' },
            ].map(f => (
              <div key={f.label}>
                <label style={LBL}>{f.label}</label>
                <input style={INP} type="number" value={f.val} step={f.label.includes('USD') ? 10 : 1} onChange={e => f.set(parseFloat(e.target.value) || 0)} />
                <div style={HINT}>{f.hint}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 12, fontSize: 13, color: '#EF4444' }}>
            {error}
          </div>
        )}

        {/* Analyze button */}
        <button onClick={analyze} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 12, padding: '1rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit', letterSpacing: '0.01em' }}>
          Analyze this deal →
        </button>

        {/* Results */}
        {analysis && vs && (
          <>
            {/* Verdict */}
            <div style={{ background: vs.bg, border: `1.5px solid ${vs.border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: vs.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
                Deal assessment — {analysis.loc}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: vs.color, marginBottom: 6 }}>{vs.label}</div>
              <div style={{ fontSize: 13, color: text2, lineHeight: 1.65 }}>
                {analysis.verdict === 'viable'
                  ? `At ${pct(analysis.primary.grossYield)} gross yield and ${pct(analysis.primary.coc)} cash-on-cash return, this deal clears the core benchmarks. Net monthly income of ${fmtNGN(analysis.primary.monthlyCashFlow)} after all costs.`
                  : analysis.verdict === 'borderline'
                  ? `Yield of ${pct(analysis.primary.grossYield)} is below the 6% benchmark. Positive cash flow of ${fmtNGN(analysis.primary.monthlyCashFlow)}/month — negotiate the price or model short-let before committing.`
                  : `Negative cash flow of ${fmtNGN(analysis.primary.monthlyCashFlow)}/month. Rent of ${fmtNGN(analysis.monthlyRentNGN)}/month is insufficient for the price of ${fmtNGN(analysis.priceNGN)}. Renegotiate or find a different property.`
                }
              </div>
            </div>

            {/* Key metrics — 2×3 grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Gross yield',     value: pct(analysis.primary.grossYield), sub: 'annual rent ÷ price',    color: analysis.primary.grossYield >= 7 ? '#22C55E' : analysis.primary.grossYield >= 5 ? '#F59E0B' : '#EF4444' },
                { label: 'Cap rate',        value: pct(analysis.primary.capRate),    sub: 'NOI ÷ price',            color: '#14B8A6' },
                { label: 'Annual cash flow',value: fmtNGN(analysis.primary.annualCashFlow), sub: 'net of all costs', color: analysis.primary.annualCashFlow > 0 ? '#22C55E' : '#EF4444' },
                { label: 'Price in USD',    value: fmtUSD(analysis.priceUSD),        sub: `at ₦${fx.toLocaleString()}/$1`, color: '#7C5FFF' },
                { label: 'Net monthly',     value: fmtNGN(analysis.primary.monthlyCashFlow), sub: 'after costs & debt', color: analysis.primary.monthlyCashFlow > 0 ? '#22C55E' : '#EF4444' },
                { label: 'CoC return',      value: pct(analysis.primary.coc),        sub: 'cash-on-cash',           color: '#14B8A6' },
              ].map(m => (
                <div key={m.label} style={{ background: dark ? '#1E293B' : '#F1F5F9', borderRadius: 10, padding: '0.875rem 1rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: m.color, lineHeight: 1.1 }}>{m.value}</div>
                  <div style={{ fontSize: '0.62rem', color: text3, marginTop: 3 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Structure comparison (if multiple) */}
            {analysis.selected.length > 1 && (
              <div style={CARD}>
                <STag>Structure comparison</STag>
                {analysis.selected.map((s, i) => {
                  const isBest = s.label === analysis.primary.label
                  const sv = getVerdict(s.annualCashFlow, s.coc, s.grossYield)
                  return (
                    <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: i < analysis.selected.length - 1 ? 6 : 0, border: isBest ? '1.5px solid #5B2EFF' : `1px solid ${border}`, background: isBest ? (dark ? 'rgba(91,46,255,0.1)' : 'rgba(91,46,255,0.05)') : 'transparent' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isBest ? '#7C5FFF' : text }}>{s.label}{isBest && <span style={{ fontSize: 10, fontWeight: 600, color: '#7C5FFF', marginLeft: 6 }}>BEST</span>}</div>
                        <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>Monthly: {fmtNGN(s.monthlyCashFlow)} · CoC: {pct(s.coc)}</div>
                        {s.monthlyDebt > 0 && <div style={{ fontSize: 11, color: text3 }}>Debt: {fmtNGN(s.monthlyDebt)}/month</div>}
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.annualCashFlow > 0 ? '#22C55E' : '#EF4444' }}>{pct(s.grossYield)}</div>
                        <div style={{ fontSize: 11, color: VERDICT_STYLES[sv].color, fontWeight: 600 }}>{VERDICT_STYLES[sv].label}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Risk & sensitivity */}
            <div style={CARD}>
              <STag>Risk & sensitivity</STag>
              {[
                { l: 'Rent drops 10%',           note: `Cash flow: ${fmtNGN(analysis.noiNGN * 0.9 - analysis.primary.monthlyDebt * 12)}/year` },
                { l: 'Vacancy increases to 20%', note: `Cash flow: ${fmtNGN(analysis.annualGrossNGN * 0.8 * (1 - analysis.opExpPct) - analysis.primary.monthlyDebt * 12)}/year` },
                { l: 'No appreciation (0%/yr)',  note: 'Rental income unaffected. Capital gains at risk only.' },
                { l: 'NGN depreciates 15%/yr',   note: `USD income falls to ${fmtUSD(analysis.annualNoiUSD * 0.85)}/year` },
              ].map(r => (
                <div key={r.l} style={{ padding: '8px 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: text, marginBottom: 2 }}>{r.l}</div>
                  <div style={{ color: text3, fontSize: 12 }}>{r.note}</div>
                </div>
              ))}
            </div>

            {/* 10-year projection */}
            <div style={CARD}>
              <STag>10-year projection (cash purchase basis)</STag>
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px', gap: 4, fontSize: 11, color: text3, padding: '4px 0 8px', borderBottom: `1px solid ${border}`, marginBottom: 4 }}>
                <span>Year</span><span>Value (USD)</span><span>+Rent (USD)</span><span style={{ textAlign: 'right' }}>Total</span>
              </div>
              {[1, 3, 5, 10].map(yr => {
                let cumRentUSD = 0
                let propNGN = analysis.priceNGN
                let rate = fx
                for (let y = 1; y <= yr; y++) {
                  propNGN  *= (1 + analysis.appreciation)
                  rate     *= 1.08   // 8%/yr NGN depreciation
                  cumRentUSD += (analysis.noiNGN / rate)
                }
                const propUSD = propNGN / rate
                const totalUSD = propUSD + cumRentUSD
                const totalPct = Math.round(((totalUSD - analysis.priceUSD) / analysis.priceUSD) * 100)
                return (
                  <div key={yr} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px', gap: 4, padding: '7px 0', borderBottom: `1px solid ${border}`, fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: text3 }}>Yr {yr}</span>
                    <span style={{ color: text2 }}>{fmtUSD(propUSD)}</span>
                    <span style={{ color: text2 }}>+{fmtUSD(cumRentUSD)}</span>
                    <span style={{ fontWeight: 700, color: totalPct >= 0 ? '#22C55E' : '#EF4444', textAlign: 'right' }}>{totalPct >= 0 ? '+' : ''}{totalPct}%</span>
                  </div>
                )
              })}
              <p style={{ fontSize: '0.65rem', color: text3, marginTop: 10, lineHeight: 1.6 }}>
                Assumes {appreciationPct}%/yr NGN property appreciation and 8%/yr NGN depreciation vs USD. Guidance only.
              </p>
            </div>

            {/* Generate report */}
            <button onClick={() => setShowReport(true)} style={{ width: '100%', background: 'transparent', border: '1.5px solid #14B8A6', color: '#14B8A6', borderRadius: 12, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}>
              Generate shareable report →
            </button>

            {/* Find properties CTA */}
            <div style={{ ...CARD, display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              <div style={{ fontWeight: 700, color: text }}>Find properties matching these numbers</div>
              <div style={{ fontSize: 13, color: text2 }}>Browse verified listings — each with yield and cap rate already computed.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <Link href="/search" style={{ flex: 1, background: '#5B2EFF', color: '#fff', padding: '0.6rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, textAlign: 'center' as const, minWidth: 120 }}>Browse properties →</Link>
                <Link href="/neighborhood/lekki-phase-1" style={{ flex: 1, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: text, padding: '0.6rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, textAlign: 'center' as const, minWidth: 120, border: `1px solid ${border}` }}>Lekki Ph 1 →</Link>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Report modal */}
      {showReport && analysis && (
        <ReportModal a={analysis} onClose={() => setShowReport(false)} dark={dark} />
      )}

      <style>{`
        @media (max-width: 480px) {
          div[style*="grid-template-columns: 40px 1fr 1fr 60px"] { font-size: 11px !important; }
          div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        select option { background: #162032; }
      `}</style>
    </div>
  )
}
