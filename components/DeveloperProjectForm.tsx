'use client'
// components/DeveloperProjectForm.tsx
//
// The developer's own "new development" form. It replaces an inline form on
// /developer/dashboard that rendered only the name input while its validation required a
// location and total units (so it could never succeed).
//
// Save draft and Submit for review both go through POST /api/developer/projects, which checks
// ownership on the server and never publishes. Optional fields stay optional.

import { useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'
import { DEV_STAGES } from '../lib/developer-project'

export interface ExistingProject {
  id: string
  name: string
  neighborhood?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  stage?: string | null
  total_units?: number | null
  handover_date?: string | null
  description?: string | null
  unit_types?: { unit_type: string; price_ngn: number | null; size_sqm?: number | null; available_count?: number | null; deposit_pct?: number | null; installment_months?: number | null }[]
}

interface UnitRow { unit_type: string; price_ngn: string; size_sqm: string; available_count: string; deposit_pct: string; installment_months: string }
const blankUnit = (): UnitRow => ({ unit_type: '', price_ngn: '', size_sqm: '', available_count: '', deposit_pct: '', installment_months: '' })
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

interface Props {
  dark?: boolean
  existing?: ExistingProject | null
  onDone: (result: { id: string; status: 'draft' | 'pending_review' }) => void
  onCancel?: () => void
}

export default function DeveloperProjectForm({ dark = true, existing = null, onDone, onCancel }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [neighborhood, setNeighborhood] = useState(existing?.neighborhood ?? '')
  const [city, setCity] = useState(existing?.city ?? 'Lagos')
  const [state, setState] = useState(existing?.state ?? '')
  const [stage, setStage] = useState(existing?.stage ?? 'Foundation')
  const [totalUnits, setTotalUnits] = useState(s(existing?.total_units))
  const [handover, setHandover] = useState(existing?.handover_date ? existing.handover_date.slice(0, 10) : '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [units, setUnits] = useState<UnitRow[]>(
    existing?.unit_types?.length
      ? existing.unit_types.map(u => ({ unit_type: u.unit_type, price_ngn: s(u.price_ngn), size_sqm: s(u.size_sqm), available_count: s(u.available_count), deposit_pct: s(u.deposit_pct), installment_months: s(u.installment_months) }))
      : [],
  )
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null)

  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.12)'
  const INP: React.CSSProperties = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.875rem', outline: 'none', padding: '0.6rem 0.8rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
  const LBL: React.CSSProperties = { fontSize: 12, color: text2, display: 'block', marginBottom: 4 }
  const btn = (primary: boolean): React.CSSProperties => ({ borderRadius: 9, padding: '0.75rem 1.1rem', fontSize: '0.88rem', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit', background: primary ? '#F59E0B' : 'transparent', color: primary ? '#0F172A' : text2, border: primary ? 'none' : `1px solid ${border}` })

  const setUnit = (i: number, k: keyof UnitRow, v: string) => setUnits(prev => prev.map((u, j) => (j === i ? { ...u, [k]: v } : u)))

  async function send(action: 'save' | 'submit') {
    setError(''); setNotice('')
    if (!name.trim()) { setError('Development name is required.'); return }
    if (!neighborhood.trim()) { setError('Location is required: enter the neighbourhood or area.'); return }
    setBusy(action)
    try {
      const res = await authedFetch('/api/developer/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, id: savedId ?? undefined,
          project: { name, neighborhood, city, state, stage, total_units: totalUnits, handover_date: handover || null, description },
          units,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'That could not be saved. Nothing was submitted.'); return }
      setSavedId(j.id)
      setNotice(action === 'submit' ? 'Submitted for MANOP review. It is not published until MANOP approves it.' : 'Draft saved. You can reopen and edit it from Projects.')
      onDone({ id: j.id, status: j.status })
    } catch {
      setError('Network error. Nothing was submitted; please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={LBL} htmlFor="dp-name">Development name *</label>
          <input id="dp-name" style={INP} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Lekki Waterfront" />
        </div>
        <div>
          <label style={LBL} htmlFor="dp-nbhd">Location (neighbourhood or area) *</label>
          <input id="dp-nbhd" style={INP} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="e.g. Lekki Phase 1" />
        </div>
        <div>
          <label style={LBL} htmlFor="dp-city">City</label>
          <input id="dp-city" style={INP} value={city} onChange={e => setCity(e.target.value)} />
        </div>
        <div>
          <label style={LBL} htmlFor="dp-state">State</label>
          <input id="dp-state" style={INP} value={state} onChange={e => setState(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label style={LBL} htmlFor="dp-stage">Construction stage</label>
          <select id="dp-stage" style={{ ...INP, cursor: 'pointer' }} value={stage} onChange={e => setStage(e.target.value)}>
            {DEV_STAGES.map(x => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL} htmlFor="dp-units">Total units (leave blank for land)</label>
          <input id="dp-units" style={INP} type="number" min={1} value={totalUnits} onChange={e => setTotalUnits(e.target.value)} />
        </div>
        <div>
          <label style={LBL} htmlFor="dp-handover">Expected handover</label>
          <input id="dp-handover" style={INP} type="date" value={handover} onChange={e => setHandover(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={LBL} htmlFor="dp-desc">Description</label>
          <textarea id="dp-desc" style={{ ...INP, minHeight: 80 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional. What MANOP and buyers should know." />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: text2, marginBottom: 6 }}>Unit types (optional)</div>
        <div style={{ fontSize: 11.5, color: text2, marginBottom: 8, lineHeight: 1.5 }}>
          Leave a price blank if it is not confirmed; it will show as not supplied, never as zero.
        </div>
        {units.map((u, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${border}` }}>
            <input aria-label="Unit type" style={INP} placeholder="e.g. 2-bedroom apartment" value={u.unit_type} onChange={e => setUnit(i, 'unit_type', e.target.value)} />
            <input aria-label="Price in naira" style={INP} type="number" min={0} placeholder="Price (₦)" value={u.price_ngn} onChange={e => setUnit(i, 'price_ngn', e.target.value)} />
            <input aria-label="Size in square metres" style={INP} type="number" min={0} placeholder="Size (sqm)" value={u.size_sqm} onChange={e => setUnit(i, 'size_sqm', e.target.value)} />
            <input aria-label="Units available" style={INP} type="number" min={0} placeholder="Available" value={u.available_count} onChange={e => setUnit(i, 'available_count', e.target.value)} />
            <input aria-label="Deposit percent" style={INP} type="number" min={0} max={100} placeholder="Deposit %" value={u.deposit_pct} onChange={e => setUnit(i, 'deposit_pct', e.target.value)} />
            <input aria-label="Instalment months" style={INP} type="number" min={0} placeholder="Instalment months" value={u.installment_months} onChange={e => setUnit(i, 'installment_months', e.target.value)} />
            <button type="button" style={{ ...btn(false), padding: '0.5rem' }} onClick={() => setUnits(prev => prev.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button type="button" style={btn(false)} onClick={() => setUnits(prev => [...prev, blankUnit()])}>+ Add a unit type</button>
      </div>

      {error && <div role="alert" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444' }}>{error}</div>}
      {notice && <div role="status" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: dark ? '#86EFAC' : '#15803D' }}>{notice}</div>}

      <div style={{ fontSize: 11.5, color: text2, lineHeight: 1.5 }}>
        Save a draft at any time. Submitting sends this development to MANOP for review; MANOP decides whether it is published.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" style={btn(false)} disabled={!!busy} onClick={() => send('save')}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
        <button type="button" style={btn(true)} disabled={!!busy} onClick={() => send('submit')}>{busy === 'submit' ? 'Submitting…' : 'Submit for MANOP review'}</button>
        {onCancel && <button type="button" style={btn(false)} disabled={!!busy} onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
