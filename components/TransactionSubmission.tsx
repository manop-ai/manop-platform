'use client'
// components/TransactionSubmission.tsx
// Agency dashboard tab: "Submit sales history"
// Agencies submit their verified sold transactions
// Manop reviews manually before marking verified
// This feeds the intelligence layer — separate from listings

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Ikoyi','Victoria Island',
  'Eko Atlantic','Banana Island','Ajah','Chevron','Ikota',
  'Gbagada','Ikeja GRA','Maitama, Abuja','Asokoro, Abuja',
  'East Legon, Accra','Westlands, Nairobi','Other',
]

interface Props {
  partnerId:  string
  agencyName: string
  dark:       boolean
}

interface TxRow {
  id:           string
  neighborhood: string
  bedrooms:     string
  askingPriceM: string
  soldPriceM:   string
  soldDate:     string
  daysOnMarket: string
  annualRentM:  string
  evidenceType: string
}

function newRow(): TxRow {
  return {
    id:           Math.random().toString(36).slice(2),
    neighborhood: '',
    bedrooms:     '3',
    askingPriceM: '',
    soldPriceM:   '',
    soldDate:     '',
    daysOnMarket: '',
    annualRentM:  '',
    evidenceType: 'agent_confirmed',
  }
}

export default function TransactionSubmission({ partnerId, agencyName, dark }: Props) {
  const [rows,     setRows]     = useState<TxRow[]>([newRow()])
  const [saving,   setSaving]   = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [error,    setError]    = useState('')

  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 7, color: text,
    fontSize: '0.8rem', padding: '0.5rem 0.7rem', outline: 'none', fontFamily: 'inherit',
  }

  function updateRow(id: string, field: keyof TxRow, val: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.neighborhood && r.soldPriceM && r.soldDate && r.bedrooms)
    if (valid.length === 0) { setError('Fill in at least one complete row — neighborhood, sold price, date, and bedrooms are required'); return }

    setSaving(true); setError('')
    try {
      const inserts = valid.map(r => ({
        neighborhood:        r.neighborhood,
        city:                r.neighborhood.includes('Abuja') ? 'Abuja' : r.neighborhood.includes('Accra') ? 'Accra' : r.neighborhood.includes('Nairobi') ? 'Nairobi' : 'Lagos',
        country_code:        r.neighborhood.includes('Accra') ? 'GH' : r.neighborhood.includes('Nairobi') ? 'KE' : 'NG',
        bedrooms:            parseInt(r.bedrooms) || null,
        asking_price:        r.askingPriceM ? Math.round(parseFloat(r.askingPriceM) * 1e6) : null,
        sold_price:          Math.round(parseFloat(r.soldPriceM) * 1e6),
        currency_code:       'NGN',
        sold_at:             r.soldDate,
        days_on_market:      r.daysOnMarket ? parseInt(r.daysOnMarket) : null,
        annual_rent:         r.annualRentM ? Math.round(parseFloat(r.annualRentM) * 1e6) : null,
        submitted_by:        partnerId,
        verification_status: 'pending',
        evidence_type:       r.evidenceType,
        raw_data:            { submitted_by_agency: agencyName, submitted_at: new Date().toISOString() },
      }))

      const { error: dbErr } = await sb.from('market_transactions').insert(inserts)
      if (dbErr) throw new Error(dbErr.message)

      // Log signal
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'transaction_submitted',
          metadata: { agency: agencyName, count: inserts.length, partner_id: partnerId },
        }),
      }).catch(() => {})

      setSuccess(true)
    } catch (e: any) {
      setError(e.message || 'Failed to submit')
    } finally {
      setSaving(false)
    }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#22C55E' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Submitted — thank you</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
        Your transactions are under review. Manop verifies each record before it feeds into market intelligence. This usually takes 24–48 hours. Verified data strengthens benchmarks for the whole platform.
      </div>
      <button onClick={() => { setSuccess(false); setRows([newRow()]) }} style={{ marginTop: 16, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Submit more →
      </button>
    </div>
  )

  return (
    <div>
      {/* Explanation */}
      <div style={{ background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.18)', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#7C5FFF', marginBottom: 6 }}>Why submit transaction data?</div>
        <div style={{ fontSize: 12, color: text2, lineHeight: 1.6 }}>
          Manop's intelligence — yield, cap rate, PropLens verdict — becomes more accurate with verified sold prices.
          Your transaction data is <strong>kept confidential</strong> and only used to compute
          neighborhood-level benchmarks. No individual deal is ever shown publicly.
          Agencies that contribute data get a <strong>verified data contributor badge</strong> on all their listings.
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr auto', gap: 6, marginBottom: 6 }}>
        {['Neighborhood', 'Beds', 'Asking (₦M)', 'Sold (₦M) *', 'Date sold *', 'Days on mkt', 'Evidence', ''].map(h => (
          <div key={h} style={{ fontSize: '0.62rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          <select style={{ ...INP, cursor: 'pointer' }} value={row.neighborhood} onChange={e => updateRow(row.id, 'neighborhood', e.target.value)}>
            <option value="">Select</option>
            {NEIGHBORHOODS.map(n => <option key={n}>{n}</option>)}
          </select>
          <select style={{ ...INP, cursor: 'pointer' }} value={row.bedrooms} onChange={e => updateRow(row.id, 'bedrooms', e.target.value)}>
            {['1','2','3','4','5','6'].map(n => <option key={n}>{n}</option>)}
          </select>
          <input style={INP} type="number" placeholder="e.g. 300" value={row.askingPriceM} onChange={e => updateRow(row.id, 'askingPriceM', e.target.value)} />
          <input style={{ ...INP, border: `1px solid ${row.soldPriceM ? border : 'rgba(239,68,68,0.4)'}` }} type="number" placeholder="e.g. 260 *" value={row.soldPriceM} onChange={e => updateRow(row.id, 'soldPriceM', e.target.value)} />
          <input style={{ ...INP, border: `1px solid ${row.soldDate ? border : 'rgba(239,68,68,0.4)'}` }} type="date" value={row.soldDate} onChange={e => updateRow(row.id, 'soldDate', e.target.value)} />
          <input style={INP} type="number" placeholder="e.g. 45" value={row.daysOnMarket} onChange={e => updateRow(row.id, 'daysOnMarket', e.target.value)} />
          <select style={{ ...INP, cursor: 'pointer' }} value={row.evidenceType} onChange={e => updateRow(row.id, 'evidenceType', e.target.value)}>
            <option value="agent_confirmed">Agent confirmed</option>
            <option value="deed_of_assignment">Deed of Assignment</option>
            <option value="bank_confirmation">Bank confirmation</option>
            <option value="client_testimony">Client testimony</option>
          </select>
          <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))} disabled={rows.length === 1} style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, color: '#EF4444', cursor: 'pointer', padding: '0.4rem 0.6rem', fontSize: 13 }}>×</button>
        </div>
      ))}

      <button onClick={() => setRows(prev => [...prev, newRow()])} style={{ fontSize: 12, color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 7, padding: '0.4rem 0.875rem', cursor: 'pointer', marginBottom: 16 }}>
        + Add another transaction
      </button>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}

      <button onClick={handleSubmit} disabled={saving} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Submitting…' : `Submit ${rows.filter(r => r.neighborhood && r.soldPriceM).length} transaction${rows.filter(r => r.neighborhood && r.soldPriceM).length !== 1 ? 's' : ''} for review →`}
      </button>

      <p style={{ fontSize: 11, color: text3, marginTop: 10, lineHeight: 1.6, textAlign: 'center' as const }}>
        * Required fields. All data is kept confidential. Only neighborhood-level aggregates are ever shown publicly. Manop reviews every submission before it goes into the intelligence layer.
      </p>
    </div>
  )
}