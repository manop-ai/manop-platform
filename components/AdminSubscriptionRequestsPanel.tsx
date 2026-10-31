'use client'
// Admin: assess custom Agency Subscription requests, prepare and issue proposals, record early-change exceptions, read the audit trail.
// No automatic pricing: every figure is typed by an administrator. An issued proposal is frozen; a revision is a new version.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'

const blank = { price_amount: '', price_currency: 'NGN', duration_months: '12', inclusions: '', exclusions: '', coverage_scope: 'listed', coverage_development_ids: '', coverage_note: '', activation_condition: 'Payment confirmed by MANOP and the subscription approved by MANOP', effective_date: '', expires_at: '', terms_text: '', basis_note: '' }
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

export default function AdminSubscriptionRequestsPanel() {
  const [rows, setRows] = useState<any[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [f, setF] = useState<Record<string, string>>(blank)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const box: React.CSSProperties = { border: '1px solid rgba(128,128,128,0.35)', borderRadius: 6, padding: '0.8rem', marginBottom: 10, fontSize: 13 }
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.4)', borderRadius: 4, padding: '0.4rem', fontSize: 13, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    const res = await authedFetch('/api/admin/commercial/subscription-requests'); const j = await res.json().catch(() => null)
    if (!res.ok) { setErr(j?.error || `Could not load (HTTP ${res.status}).`); return }
    setErr(''); setUnavailable(!!j.unavailable); setRows(j.requests ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true); setErr(''); setMsg('')
    const res = await authedFetch('/api/admin/commercial/subscription-requests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => null)
    if (!res.ok) setErr(j?.error || `Failed (HTTP ${res.status}).`); else { setMsg(done); setReason(''); await load() }
    setBusy(false)
  }
  const payload = () => ({ ...f, inclusions: lines(f.inclusions), exclusions: lines(f.exclusions), coverage_development_ids: lines(f.coverage_development_ids), effective_date: f.effective_date || null, expires_at: f.expires_at ? new Date(f.expires_at).toISOString() : null })

  function openRow(r: any) {
    setOpen(open === r.id ? null : r.id)
    const d = [...(r.proposals ?? [])].reverse().find((p: any) => p.status === 'draft') ?? [...(r.proposals ?? [])].pop()
    setF(d ? { price_amount: String(d.price_amount), price_currency: d.price_currency, duration_months: String(d.duration_months), inclusions: (d.inclusions ?? []).join('\n'), exclusions: (d.exclusions ?? []).join('\n'), coverage_scope: d.coverage_scope, coverage_development_ids: (d.coverage_development_ids ?? []).join('\n'), coverage_note: d.coverage_note ?? '', activation_condition: d.activation_condition, effective_date: d.effective_date ?? '', expires_at: '', terms_text: d.terms_text, basis_note: d.basis_note ?? '' } : blank)
  }

  return (
    <section style={{ marginBottom: 28 }} aria-label="Custom subscription requests">
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Custom subscription requests</h2>
      <p style={{ fontSize: 13, maxWidth: 720 }}>Assess each request, then issue a proposal. There is no standard price and nothing is priced automatically. Context about activity outside MANOP is shown separately and is not a pricing basis. A proposal is not a contract until the agency accepts it, and a subscription is not active until payment is confirmed and you approve it in the section below.</p>
      {unavailable && <div style={box}>Not enabled yet: apply <code>sql/phase22_agency_custom_subscription.sql</code> in development first.</div>}
      {err && <div role="alert" style={{ ...box, borderColor: '#EF4444' }}>{err}</div>}
      {msg && <div role="status" style={{ ...box, borderColor: '#22C55E' }}>{msg}</div>}
      {rows.length === 0 && !unavailable && <div style={box}>No requests yet.</div>}
      {rows.map(r => {
        const live = r.proposals.find((p: any) => p.status === 'issued')
        const sf = (r.elections ?? []).find((e: any) => e.model === 'success_fee' && e.status === 'active')
        const isOpen = open === r.id
        return (
          <div key={r.id} style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div><strong>{r.data_partners?.name}</strong> · {r.status.replace(/_/g, ' ')} · requested {new Date(r.requested_at).toLocaleDateString()}{r.data_partners?.verification_status ? ` · verification: ${r.data_partners.verification_status}` : ''}</div>
              <button onClick={() => openRow(r)}>{isOpen ? 'Close' : 'Open'}</button>
            </div>
            {sf && <div style={{ fontSize: 12, marginTop: 4 }}>Active success-fee route from {sf.effective_from}; commitment {sf.commitment_end ? `to ${sf.commitment_end}` : 'not recorded'}{sf.early_transition_authorized_at ? ' · early change authorised' : ''}</div>}
            {isOpen && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <div><strong>Portfolio:</strong> {r.portfolio_summary}</div>
                <div><strong>Intended usage:</strong> {r.intended_usage}</div>
                {r.service_requirements && <div><strong>Service requirements:</strong> {r.service_requirements}</div>}
                {r.expected_coverage && <div><strong>Expected coverage:</strong> {r.expected_coverage}</div>}
                {r.manop_attributed_context && <div><strong>Agency says came through MANOP (verify against records):</strong> {r.manop_attributed_context}</div>}
                {r.external_context && <div style={{ opacity: 0.8 }}><strong>Outside MANOP (context only, not a pricing basis):</strong> {r.external_context}</div>}

                {r.status === 'requested' && <button disabled={busy} onClick={() => act({ action: 'start_assessment', request_id: r.id }, 'Assessment started.')}>Start assessment</button>}

                {['under_assessment', 'proposal_issued'].includes(r.status) && (
                  <div style={{ border: '1px solid rgba(128,128,128,0.35)', borderRadius: 4, padding: '0.7rem', display: 'grid', gap: 6 }}>
                    <strong>Proposal {live ? `(version ${live.version} issued; saving a new draft and issuing it supersedes it)` : '(draft)'}</strong>
                    <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                      <label>Price<input style={inp} value={f.price_amount} onChange={e => setF({ ...f, price_amount: e.target.value })} /></label>
                      <label>Currency<input style={inp} value={f.price_currency} onChange={e => setF({ ...f, price_currency: e.target.value })} /></label>
                      <label>Duration (months)<input style={inp} value={f.duration_months} onChange={e => setF({ ...f, duration_months: e.target.value })} /></label>
                      <label>Intended effective date<input type="date" style={inp} value={f.effective_date} onChange={e => setF({ ...f, effective_date: e.target.value })} /></label>
                      <label>Proposal expires<input type="datetime-local" style={inp} value={f.expires_at} onChange={e => setF({ ...f, expires_at: e.target.value })} /></label>
                    </div>
                    <label>Includes (one per line)<textarea rows={3} style={inp} value={f.inclusions} onChange={e => setF({ ...f, inclusions: e.target.value })} /></label>
                    <label>Excludes (one per line)<textarea rows={2} style={inp} value={f.exclusions} onChange={e => setF({ ...f, exclusions: e.target.value })} /></label>
                    <label>Coverage<select style={inp} value={f.coverage_scope} onChange={e => setF({ ...f, coverage_scope: e.target.value })}><option value="listed">Listed developments only</option><option value="all_current_and_future">All current and future developments (explicit)</option></select></label>
                    {f.coverage_scope === 'listed' && <label>Development ids (one per line; must be submitted by this agency)<textarea rows={2} style={inp} value={f.coverage_development_ids} onChange={e => setF({ ...f, coverage_development_ids: e.target.value })} /></label>}
                    <label>Coverage note<input style={inp} value={f.coverage_note} onChange={e => setF({ ...f, coverage_note: e.target.value })} /></label>
                    <label>Activation condition<input style={inp} value={f.activation_condition} onChange={e => setF({ ...f, activation_condition: e.target.value })} /></label>
                    <label>Terms shown to the agency (marked V1, pending legal review, until counsel approves)<textarea rows={4} style={inp} value={f.terms_text} onChange={e => setF({ ...f, terms_text: e.target.value })} /></label>
                    <label>Internal basis for the price (never shown to the agency)<textarea rows={2} style={inp} value={f.basis_note} onChange={e => setF({ ...f, basis_note: e.target.value })} /></label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button disabled={busy} onClick={() => act({ action: 'save_draft', request_id: r.id, ...payload() }, 'Draft saved.')}>Save draft</button>
                      <button disabled={busy} onClick={() => act({ action: 'issue', request_id: r.id, ...payload() }, 'Proposal issued to the agency.')}>Issue to agency</button>
                    </div>
                    <input style={inp} placeholder="Reason (to withdraw the proposal or close the request)" value={reason} onChange={e => setReason(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {live && <button disabled={busy} onClick={() => act({ action: 'withdraw_proposal', request_id: r.id, reason }, 'Proposal withdrawn.')}>Withdraw issued proposal</button>}
                      <button disabled={busy} onClick={() => act({ action: 'close', request_id: r.id, reason }, 'Request closed.')}>Close request</button>
                    </div>
                  </div>
                )}

                {sf && !sf.early_transition_authorized_at && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <strong>Early change exception</strong>
                    <input style={inp} placeholder="Reason for allowing a subscription request before the commitment ends (recorded)" value={reason} onChange={e => setReason(e.target.value)} />
                    <button disabled={busy} onClick={() => act({ action: 'authorize_early', election_id: sf.id, reason }, 'Exception recorded.')}>Authorise early change</button>
                  </div>
                )}

                <details><summary>Proposal history ({r.proposals.length})</summary>
                  {r.proposals.map((p: any) => <div key={p.id} style={{ fontSize: 12, margin: '4px 0' }}>v{p.version} {p.status}: {p.price_currency} {Number(p.price_amount).toLocaleString('en-NG')} / {p.duration_months} months{p.decided_at ? ` · decided ${new Date(p.decided_at).toLocaleString()}` : ''}{p.decline_reason ? ` · ${p.decline_reason}` : ''}</div>)}
                </details>
                <details><summary>Audit trail ({r.events.length})</summary>
                  {r.events.map((e: any) => <div key={e.id} style={{ fontSize: 12, margin: '2px 0' }}>{new Date(e.created_at).toLocaleString()} · {e.actor_role} · {e.event_type.replace(/_/g, ' ')}</div>)}
                </details>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}