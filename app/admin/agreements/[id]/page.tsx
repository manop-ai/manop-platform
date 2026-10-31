'use client'
// app/admin/agreements/[id]/page.tsx — review one agreement request. Admin only (RLS enforces; this page just calls the admin API).
// Proposed terms are kept visibly separate from final agreed terms. "Executed" requires evidence.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '../../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../../lib/theme'
import { authedFetch } from '../../../../lib/authed-fetch'
import AdminAgreementDocuments from '../../../../components/agreements/AdminAgreementDocuments'
import ManopLoader from '../../../../components/ManopLoader'
import { ADMIN_TRANSITIONS, DISCLOSURE_STATUS_LABEL, NEEDS_MESSAGE, OPTION_LABEL, STATUS_EXPLANATION, STATUS_LABEL, SUPPORTED_CURRENCIES, formatMoney, type CommercialOption, type RequestStatus } from '../../../../lib/commercial-terms'

export default function AdminAgreementDetail() {
  const { user, checking } = useAuth('admin')
  const { id } = useParams<{ id: string }>()
  const [dark, setDark] = useState(true)
  const [d, setD] = useState<any>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [to, setTo] = useState(''); const [message, setMessage] = useState(''); const [visible, setVisible] = useState(false)
  const [note, setNote] = useState(''); const [noteVisible, setNoteVisible] = useState(false)
  const [terms, setTerms] = useState({ fee: '', share: '', value: '', currency: '' })
  const [calc, setCalc] = useState({ transaction_date: '', supporting_info: '', transaction_value: '', development_id: '', deal_reference: '', calculation_basis: '', value_source: '', commission_source: '', attribution_reference: '', attribution_notes: '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/agreements/${id}`); const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ ok: false, text: j.error || 'Could not load.' }); return }
    setD(j)
    const q = j.request
    setTerms({ fee: String(q.proposed_fee_rate_pct ?? ''), share: String(q.proposed_share_rate_pct ?? ''), value: q.illustrative_transaction_value != null ? String(q.illustrative_transaction_value) : '', currency: q.currency ?? '' })
  }, [id])
  useEffect(() => { if (user) load() }, [user, load])

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true); setMsg(null)
    const res = await authedFetch(`/api/admin/agreements/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({})); setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: j.error || 'Could not save.' }); return false }
    setMsg({ ok: true, text: ok }); await load(); return true
  }
  async function saveCalc() {
    setBusy(true); setMsg(null)
    const res = await authedFetch(`/api/admin/agreements/${id}/calculation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(calc) })
    const j = await res.json().catch(() => ({})); setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: (j.error || 'Could not save.') + (j.missing ? ` Missing: ${j.missing.join('; ')}.` : '') }); return }
    setMsg({ ok: true, text: 'Calculation recorded as PROPOSED (not binding).' }); await load()
  }

  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  const bg = dark ? '#0F172A' : '#F8FAFC', card = dark ? '#162032' : '#fff', text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.72)' : 'rgba(15,23,42,0.72)', text3 = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.55)', border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.14)'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.05)' : '#fff', color: text, fontSize: 15, fontFamily: 'inherit' }
  const box: React.CSSProperties = { background: card, border: `1px solid ${border}`, borderRadius: 4, padding: 'clamp(0.9rem,3vw,1.25rem)', marginBottom: 14 }
  const h: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }
  const btn: React.CSSProperties = { minHeight: 40, padding: '0.45rem 1rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
  const primary: React.CSSProperties = { ...btn, background: '#5B2EFF', borderColor: '#5B2EFF', color: '#fff' }
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }
  const lab: React.CSSProperties = { fontSize: 12, color: text3, display: 'block', marginBottom: 4 }

  if (!d) return <div style={{ background: bg, color: text, minHeight: '100vh', padding: '2rem' }}>{msg ? <div style={{ color: '#EF4444' }}>{msg.text}</div> : 'Loading…'}</div>
  const q = d.request, status = q.status as RequestStatus
  const nextStatuses = ADMIN_TRANSITIONS[status] ?? []

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <Link href="/admin/agreements" style={{ color: text2, fontSize: 13, textDecoration: 'none' }}>← All requests</Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0 4px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{q.reference}</h1>
          <span style={{ fontWeight: 700, color: '#14B8A6' }}>{STATUS_LABEL[status]}</span>
        </div>
        <div style={{ fontSize: 13.5, color: text2, marginBottom: 12 }}>{STATUS_EXPLANATION[status]}</div>
        {msg && <div role="status" style={{ ...box, borderColor: msg.ok ? '#22C55E' : '#EF4444', color: msg.ok ? '#22C55E' : '#EF4444', fontSize: 14 }}>{msg.text}</div>}

        <div style={box}>
          <div style={h}>Requester and parties</div>
          <div style={{ fontSize: 14.5, lineHeight: 1.8 }}>
            <strong>{q.company_name}</strong> ({q.requester_role})<br />
            {q.requester_name} · {q.requester_title} · {q.contact_email}{q.contact_phone ? ` · ${q.contact_phone}` : ''}<br />
            Other contracting party: {q.counterparty_name ? `${q.counterparty_name} (${q.counterparty_role})` : '—'}<br />
            Opportunity type: {q.opportunity_kind ?? (d.developments?.length ? 'development' : 'agency-level')}{q.scope_note ? ` · requested arrangement: ${q.scope_note}` : ''}
          </div>
          <div style={{ marginTop: 8 }}>
            {d.developments?.length ? d.developments.map((x: any) => (
              <div key={x.id} style={{ borderTop: `1px solid ${border}`, padding: '6px 0', fontSize: 13.5, lineHeight: 1.6 }}>
                <strong>{x.name}</strong> <span style={{ color: text3 }}>({x.id})</span><br />
                Review/publication: {x.publish_status ?? '—'} · Mandate letter: {String(x.mandate).replace(/_/g, ' ')} · Covered by this agreement: {x.coveredByThisAgreement ? 'yes (executed, named in the issued version)' : 'no'}
              </div>
            )) : <div style={{ fontSize: 13.5, color: text3 }}>No single development is named (agency-level request).</div>}
          </div>
        </div>

        {q.requester_notes && <div style={box}><div style={h}>What the requester wrote</div><div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{q.requester_notes}</div>{q.questions && <div style={{ fontSize: 14, marginTop: 6, whiteSpace: 'pre-wrap' }}><strong>Questions:</strong> {q.questions}</div>}</div>}
        <div style={box}>
          <div style={h}>Record the qualifying transaction and fee assessment</div>
          <div style={{ fontSize: 13, color: text3, marginBottom: 8 }}>Works only for a completed agreement. The fee comes from the terms recorded when the agreement was completed (agency or developer, never mixed). Saved as <strong>proposed</strong>; review it and mark it <strong>confirmed</strong> before MANOP asks for payment on the Fees page.</div>
          <div style={grid}>
            <div><label style={lab}>Transaction date *</label><input type="date" style={inp} value={calc.transaction_date} onChange={e => setCalc({ ...calc, transaction_date: e.target.value })} /></div>
            <div><label style={lab}>Supporting information</label><input style={inp} value={calc.supporting_info} onChange={e => setCalc({ ...calc, supporting_info: e.target.value })} placeholder="Evidence reference, what was confirmed" /></div>
            <div><label style={lab}>Transaction value *</label><input style={inp} value={calc.transaction_value} onChange={e => setCalc({ ...calc, transaction_value: e.target.value })} /></div>
            <div><label style={lab}>Development</label><select style={inp} value={calc.development_id} onChange={e => setCalc({ ...calc, development_id: e.target.value })}><option value="">—</option>{d.developments?.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div><label style={lab}>Deal / transaction reference</label><input style={inp} value={calc.deal_reference} onChange={e => setCalc({ ...calc, deal_reference: e.target.value })} placeholder="Deal Room reference, when available" /></div>
            <div><label style={lab}>Calculation basis</label><input style={inp} value={calc.calculation_basis} onChange={e => setCalc({ ...calc, calculation_basis: e.target.value })} /></div>
            <div><label style={lab}>Source of transaction value</label><input style={inp} value={calc.value_source} onChange={e => setCalc({ ...calc, value_source: e.target.value })} /></div>
            <div><label style={lab}>Source of commission figures</label><input style={inp} value={calc.commission_source} onChange={e => setCalc({ ...calc, commission_source: e.target.value })} /></div>
            <div><label style={lab}>Attribution reference</label><input style={inp} value={calc.attribution_reference} onChange={e => setCalc({ ...calc, attribution_reference: e.target.value })} /></div>
            <div><label style={lab}>Attribution notes</label><input style={inp} value={calc.attribution_notes} onChange={e => setCalc({ ...calc, attribution_notes: e.target.value })} /></div>
          </div>
          <button style={{ ...btn, marginTop: 10 }} disabled={busy || q.status !== 'executed'} onClick={saveCalc}>Record calculation</button>
          {d.calculations?.map((c: any) => (
            <div key={c.id} style={{ borderTop: `1px solid ${border}`, marginTop: 12, paddingTop: 10, fontSize: 13.5, lineHeight: 1.7 }}>
              <strong>{formatMoney(c.amount, c.currency)}</strong> · {OPTION_LABEL[c.option as CommercialOption]} · {c.status} · {c.is_binding ? 'binding' : 'not binding'} · {new Date(c.calculated_at).toLocaleDateString('en-GB')}
              {c.deal_reference && <> · deal {c.deal_reference}</>}
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {['confirmed', 'disputed', 'superseded'].map(s => <button key={s} style={{ ...btn, minHeight: 32, padding: '0.2rem 0.7rem', fontSize: 12 }} disabled={busy || c.status === s} onClick={() => act({ action: 'update_calculation', calculation_id: c.id, status: s }, `Calculation marked ${s}.`)}>{s}</button>)}
              </div>
            </div>
          ))}
        </div>

        <div style={box}><AdminAgreementDocuments requestId={q.id} status={q.status} dark={dark} onChanged={load} /></div>

        <div style={box}>
          <div style={h}>Change status</div>
          <div style={{ fontSize: 12.5, color: text3, marginBottom: 8 }}>Use this for review steps (under review, information needed, ready for preparation, declined). Sending, signed-copy review and Executed are done only from the Agreement documents section above; Executed cannot be set from here.</div>
          {nextStatuses.length === 0 ? <div style={{ fontSize: 14, color: text2 }}>This request is closed or still a draft; no further admin transitions.</div> : (
            <>
              <select style={{ ...inp, marginBottom: 8 }} value={to} onChange={e => setTo(e.target.value)}>
                <option value="">Move to…</option>{nextStatuses.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
              <textarea style={{ ...inp, minHeight: 70, marginBottom: 8 }} placeholder={NEEDS_MESSAGE.includes(to as RequestStatus) ? 'Message to the requester (required)' : 'Message (optional)'} value={message} onChange={e => setMessage(e.target.value)} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, minHeight: 36 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={visible} onChange={e => setVisible(e.target.checked)} />Show this message to the requester</label>
              <button style={{ ...primary, marginTop: 8 }} disabled={busy || !to} onClick={() => act({ action: 'set_status', to, message, visible_to_requester: visible }, `Status changed to ${STATUS_LABEL[to as RequestStatus]}.`).then(ok => { if (ok) { setTo(''); setMessage('') } })}>Update status</button>
            </>
          )}
        </div>

        <div style={box}>
          <div style={h}>Add a note</div>
          <textarea style={{ ...inp, minHeight: 70, marginBottom: 8 }} value={note} onChange={e => setNote(e.target.value)} placeholder="Internal note, or a message to the requester" />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, minHeight: 36 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={noteVisible} onChange={e => setNoteVisible(e.target.checked)} />Visible to the requester</label>
          <button style={{ ...btn, marginTop: 8 }} disabled={busy || !note.trim()} onClick={() => act({ action: 'add_note', message: note, visible_to_requester: noteVisible }, 'Note added.').then(ok => ok && setNote(''))}>Add note</button>
        </div>

        <div style={box}>
          <div style={h}>History</div>
          {d.events.map((ev: any) => (
            <div key={ev.id} style={{ borderLeft: `2px solid ${ev.visible_to_requester ? '#14B8A6' : border}`, paddingLeft: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: text3 }}>{new Date(ev.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {ev.actor_role} · {ev.event_type.replace(/_/g, ' ')}{ev.to_status ? ` → ${STATUS_LABEL[ev.to_status as RequestStatus] ?? ev.to_status}` : ''} · {ev.visible_to_requester ? 'visible to requester' : 'internal'}</div>
              {ev.message && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 2 }}>{ev.message}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}