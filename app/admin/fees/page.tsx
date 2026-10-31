'use client'
// app/admin/fees/page.tsx — MANOP's fee desk (admin only; the server checks again on every call).
// Four separate stages, never merged: confirmed assessment -> payment request -> payment reported -> payment verified.
// A partner's "I paid" is only a report. Money counts when MANOP records the amount, date and reference it actually verified.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { authedFetch } from '../../../lib/authed-fetch'
import ManopLoader from '../../../components/ManopLoader'

const money = (n: number, c: string) => `${c} ${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function AdminFeesPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true); const [d, setD] = useState<any>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false)
  const [nw, setNw] = useState<Record<string, { due: string; instructions: string }>>({})
  const [f, setF] = useState<Record<string, any>>({})
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  const load = useCallback(async () => { const r = await authedFetch('/api/admin/fees'); const j = await r.json().catch(() => ({})); if (!r.ok) { setMsg({ ok: false, text: j.error || 'Could not load.' }); setD({ paymentRequests: [], readyAssessments: [], assessmentRequests: [] }); return } setD(j) }, [])
  useEffect(() => { if (user) load() }, [user, load])
  async function act(body: any, ok: string) { setBusy(true); setMsg(null); const r = await authedFetch('/api/admin/fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); setBusy(false); if (!r.ok) { setMsg({ ok: false, text: j.error || 'Could not save.' }); return } setMsg({ ok: true, text: ok }); await load() }

  if (checking || !user || !d) return <ManopLoader dark={dark} label="Loading…" />
  const bg = dark ? '#0F172A' : '#F8FAFC', card = dark ? '#162032' : '#fff', text = dark ? '#F8FAFC' : '#0F172A', text3 = dark ? 'rgba(248,250,252,0.55)' : 'rgba(15,23,42,0.6)', border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.14)'
  const box: React.CSSProperties = { background: card, border: `1px solid ${border}`, borderRadius: 4, padding: '0.9rem', marginBottom: 12, fontSize: 14, lineHeight: 1.6 }
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.45rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontFamily: 'inherit', fontSize: 14, marginBottom: 6 }
  const h: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/admin" style={{ color: text3, fontSize: 13, textDecoration: 'none' }}>← Command Center</Link>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>Fees and payments</h1>
        <div style={{ fontSize: 13.5, color: text3, marginBottom: 12, maxWidth: 700 }}>Record a qualifying transaction and its fee on the agreement page, mark it confirmed, then request payment here. A pending or reported payment is never counted as paid.</div>
        {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ ...box, borderColor: msg.ok ? '#22C55E' : '#EF4444' }}>{msg.text}</div>}

        <div style={h}>Partner requests for a fee assessment ({d.assessmentRequests.length})</div>
        {d.assessmentRequests.length === 0 && <div style={{ ...box, color: text3 }}>None waiting.</div>}
        {d.assessmentRequests.map((a: any) => (
          <div key={a.id} style={box}>
            <strong>{a.reference}</strong> · {a.company} · agreement <Link href={`/admin/agreements/${a.request_id}`} style={{ color: '#14B8A6' }}>{a.agreementReference}</Link>
            <div style={{ whiteSpace: 'pre-wrap' }}>{a.description}</div>
            <div style={{ color: text3 }}>{a.claimed_value ? `Claimed value ${a.currency ?? ''} ${a.claimed_value}` : 'No value given'}{a.occurred_on ? ` · ${a.occurred_on}` : ''} · {a.status}</div>
            <input style={inp} placeholder="Note to the partner (required to decline)" value={f['an' + a.id] ?? ''} onChange={e => set('an' + a.id, e.target.value)} />
            <input style={inp} placeholder="Calculation ID (from the agreement page) to accept" value={f['ac' + a.id] ?? ''} onChange={e => set('ac' + a.id, e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={() => act({ action: 'decide_assessment', id: a.id, decision: 'under_review', note: f['an' + a.id] }, 'Marked under review.')}>Under review</button>
              <button disabled={busy} onClick={() => act({ action: 'decide_assessment', id: a.id, decision: 'accept', note: f['an' + a.id], calculation_id: f['ac' + a.id] }, 'Accepted and linked to the calculation.')}>Accept</button>
              <button disabled={busy} onClick={() => act({ action: 'decide_assessment', id: a.id, decision: 'decline', note: f['an' + a.id] }, 'Declined with your note.')}>Decline</button>
            </div>
          </div>
        ))}

        <div style={h}>Confirmed assessments without a payment request ({d.readyAssessments.length})</div>
        {d.readyAssessments.length === 0 && <div style={{ ...box, color: text3 }}>None. Confirm a calculation on an agreement page first.</div>}
        {d.readyAssessments.map((c: any) => (
          <div key={c.id} style={box}>
            <strong>{money(c.amount, c.currency)}</strong> · {c.company} ({c.partyRole}) · agreement <Link href={`/admin/agreements/${c.request_id}`} style={{ color: '#14B8A6' }}>{c.agreementReference}</Link>{c.deal_reference ? ` · ${c.deal_reference}` : ''}{c.transaction_date ? ` · transaction ${c.transaction_date}` : ''}
            <label style={{ fontSize: 12.5, display: 'block' }}>Payment deadline<input type="date" min={today} style={inp} value={nw[c.id]?.due ?? ''} onChange={e => setNw(p => ({ ...p, [c.id]: { due: e.target.value, instructions: p[c.id]?.instructions ?? '' } }))} /></label>
            <textarea rows={2} style={inp} placeholder="How to pay (bank account, reference to quote)" value={nw[c.id]?.instructions ?? ''} onChange={e => setNw(p => ({ ...p, [c.id]: { due: p[c.id]?.due ?? '', instructions: e.target.value } }))} />
            <button disabled={busy} onClick={() => act({ action: 'create_payment_request', calculation_id: c.id, due_date: nw[c.id]?.due, instructions: nw[c.id]?.instructions }, 'Payment request sent to the partner.')}>Request payment</button>
          </div>
        ))}

        <div style={h}>Payment requests ({d.paymentRequests.length})</div>
        {d.paymentRequests.map((r: any) => (
          <div key={r.id} style={{ ...box, borderColor: r.overdue ? '#F59E0B' : border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{r.reference}</strong><span>{r.status}{r.overdue ? ' · OVERDUE' : ''}</span></div>
            {r.company} ({r.partyRole}) · agreement <Link href={`/admin/agreements/${r.requestId}`} style={{ color: '#14B8A6' }}>{r.agreementReference}</Link>
            <div>Requested {money(r.amount, r.currency)} · verified {money(r.verified, r.currency)} · <strong>outstanding {money(r.outstanding, r.currency)}</strong>{r.claimedNotVerified > 0 ? ` · reported, unverified ${money(r.claimedNotVerified, r.currency)}` : ''}</div>
            <div>Deadline {r.dueDate}{r.dueDate !== r.originalDueDate ? ` (original ${r.originalDueDate})` : ''}</div>
            {r.payments.filter((p: any) => p.status === 'claimed').map((p: any) => (
              <div key={p.id} style={{ border: `1px dashed ${border}`, padding: 8, margin: '6px 0' }}>
                Partner reports {money(p.amountClaimed, r.currency)} on {p.paidOnClaimed}, ref {p.reference} ({p.method}){p.note ? ` — ${p.note}` : ''}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 6, marginTop: 6 }}>
                  <input style={inp} placeholder="Amount received" value={f['va' + p.id] ?? ''} onChange={e => set('va' + p.id, e.target.value)} />
                  <input type="date" max={today} style={inp} value={f['vd' + p.id] ?? ''} onChange={e => set('vd' + p.id, e.target.value)} />
                  <input style={inp} placeholder="Bank reference verified" value={f['vr' + p.id] ?? ''} onChange={e => set('vr' + p.id, e.target.value)} />
                  <input style={inp} placeholder="Note" value={f['vn' + p.id] ?? ''} onChange={e => set('vn' + p.id, e.target.value)} />
                </div>
                <button disabled={busy} onClick={() => act({ action: 'verify_payment', payment_id: p.id, amount: f['va' + p.id], verified_on: f['vd' + p.id], reference: f['vr' + p.id], note: f['vn' + p.id] }, 'Payment verified and credited.')}>Verify received</button>{' '}
                <button disabled={busy} onClick={() => act({ action: 'reject_payment', payment_id: p.id, note: f['vn' + p.id] }, 'Report marked as not matched.')}>Could not match (note required)</button>
              </div>
            ))}
            {r.payments.filter((p: any) => p.status === 'verified').map((p: any) => <div key={p.id} style={{ color: text3 }}>Verified {money(p.verifiedAmount, r.currency)} on {p.verifiedOn}, ref {p.verifiedReference}</div>)}
            {['issued', 'partly_paid'].includes(r.status) && (
              <details style={{ marginTop: 6 }}><summary>Actions</summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 6, marginTop: 6 }}>
                  <input type="date" style={inp} value={f['nd' + r.id] ?? ''} onChange={e => set('nd' + r.id, e.target.value)} />
                  <input style={inp} placeholder="Reason for the new deadline" value={f['nr' + r.id] ?? ''} onChange={e => set('nr' + r.id, e.target.value)} />
                </div>
                <button disabled={busy} onClick={() => act({ action: 'set_deadline', payment_request_id: r.id, next_due_date: f['nd' + r.id], reason: f['nr' + r.id] }, 'Deadline changed; the original stays in the history.')}>Set new deadline</button>{' '}
                <button disabled={busy} onClick={() => act({ action: 'remind', payment_request_id: r.id }, 'Reminder recorded on the same request.')}>Send reminder</button>
                <div style={{ marginTop: 8, fontWeight: 700 }}>Record a payment you saw arrive (manual)</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 6 }}>
                  <input style={inp} placeholder="Amount received" value={f['ra' + r.id] ?? ''} onChange={e => set('ra' + r.id, e.target.value)} />
                  <input type="date" max={today} style={inp} value={f['rd' + r.id] ?? ''} onChange={e => set('rd' + r.id, e.target.value)} />
                  <input style={inp} placeholder="Bank reference" value={f['rr' + r.id] ?? ''} onChange={e => set('rr' + r.id, e.target.value)} />
                </div>
                <button disabled={busy} onClick={() => act({ action: 'record_payment', payment_request_id: r.id, method: 'bank_transfer', amount: f['ra' + r.id], verified_on: f['rd' + r.id], reference: f['rr' + r.id] }, 'Payment recorded as verified.')}>Record verified payment</button>
                <div style={{ marginTop: 8 }}><input style={inp} placeholder="Reason (to withdraw this request)" value={f['wr' + r.id] ?? ''} onChange={e => set('wr' + r.id, e.target.value)} />
                  <button disabled={busy} onClick={() => act({ action: 'withdraw', payment_request_id: r.id, reason: f['wr' + r.id] }, 'Request withdrawn.')}>Withdraw request</button></div>
              </details>
            )}
            <details style={{ marginTop: 6 }}><summary>History ({r.events.length})</summary><ul style={{ paddingLeft: 16 }}>{r.events.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString()} · {e.actor_role} · {e.event_type.replace(/_/g, ' ')}{e.message ? `: ${e.message}` : ''}{e.proposed_date ? ` (proposed ${e.proposed_date})` : ''}{e.decided_date ? ` (deadline ${e.decided_date})` : ''}</li>)}</ul></details>
          </div>
        ))}
      </div>
    </div>
  )
}
