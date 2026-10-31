'use client'
// Admin: commercial terms versions, Agency Subscriptions and each agency's chosen route, in one place.
// Every figure shown or saved here comes from a versioned terms record. "Prefill proposed values" only fills a DRAFT form with the founder's
// stated starting figures for review; nothing becomes approved or active unless an admin approves it.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'
import { PROPOSED_SUCCESS_FEE_SCHEDULE } from '../lib/commercial-terms'

async function call(url: string, init?: RequestInit): Promise<{ ok: boolean; data: any; error: string }> {
  try {
    const res = await authedFetch(url, init); const text = await res.text(); let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { /* not JSON */ }
    return { ok: res.ok, data, error: res.ok ? '' : data?.error || `Request failed (HTTP ${res.status}).` }
  } catch (e: any) { return { ok: false, data: null, error: e?.message || 'Network error.' } }
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean)
const schedText = (s: any) => (Array.isArray(s) ? s.map((t: any) => `${t.rate_pct}%${t.up_to == null ? ' above' : ` to ${Number(t.up_to).toLocaleString('en-NG')}`}`).join(', ') : 'not set')

export default function AdminCommercialPanel() {
  const [tab, setTab] = useState<'terms' | 'subs' | 'elections'>('elections')
  const [terms, setTerms] = useState<any[]>([]); const [subs, setSubs] = useState<any[]>([]); const [els, setEls] = useState<any[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ label: '', devSched: '', agencyRate: '', commit: '', inc_s: '', lim_s: '', exc_s: '', ext_s: '', inc_f: '', lim_f: '', exc_f: '', ext_f: '' })

  const load = useCallback(async () => {
    const [t, s, e] = await Promise.all([call('/api/admin/commercial/terms'), call('/api/admin/commercial/subscriptions'), call('/api/admin/commercial/elections')])
    if (t.ok) setTerms(t.data.versions ?? []); if (s.ok) setSubs(s.data.subscriptions ?? [])
    if (e.ok) { setEls(e.data.elections ?? []); setUnavailable(!!e.data.unavailable) }
    const err = [t, s, e].find(x => !x.ok); if (err) setMsg({ ok: false, text: err.error })
  }, [])
  useEffect(() => { load() }, [load])

  async function act(url: string, method: string, body: unknown, okText: string) {
    setBusy(true); setMsg(null)
    const r = await call(url, json(method, body))
    setMsg({ ok: r.ok, text: r.ok ? okText : r.error }); setBusy(false); if (r.ok) load()
  }
  const ask = (q: string) => (typeof window !== 'undefined' ? window.prompt(q) : null)

  function prefill() {
    setF(x => ({ ...x, devSched: PROPOSED_SUCCESS_FEE_SCHEDULE.map(t => `${t.up_to ?? ''},${t.rate_pct}`).join('\n'), agencyRate: '1.5', commit: '12' }))
  }
  function createDraft() {
    const tiers = lines(f.devSched).map(l => { const [u, r] = l.split(','); return { up_to: u.trim() === '' ? null : Number(u.replace(/,/g, '')), rate_pct: Number(r) } })
    const ent = (i: string, l: string, e: string, x: string) => ({ includes: lines(i), limits: lines(l), excludes: lines(e), extra_charges: lines(x) })
    const entitlements: Record<string, unknown> = {}
    if (f.inc_s.trim()) entitlements.subscription = ent(f.inc_s, f.lim_s, f.exc_s, f.ext_s)
    if (f.inc_f.trim()) entitlements.success_fee = ent(f.inc_f, f.lim_f, f.exc_f, f.ext_f)
    act('/api/admin/commercial/terms', 'POST', {
      version_label: f.label, success_fee_schedule: tiers,
      agency_success_fee_schedule: f.agencyRate.trim() ? [{ up_to: null, rate_pct: Number(f.agencyRate) }] : null,
      agency_success_fee_commitment_months: f.commit.trim() ? Number(f.commit) : null, agency_entitlements: entitlements,
    }, 'Draft saved. It is not approved and nothing uses it yet.')
  }

  const box: React.CSSProperties = { border: '1px solid rgba(128,128,128,0.35)', borderRadius: 4, padding: '0.8rem', marginBottom: 10 }
  const inp: React.CSSProperties = { width: '100%', padding: '0.4rem', marginBottom: 6, font: 'inherit' }
  const Btn = (p: { onClick: () => void; children: React.ReactNode }) => <button disabled={busy} onClick={p.onClick} style={{ minHeight: 34, padding: '0.25rem 0.7rem', marginRight: 6, marginTop: 4, cursor: 'pointer' }}>{p.children}</button>

  return (
    <section aria-label="Commercial terms and agency routes">
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Commercial terms and agency routes</h2>
      <p style={{ fontSize: 13, maxWidth: 700 }}>Rates and prices live in versioned terms. A proposed figure is not approved until you approve it. Calculations are records for review, not invoices.</p>
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([['elections', 'Agency routes'], ['subs', 'Agency Subscriptions'], ['terms', 'Terms versions']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ minHeight: 36, padding: '0.3rem 0.8rem', fontWeight: tab === k ? 800 : 400 }}>{l}</button>
        ))}
      </div>
      {msg && <div role={msg.ok ? 'status' : 'alert'} style={{ ...box, borderColor: msg.ok ? '#22C55E' : '#EF4444' }}>{msg.text}</div>}

      {tab === 'elections' && (<div>
        {unavailable && <div style={box}>Route selection is not enabled yet: apply <code>sql/phase20_agency_commercial_elections.sql</code> in development first.</div>}
        {!unavailable && els.length === 0 && <div style={box}>No agency has chosen a route yet.</div>}
        {els.map(e => (
          <div key={e.id} style={box}>
            <strong>{e.data_partners?.name ?? 'Agency'}</strong> · {e.model === 'subscription' ? 'Annual Agency Subscription' : 'Transaction success fee'} · <em>{e.status}</em>
            <div style={{ fontSize: 12 }}>Terms {e.commercial_terms_versions?.version_label ?? '—'} (legal review: {e.commercial_terms_versions?.legal_review_status ?? '—'}) · accepted {new Date(e.accepted_at).toLocaleDateString('en-GB')} · from {e.effective_from ?? 'not yet'}{e.effective_to ? ` to ${e.effective_to}` : ''}</div>
            {e.model === 'subscription' && <div style={{ fontSize: 12 }}>Subscription: {e.subscription_phase ?? 'none linked'}</div>}
            {e.ended_reason && <div style={{ fontSize: 12 }}>Reason: {e.ended_reason}</div>}
            <details style={{ fontSize: 12 }}><summary>What the agency accepted</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{e.acceptance_statement}</pre></details>
            {e.status === 'proposed' && <Btn onClick={() => act('/api/admin/commercial/elections', 'PATCH', { id: e.id, action: 'activate' }, 'Route activated.')}>Activate</Btn>}
            {e.status === 'proposed' && <Btn onClick={() => act('/api/admin/commercial/elections', 'PATCH', { id: e.id, action: 'withdraw', reason: ask('Reason (optional)') ?? '' }, 'Selection withdrawn.')}>Withdraw</Btn>}
            {e.status === 'active' && <Btn onClick={() => { const r = ask('Reason for ending this route (required)'); if (r) act('/api/admin/commercial/elections', 'PATCH', { id: e.id, action: 'end', reason: r }, 'Route ended. Transactions already triggered keep this route.') }}>End route</Btn>}
          </div>
        ))}
      </div>)}

      {tab === 'subs' && (<div>
        {subs.length === 0 && <div style={box}>No Agency Subscription requests.</div>}
        {subs.map(s => (
          <div key={s.id} style={box}>
            <strong>{s.data_partners?.name ?? 'Agency'}</strong> · {s.phaseLabel} · {s.price_amount != null ? `${s.price_currency} ${Number(s.price_amount).toLocaleString('en-NG')} / ${s.period_months} months` : 'price not set'}
            <div style={{ fontSize: 12 }}>Payment: {s.payment_status}{s.payment_reference ? ` (ref ${s.payment_reference})` : ''} · approval: {s.approval_status} · {s.period_start ? `${s.period_start} to ${s.period_end}` : 'not active'}</div>
            {s.payment_status !== 'payment_confirmed' && <Btn onClick={() => { const r = ask('Payment reference (only once the money has been received)'); if (r) act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'confirm_payment', payment_reference: r }, 'Payment recorded.') }}>Confirm payment</Btn>}
            {s.approval_status === 'pending' && <Btn onClick={() => act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'approve' }, 'Approved.')}>Approve</Btn>}
            {s.approval_status === 'pending' && <Btn onClick={() => { const r = ask('Why is it declined?'); if (r) act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'decline', notes: r }, 'Declined.') }}>Decline</Btn>}
            {s.activation_status === 'inactive' && <Btn onClick={() => act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'activate' }, 'Activated.')}>Activate</Btn>}
            {s.activation_status === 'active' && <Btn onClick={() => { const r = ask('Reason for suspending'); if (r) act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'suspend', reason: r }, 'Suspended.') }}>Suspend</Btn>}
            {s.activation_status === 'suspended' && <Btn onClick={() => act('/api/admin/commercial/subscriptions', 'PATCH', { id: s.id, action: 'reinstate' }, 'Reinstated.')}>Reinstate</Btn>}
          </div>
        ))}
      </div>)}

      {tab === 'terms' && (<div>
        {terms.map(v => (
          <div key={v.id} style={box}>
            <strong>{v.version_label}</strong> · {v.status}{v.effective_from ? ` from ${v.effective_from}` : ''} · legal review: {v.legal_review_status}
            <div style={{ fontSize: 12 }}>Developer success fee: {schedText(v.success_fee_schedule)} · Agency success fee: {schedText(v.agency_success_fee_schedule)} · Agency success-fee commitment: {v.agency_success_fee_commitment_months ? `${v.agency_success_fee_commitment_months} months` : 'not set'}</div>
            <div style={{ fontSize: 12 }}>Route entitlements defined: subscription {v.agency_entitlements?.subscription ? 'yes' : 'no'}, success fee {v.agency_entitlements?.success_fee ? 'yes' : 'no'}</div>
            {v.status === 'draft' && <Btn onClick={() => { const d = ask('Date these terms take effect (YYYY-MM-DD)'); if (d) act('/api/admin/commercial/terms', 'PATCH', { id: v.id, action: 'approve', effective_from: d }, 'Terms approved. They apply from that date and can no longer be edited.') }}>Approve…</Btn>}
            {v.status === 'approved' && <Btn onClick={() => act('/api/admin/commercial/terms', 'PATCH', { id: v.id, action: 'supersede' }, 'Superseded.')}>Supersede</Btn>}
            <Btn onClick={() => { const s = ask('Legal review status: not_reviewed, in_review or cleared'); if (s) act('/api/admin/commercial/terms', 'PATCH', { id: v.id, action: 'set_legal_review', legal_review_status: s }, 'Legal review status saved.') }}>Set legal review</Btn>
          </div>
        ))}
        <div style={box}>
          <strong>New draft version</strong>
          <p style={{ fontSize: 12 }}>You decide every figure. “Prefill” only fills the form with the proposed starting values; review them before saving.</p>
          <Btn onClick={prefill}>Prefill proposed values</Btn>
          <label>Version label<input style={inp} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="e.g. v2-2026" /></label>
          <label>Developer success-fee tiers, one per line as “upper limit,rate” (blank limit = open-ended)<textarea style={inp} rows={3} value={f.devSched} onChange={e => setF({ ...f, devSched: e.target.value })} /></label>
          <label>Agency success-fee rate, % of the qualifying closed transaction value<input style={inp} value={f.agencyRate} onChange={e => setF({ ...f, agencyRate: e.target.value })} /></label>
          <label>Agency success-fee initial commitment (months, proposed 12; blank = not decided)<input style={inp} value={f.commit} onChange={e => setF({ ...f, commit: e.target.value })} /></label>
          <p style={{ fontSize: 12, margin: 0 }}>Subscriptions have no standard price: each is assessed and proposed individually in the section above.</p>
          <p style={{ fontSize: 12 }}>What each route includes. One item per line. Leave “includes” empty to leave that route undefined; agencies cannot accept an undefined route.</p>
          {(['s', 'f'] as const).map(k => (
            <fieldset key={k} style={{ ...box, marginTop: 6 }}><legend>{k === 's' ? 'Annual Agency Subscription' : 'Transaction success fee'}</legend>
              {(['inc', 'lim', 'exc', 'ext'] as const).map(p => (
                <label key={p} style={{ display: 'block', fontSize: 12 }}>{({ inc: 'Includes', lim: 'Limits', exc: 'Excludes', ext: 'Additional charges' } as const)[p]}
                  <textarea style={inp} rows={2} value={(f as any)[`${p}_${k}`]} onChange={e => setF({ ...f, [`${p}_${k}`]: e.target.value } as any)} /></label>
              ))}
            </fieldset>
          ))}
          <Btn onClick={createDraft}>Save draft</Btn>
        </div>
      </div>)}
    </section>
  )
}