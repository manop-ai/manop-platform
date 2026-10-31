'use client'
// Partner (agency or developer): fees MANOP has requested under a completed agreement. Report a payment, explain a delay or ask for more time,
// or ask MANOP to assess a transaction you believe qualifies. Reporting a payment is NOT payment: only MANOP verifying it reduces the balance.
// Own records only (the server decides); nothing here talks to a payment provider.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'

const money = (n: number, c: string) => `${c} ${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PartnerFeesPanel({ dark }: { dark: boolean }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null); const [mode, setMode] = useState<'paid' | 'delay' | null>(null)
  const [f, setF] = useState({ method: 'bank_transfer', amount: '', paid_on: '', reference: '', note: '', message: '', proposed_date: '', extension: false })
  const [a, setA] = useState({ agreement_id: '', description: '', claimed_value: '', currency: 'NGN', occurred_on: '' })
  const border = dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.18)'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', color: 'inherit', border: `1px solid ${border}`, borderRadius: 4, padding: '0.45rem', fontFamily: 'inherit', fontSize: 14, marginBottom: 6 }
  const box: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 4, padding: '0.8rem', marginBottom: 10, fontSize: 13.5, lineHeight: 1.6 }

  const load = useCallback(async () => {
    const r = await authedFetch('/api/fees'); const j = await r.json().catch(() => null)
    if (!r.ok) { setErr(j?.error || 'Could not load your fees.'); return }
    setD(j); setErr('')
  }, [])
  useEffect(() => { load() }, [load])

  async function post(body: any) {
    setBusy(true); setErr(''); setOk('')
    const r = await authedFetch('/api/fees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'That could not be sent.'); return false }
    setOk(j.message || 'Sent.'); setMode(null); await load(); return true
  }

  if (!d) return err ? <div role="alert" style={{ fontSize: 13, color: '#EF4444' }}>{err}</div> : null
  if (d.unavailable) return null
  const reqs: any[] = d.paymentRequests
  if (!reqs.length && !d.agreements.length) return null      // nothing to show until a completed agreement exists
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Fees and payments</div>
      <div style={{ fontSize: 13.5, opacity: 0.85, marginBottom: 10, maxWidth: 640 }}>When a transaction qualifies under your completed agreement, MANOP assesses the fee and sends you a payment request here. A payment counts only once MANOP has checked that it arrived.</div>
      {err && <div role="alert" style={{ ...box, borderColor: '#EF4444', color: '#EF4444' }}>{err}</div>}
      {ok && <div role="status" style={{ ...box, borderColor: '#22C55E' }}>{ok}</div>}

      {reqs.map(r => (
        <div key={r.id} style={{ ...box, borderColor: r.overdue ? '#F59E0B' : border }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{r.reference}</strong><span>{r.statusLabel}</span></div>
          <div>{r.reason}</div>
          <div>Amount requested: <strong>{money(r.amount, r.currency)}</strong> · verified paid: {money(r.verified, r.currency)} · <strong>outstanding: {money(r.outstanding, r.currency)}</strong></div>
          <div>Pay by <strong>{r.dueDate}</strong>{r.dueDate !== r.originalDueDate ? ` (originally ${r.originalDueDate})` : ''}{r.overdue ? ' — this deadline has passed; the amount is still owed.' : ''}</div>
          <details style={{ marginTop: 4 }}><summary>How to pay</summary><div style={{ whiteSpace: 'pre-wrap' }}>{r.instructions}</div></details>
          {r.payments.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 16 }}>{r.payments.map((p: any) => <li key={p.id}>{p.status === 'verified' ? `Verified: ${money(p.verifiedAmount, r.currency)} received ${p.verifiedOn} (ref ${p.verifiedReference})` : p.status === 'rejected' ? `MANOP could not match your report of ${money(p.amountClaimed, r.currency)} (ref ${p.reference}): ${p.verificationNote ?? ''}` : `You reported ${money(p.amountClaimed, r.currency)} on ${p.paidOnClaimed} (ref ${p.reference}), waiting for MANOP to verify`}</li>)}</ul>}
          {['issued', 'partly_paid'].includes(r.status) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <button type="button" onClick={() => { setOpen(r.id); setMode('paid') }}>I have paid</button>
              <button type="button" onClick={() => { setOpen(r.id); setMode('delay') }}>I need more time / explain a delay</button>
            </div>
          )}
          {open === r.id && mode === 'paid' && (
            <div style={{ marginTop: 8 }}>
              <select style={inp} value={f.method} onChange={e => setF({ ...f, method: e.target.value })}><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select>
              <input style={inp} placeholder="Amount paid" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} />
              <label style={{ fontSize: 12.5 }}>Date paid<input type="date" style={inp} value={f.paid_on} onChange={e => setF({ ...f, paid_on: e.target.value })} /></label>
              <input style={inp} placeholder="Payment reference from your bank *" value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} />
              <input style={inp} placeholder="Note (optional)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
              <button type="button" disabled={busy} onClick={() => post({ action: 'claim_payment', payment_request_id: r.id, method: f.method, amount: f.amount, paid_on: f.paid_on, reference: f.reference, note: f.note })}>{busy ? 'Sending…' : 'Tell MANOP I paid'}</button>
              <div style={{ fontSize: 12, opacity: 0.8 }}>MANOP checks the payment before it is counted. Your balance does not change until then.</div>
            </div>
          )}
          {open === r.id && mode === 'delay' && (
            <div style={{ marginTop: 8 }}>
              <textarea rows={3} style={inp} placeholder="Reason" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
              <label style={{ fontSize: 12.5 }}>Date you can pay by (optional)<input type="date" style={inp} value={f.proposed_date} onChange={e => setF({ ...f, proposed_date: e.target.value })} /></label>
              <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.extension} onChange={e => setF({ ...f, extension: e.target.checked })} /> Ask MANOP to extend the deadline to this date</label><br />
              <button type="button" disabled={busy} onClick={() => post({ action: 'delay_note', payment_request_id: r.id, message: f.message, proposed_date: f.proposed_date, extension: f.extension })}>{busy ? 'Sending…' : 'Send to MANOP'}</button>
              <div style={{ fontSize: 12, opacity: 0.8 }}>The amount and deadline stay as they are until MANOP decides.</div>
            </div>
          )}
          <details style={{ marginTop: 6 }}><summary>History</summary><ul style={{ paddingLeft: 16 }}>{r.events.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleDateString()} · {e.actor_role === 'admin' ? 'MANOP' : 'You'} · {e.event_type.replace(/_/g, ' ')}{e.message ? `: ${e.message}` : ''}{e.decided_date ? ` (deadline ${e.decided_date})` : ''}</li>)}</ul></details>
        </div>
      ))}

      {d.agreements.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary>Ask MANOP to assess a transaction</summary>
          <div style={{ ...box, marginTop: 6 }}>
            <div style={{ fontSize: 12.5, marginBottom: 6 }}>Use this if you believe a transaction qualifies under your completed agreement. It is a request for MANOP to review, not a charge.</div>
            <select style={inp} value={a.agreement_id} onChange={e => setA({ ...a, agreement_id: e.target.value })}><option value="">Choose the agreement</option>{d.agreements.map((x: any) => <option key={x.id} value={x.id}>{x.reference}</option>)}</select>
            <textarea rows={3} style={inp} placeholder="What happened (parties, opportunity, how it qualifies)" value={a.description} onChange={e => setA({ ...a, description: e.target.value })} />
            <input style={inp} placeholder="Transaction value (optional)" value={a.claimed_value} onChange={e => setA({ ...a, claimed_value: e.target.value })} />
            <label style={{ fontSize: 12.5 }}>Date it happened (optional)<input type="date" style={inp} value={a.occurred_on} onChange={e => setA({ ...a, occurred_on: e.target.value })} /></label>
            <button type="button" disabled={busy || !a.agreement_id} onClick={() => post({ action: 'request_assessment', ...a })}>Send request</button>
          </div>
          {d.assessmentRequests.map((x: any) => <div key={x.id} style={{ fontSize: 13 }}>{x.reference} · {x.status}{x.admin_note ? ` · MANOP: ${x.admin_note}` : ''}</div>)}
        </details>
      )}
    </div>
  )
}
