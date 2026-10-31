'use client'
// Agency: see both commercial routes with their price/rate, what each includes and excludes, and explicitly choose one.
// Shown before commitment: price or rate, benefits, limits, exclusions, extra charges, when it takes effect, what happens to the other route.
// Choosing records the exact statement shown. Not paying is never acceptance; accepting needs the tick box AND the button.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'
import AgencySubscriptionRequestPanel from './AgencySubscriptionRequestPanel'

export default function AgencyCommercialModelPanel({ dark }: { dark: boolean }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [accept, setAccept] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const border = dark ? 'rgba(248,250,252,0.15)' : 'rgba(15,23,42,0.15)'

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/agency/commercial-model'); const j = await res.json().catch(() => null)
      if (!res.ok) { setError(j?.error || `Could not load your commercial options (HTTP ${res.status}).`); return }
      setData(j); setError('')
    } catch (e: any) { setError(e?.message || 'Network error.') }
  }, [])
  useEffect(() => { load() }, [load])

  async function choose(model: string) {
    setBusy(true); setOk(''); setError('')
    try {
      const res = await authedFetch('/api/agency/commercial-model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, accept: true, terms_version_id: data.termsVersionId }) })
      const j = await res.json().catch(() => null)
      if (!res.ok) setError(j?.error || `Could not record your choice (HTTP ${res.status}).`)
      else { setOk(j?.next || 'Your choice is recorded.'); load() }
    } catch (e: any) { setError(e?.message || 'Network error.') }
    setBusy(false)
  }

  if (error && !data) return <div role="alert" style={{ padding: '0.8rem', border: `1px solid ${border}`, marginBottom: 16 }}>{error}</div>
  if (!data) return <div style={{ padding: '0.8rem' }}>Loading your commercial options…</div>

  return (
    <section aria-label="Your commercial route" style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>How you work with MANOP</h2>
      <p style={{ fontSize: 13, maxWidth: 680, lineHeight: 1.6 }}>Choose one route. They are alternatives: you do not pay both for the same arrangement. {data.notice}</p>
      {data.current && <div role="status" style={{ padding: '0.7rem', border: `1px solid #22C55E`, marginBottom: 10, fontSize: 13 }}>Your current route: <strong>{data.current.model === 'subscription' ? 'Custom Agency Subscription' : 'Transaction success fee'}</strong>, from {data.current.effective_from}.{data.current.commitment_end ? ` Initial commitment runs to ${data.current.commitment_end}.` : ''}</div>}
      {data.pending && <div role="status" style={{ padding: '0.7rem', border: `1px solid ${border}`, marginBottom: 10, fontSize: 13 }}>Pending: <strong>{data.pending.model === 'subscription' ? 'Custom Agency Subscription' : 'Transaction success fee'}</strong>. A subscription starts only once MANOP confirms your payment and approves it.</div>}
      {ok && <div role="status" style={{ padding: '0.7rem', border: '1px solid #22C55E', marginBottom: 10, fontSize: 13 }}>{ok}</div>}
      {error && <div role="alert" style={{ padding: '0.7rem', border: '1px solid #EF4444', marginBottom: 10, fontSize: 13 }}>{error}</div>}
      {!data.termsApproved && <div style={{ padding: '0.7rem', border: `1px solid ${border}`, marginBottom: 10, fontSize: 13 }}>MANOP has not published approved commercial terms for agencies yet. You will be able to choose a route here once it has.</div>}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {data.routes.map((r: any) => r.model === 'subscription' ? (
          <AgencySubscriptionRequestPanel key={r.model} dark={dark} />
        ) : (
          <div key={r.model} style={{ border: `1px solid ${border}`, padding: '1rem', borderRadius: 4 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>{r.label}</h3>
            {r.price && <p style={{ margin: '4px 0' }}><strong>{r.price.currency} {Number(r.price.price).toLocaleString('en-NG')}</strong> for {r.price.periodMonths} months. Active only after payment is confirmed and MANOP approves it.</p>}
            {r.rate && <p style={{ margin: '4px 0' }}><strong>{r.rate.schedule.map((t: any) => `${t.rate_pct}%`).join(' / ')}</strong> of the qualifying closed transaction value, only when a qualifying transaction event occurs under your agreement. No subscription fee on this route.{r.rate.commitmentMonths ? ` Initial commitment: ${r.rate.commitmentMonths} months, after which you may ask for a custom subscription.` : ''}</p>}
            {!r.price && !r.rate && <p style={{ margin: '4px 0' }}>The price for this route has not been approved yet.</p>}
            {r.entitlement ? (
              <div style={{ fontSize: 13 }}>
                <div><strong>Includes:</strong> {r.entitlement.includes.join('; ')}</div>
                {r.entitlement.limits.length > 0 && <div><strong>Limits:</strong> {r.entitlement.limits.join('; ')}</div>}
                {r.entitlement.excludes.length > 0 && <div><strong>Excludes:</strong> {r.entitlement.excludes.join('; ')}</div>}
                {r.entitlement.extra_charges.length > 0 && <div><strong>Additional charges:</strong> {r.entitlement.extra_charges.join('; ')}</div>}
              </div>
            ) : <p style={{ fontSize: 13 }}>MANOP has not yet defined what this route includes and excludes.</p>}
            {r.notes.map((n: string, i: number) => <p key={i} style={{ fontSize: 12, margin: '6px 0' }}>{n}</p>)}
            {r.canChoose ? (
              <>
                <details style={{ fontSize: 12, margin: '8px 0' }}><summary>The exact terms you are accepting</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{r.statement}</pre></details>
                <label style={{ fontSize: 13, display: 'block', margin: '6px 0' }}><input type="checkbox" checked={!!accept[r.model]} onChange={e => setAccept({ ...accept, [r.model]: e.target.checked })} /> I have read and accept these terms for my agency.</label>
                <button disabled={busy || !accept[r.model]} onClick={() => choose(r.model)} style={{ minHeight: 40, padding: '0.4rem 1rem', fontWeight: 700 }}>{busy ? 'Saving…' : `Choose ${r.label}`}</button>
              </>
            ) : r.reasons.map((x: string, i: number) => <p key={i} style={{ fontSize: 12, margin: '6px 0' }}>{x}</p>)}
          </div>
        ))}
      </div>
      {data.history.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 13 }}><summary>History of your routes</summary>
          <ul>{data.history.map((h: any) => <li key={h.id}>{h.model === 'subscription' ? 'Custom Agency Subscription' : 'Transaction success fee'}: {h.status}{h.effective_from ? `, from ${h.effective_from}` : ''}{h.effective_to ? ` to ${h.effective_to}` : ''}{h.ended_reason ? ` (${h.ended_reason})` : ''}</li>)}</ul>
        </details>
      )}
    </section>
  )
}