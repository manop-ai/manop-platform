'use client'
// components/developer/UnitTermsPanel.tsx
//
// One unit type's commercial terms: price, deposit %, instalment months, units available, total units.
// Saving goes through /api/developer/unit-terms, which records every change (before, after, who, when, source) and tells MANOP about
// material changes on published developments. The "Payment plan" preview uses calculateUnitPaymentPlan: the same calculator the
// dossier's Units tab, Affordability and Payment Plan use, so the figures here are the figures a buyer sees.
// Sold and reserved are not shown: the platform does not collect them, and they are never derived from "available".

import { useEffect, useMemo, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'
import { calculateUnitPaymentPlan } from '../../lib/finance-intelligence'
import { TERM_FIELDS, TERM_LABEL, describeChange, diffTerms, parseTermInput, validateTermChanges, type TermField, type UnitTerms } from '../../lib/unit-terms'

export interface UnitTermsRow {
  id: string; unit_type: string
  price_ngn: number | null; deposit_pct?: number | null; installment_months?: number | null
  available_count?: number | null; quantity: number | null
}
interface HistoryRow { id: string; field: TermField; previous_value: number | null; new_value: number | null; actor_role: string | null; source: string; created_at: string; material: boolean }

const ngn = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

export default function UnitTermsPanel({ unit, published, dark, onSaved }: { unit: UnitTermsRow; published: boolean; dark: boolean; onSaved: () => void }) {
  const current: UnitTerms = useMemo(() => ({
    price_ngn: unit.price_ngn ?? null, deposit_pct: unit.deposit_pct ?? null, installment_months: unit.installment_months ?? null,
    available_count: unit.available_count ?? null, quantity: unit.quantity ?? null,
  }), [unit.price_ngn, unit.deposit_pct, unit.installment_months, unit.available_count, unit.quantity])

  const [form, setForm] = useState<Record<TermField, string>>(() => toForm(current))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [showHist, setShowHist] = useState(false)
  const [hist, setHist] = useState<HistoryRow[] | null>(null)
  const [histNote, setHistNote] = useState<string | null>(null)

  useEffect(() => { setForm(toForm(current)) }, [current])   // follow reloads (e.g. after a conflict)

  const next: Partial<UnitTerms> = {}
  let parseErr: string | null = null
  for (const f of TERM_FIELDS) {
    const v = parseTermInput(form[f])
    if (typeof v === 'number' && Number.isNaN(v)) parseErr = `${TERM_LABEL[f]} must be a number.`
    else next[f] = v
  }
  const changes = parseErr ? {} : diffTerms(current, next)
  const invalid = parseErr ?? (Object.keys(changes).length ? validateTermChanges(current, changes) : null)
  const dirty = Object.keys(changes).length > 0

  const plan = calculateUnitPaymentPlan({ price_ngn: (next.price_ngn ?? 0) as number, deposit_pct: next.deposit_pct as number, installment_months: next.installment_months as number })

  async function save() {
    if (!dirty || invalid) return
    setBusy(true); setMsg(null)
    try {
      const expected: Record<string, number | null> = {}
      for (const k of Object.keys(changes)) expected[k] = current[k as TermField]
      const res = await authedFetch('/api/developer/unit-terms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_id: unit.id, changes, expected }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ kind: 'err', text: j.error || 'Could not save.' })
        if (res.status === 409) onSaved()        // someone else changed it: reload the latest values
        return
      }
      setMsg({ kind: 'ok', text: published ? 'Saved. The change is recorded and MANOP has been notified.' : 'Saved.' })
      setHist(null)
      onSaved()
    } catch { setMsg({ kind: 'err', text: 'Network error. Nothing was saved.' }) }
    finally { setBusy(false) }
  }

  async function loadHist() {
    setShowHist(s => !s)
    if (hist) return
    try {
      const res = await authedFetch(`/api/developer/unit-terms?unit_id=${unit.id}`)
      const j = await res.json().catch(() => ({}))
      if (res.ok) { setHist(j.history ?? []); setHistNote(j.pending_migration ? 'History will appear once the unit-terms migration is applied.' : null) }
      else setHistNote(j.error || 'Could not load history.')
    } catch { setHistNote('Could not load history.') }
  }

  const c = dark
    ? { text: '#F4F2FF', mute: '#A9A4C7', line: 'rgba(255,255,255,0.14)', inp: 'rgba(255,255,255,0.06)', soft: 'rgba(91,46,255,0.16)' }
    : { text: '#0B1230', mute: '#5B5F7A', line: 'rgba(11,18,48,0.14)', inp: '#FFFFFF', soft: 'rgba(91,46,255,0.07)' }
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.45rem 0.55rem', fontSize: '0.8rem', borderRadius: 8, border: `1px solid ${c.line}`, background: c.inp, color: c.text, fontFamily: 'inherit' }
  const lab: React.CSSProperties = { fontSize: '0.65rem', color: c.mute, marginBottom: 3, display: 'block' }
  const field = (f: TermField, label: string, placeholder = 'Not set', mode: 'numeric' | 'decimal' = 'numeric') => (
    <div><label style={lab}>{label}</label>
      <input style={inp} inputMode={mode} value={form[f]} placeholder={placeholder} onChange={e => setForm({ ...form, [f]: e.target.value })} aria-label={`${unit.unit_type} ${TERM_LABEL[f]}`} /></div>
  )

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 8 }}>
        {field('price_ngn', 'Price (₦)')}
        {field('deposit_pct', 'Deposit (%)', 'e.g. 30', 'decimal')}
        {field('installment_months', 'Instalment period (months)', 'e.g. 24')}
        {field('available_count', 'Units available now')}
        {field('quantity', 'Total units')}
      </div>

      {plan && !invalid ? (
        <div style={{ background: c.soft, border: `1px solid ${c.line}`, borderRadius: 8, padding: '0.55rem 0.7rem', fontSize: '0.75rem', color: c.text, marginBottom: 8 }}>
          <strong>What a buyer will see:</strong> {ngn(plan.deposit_ngn)} deposit, then {ngn(plan.monthly_installment_ngn)} a month for {plan.installment_months} months (balance {ngn(plan.balance_ngn)}).
        </div>
      ) : (
        <div style={{ fontSize: '0.72rem', color: c.mute, marginBottom: 8 }}>Add a price, deposit and instalment period and buyers will see the payment plan. Leave them blank if there is no instalment plan.</div>
      )}

      {published && (
        <div style={{ fontSize: '0.7rem', color: c.mute, marginBottom: 8 }}>This development is live. Changes here go live immediately, are recorded permanently, and MANOP is notified of significant ones.</div>
      )}
      {invalid && dirty && <div role="alert" style={{ fontSize: '0.75rem', color: '#B42318', marginBottom: 8 }}>{invalid}</div>}
      {msg && <div role="status" style={{ fontSize: '0.75rem', color: msg.kind === 'ok' ? '#0F766E' : '#B42318', marginBottom: 8 }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={!dirty || !!invalid || busy}
          style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.78rem', cursor: !dirty || invalid || busy ? 'not-allowed' : 'pointer', opacity: !dirty || invalid || busy ? 0.5 : 1, fontFamily: 'inherit' }}>
          {busy ? 'Saving…' : 'Save terms'}
        </button>
        {dirty && <button onClick={() => { setForm(toForm(current)); setMsg(null) }} style={{ background: 'transparent', border: `1px solid ${c.line}`, color: c.mute, borderRadius: 8, padding: '0.45rem 0.8rem', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>Discard</button>}
        <button onClick={loadHist} style={{ background: 'transparent', border: 'none', color: '#5B2EFF', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>{showHist ? 'Hide history' : 'Change history'}</button>
      </div>

      {showHist && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${c.line}`, paddingTop: 8 }}>
          {histNote && <div style={{ fontSize: '0.72rem', color: c.mute }}>{histNote}</div>}
          {hist && hist.length === 0 && !histNote && <div style={{ fontSize: '0.72rem', color: c.mute }}>No changes recorded yet.</div>}
          {hist?.map(h => (
            <div key={h.id} style={{ fontSize: '0.72rem', color: c.text, padding: '3px 0' }}>
              {describeChange(h.field, h.previous_value, h.new_value)}
              <span style={{ color: c.mute }}> · {new Date(h.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {h.actor_role === 'admin' ? 'MANOP' : h.actor_role === 'service' ? 'system' : 'you'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function toForm(t: UnitTerms): Record<TermField, string> {
  const o = {} as Record<TermField, string>
  for (const f of TERM_FIELDS) o[f] = t[f] === null || t[f] === undefined ? '' : String(t[f])
  return o
}