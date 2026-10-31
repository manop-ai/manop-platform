'use client'
// Dashboard: compare the mortgage products MANOP holds against ONE saved affordability scenario.
// Uses the buyer's saved price, deposit, loan and term; asks for residency, employment and city (not saved with the scenario) so that
// criteria that depend on them can be assessed instead of "not assessed". Never says approved, pre-qualified or best.
import { useState } from 'react'
import { compareProducts, comparisonSummary, GROUP_LABEL, type ComparedProduct } from '../lib/mortgage-comparison'
import { VERDICT_LABEL } from '../lib/finance-products'
import { fetchJson } from '../lib/fetch-json'

const naira = (n: number | null) => (n == null ? 'not available' : `₦${n.toLocaleString('en-NG')}`)

export default function MortgageComparePanel({ inputs, outputs, dark }: { inputs: Record<string, any>; outputs: Record<string, any>; dark: boolean }) {
  const loan = Number(outputs?.mortgage_requirement_ngn), years = Number(inputs?.loan_tenor_years), ltv = Number(outputs?.ltv_pct)
  const price = Number(inputs?.property_price_ngn), dep = Number(outputs?.deposit_applied_ngn ?? inputs?.deposit_available_ngn)
  const [residency, setResidency] = useState('resident'); const [employment, setEmployment] = useState(''); const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [rows, setRows] = useState<ComparedProduct[] | null>(null)
  const border = dark ? 'rgba(248,250,252,0.15)' : 'rgba(15,23,42,0.15)'

  if (!(loan > 0) || !(years > 0)) return <p style={{ fontSize: 12 }}>This scenario has no loan amount or term saved, so it cannot be compared.</p>

  async function run() {
    setBusy(true); setError('')
    const p = new URLSearchParams({ country_code: 'NG', ltv_pct: String(Math.round(ltv)), loan_tenor_years: String(years), product_type: 'mortgage', residency, loan_amount_ngn: String(Math.round(loan)) })
    if (price > 0 && dep >= 0) p.set('deposit_pct', String(Math.round((dep / price) * 100)))
    if (employment) p.set('employment', employment)
    if (city.trim()) p.set('city', city.trim())
    const r = await fetchJson(`/api/finance-products?${p}`)
    if (!r.ok) setError(r.error); else setRows(compareProducts(r.data.matches ?? [], { loanNgn: loan, tenorYears: years }))
    setBusy(false)
  }

  const groups = rows ? (['worth_asking', 'needs_more_information', 'not_current', 'does_not_fit'] as const).map(g => ({ g, items: rows.filter(x => x.group === g) })).filter(x => x.items.length) : []
  return (
    <div style={{ marginTop: 10, padding: '0.8rem', border: `1px solid ${border}` }}>
      <div style={{ fontSize: 13 }}>Loan <strong>{naira(Math.round(loan))}</strong> over <strong>{years} years</strong> (loan share {Math.round(ltv)}%).</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <label style={{ fontSize: 12 }}>Residency <select value={residency} onChange={e => setResidency(e.target.value)}><option value="resident">Resident in Nigeria</option><option value="diaspora">Diaspora</option></select></label>
        <label style={{ fontSize: 12 }}>Employment <select value={employment} onChange={e => setEmployment(e.target.value)}><option value="">Prefer not to say</option><option value="employed">Salaried</option><option value="self_employed">Self-employed</option><option value="business_owner">Business owner</option><option value="diaspora">Diaspora</option><option value="retired">Retired</option></select></label>
        <label style={{ fontSize: 12 }}>City <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Lekki" /></label>
        <button onClick={run} disabled={busy} style={{ minHeight: 34, padding: '0.25rem 0.8rem', fontWeight: 700 }}>{busy ? 'Comparing…' : 'Compare options'}</button>
      </div>
      {error && <div role="alert" style={{ color: '#EF4444', fontSize: 12 }}>{error}</div>}
      {rows && (
        <div>
          <p role="status" style={{ fontSize: 13, lineHeight: 1.5 }}>{comparisonSummary(rows)}</p>
          {groups.map(({ g, items }) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, margin: '6px 0' }}>{GROUP_LABEL[g]}</div>
              {items.map(x => (
                <div key={x.match.product.id ?? x.match.product.product_name} style={{ padding: '0.6rem', border: `1px solid ${border}`, marginBottom: 6, fontSize: 12.5 }}>
                  <div><strong>{x.match.product.lender_name}</strong>, {x.match.product.product_name} · {x.rateText}</div>
                  <div>{VERDICT_LABEL[x.match.verdict]}</div>
                  {x.monthlyLow != null && <div>Indicative repayment: {naira(x.monthlyLow)}{x.monthlyHigh != null && x.monthlyHigh !== x.monthlyLow ? ` to ${naira(x.monthlyHigh)}` : ''} a month; about {naira(x.totalLow)}{x.totalHigh != null && x.totalHigh !== x.totalLow ? ` to ${naira(x.totalHigh)}` : ''} over the term. Not a quote.</div>}
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>{x.match.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <div style={{ opacity: 0.7 }}>Source: {x.match.product.source_name}; last checked {new Date(x.match.product.last_verified_at).toLocaleDateString('en-GB')}. MANOP has not had this confirmed by the provider unless stated.</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}