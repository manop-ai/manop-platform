'use client'
// Agency: request a CUSTOM subscription, then review and accept or decline MANOP's proposal.
// There is no standard price. Requesting does not activate anything and never blocks profile, verification or development submissions.
import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'

const STEPS = ['Request', 'MANOP assesses', 'Proposal', 'Your decision', 'Payment and approval', 'Active']
const stepIndex = (s: string) => ({ requested: 1, under_assessment: 1, proposal_issued: 3, accepted: 4 } as Record<string, number>)[s] ?? 0

export default function AgencySubscriptionRequestPanel({ dark }: { dark: boolean }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ portfolio_summary: '', intended_usage: '', service_requirements: '', expected_coverage: '', manop_attributed_context: '', external_context: '' })
  const [confirm, setConfirm] = useState(false)
  const border = dark ? 'rgba(248,250,252,0.15)' : 'rgba(15,23,42,0.15)'
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'transparent', color: 'inherit', border: `1px solid ${border}`, borderRadius: 6, padding: '0.5rem', fontSize: 13, fontFamily: 'inherit' }

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/agency/subscription-request'); const j = await res.json().catch(() => null)
      if (!res.ok) { setError(j?.error || `Could not load (HTTP ${res.status}).`); return }
      setData(j); setError('')
    } catch (e: any) { setError(e?.message || 'Network error.') }
  }, [])
  useEffect(() => { load() }, [load])

  async function call(method: 'POST' | 'PATCH', body: Record<string, unknown>, done: string) {
    setBusy(true); setError(''); setOk('')
    try {
      const res = await authedFetch('/api/agency/subscription-request', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => null)
      if (!res.ok) setError(j?.error || `That could not be recorded (HTTP ${res.status}).`)
      else { setOk(j?.next || done); setConfirm(false); load() }
    } catch (e: any) { setError(e?.message || 'Network error.') }
    setBusy(false)
  }

  if (!data) return <div style={{ padding: '0.8rem', fontSize: 13 }}>{error || 'Loading…'}</div>
  if (data.unavailable) return <div style={{ padding: '0.8rem', fontSize: 13 }}>{data.message}</div>
  const r = data.request, p = r?.proposal
  const open = r && ['requested', 'under_assessment', 'proposal_issued'].includes(r.status)
  const names: Record<string, string> = Object.fromEntries((data.developments ?? []).map((d: any) => [d.id, d.name]))

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '1rem' }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>Custom Agency Subscription</h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 10px', maxWidth: 680 }}>There is no standard subscription price. You tell MANOP about your portfolio and how you would use MANOP, MANOP assesses it and sends you a proposal with a price, duration, what is included and which developments are covered. You decide whether to accept it.</p>
      {error && <div role="alert" style={{ padding: '0.6rem', border: '1px solid #EF4444', marginBottom: 8, fontSize: 13 }}>{error}</div>}
      {ok && <div role="status" style={{ padding: '0.6rem', border: '1px solid #22C55E', marginBottom: 8, fontSize: 13 }}>{ok}</div>}

      {r && (
        <>
          <ol style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', padding: 0, margin: '0 0 10px', fontSize: 12 }}>
            {STEPS.map((s, i) => <li key={s} style={{ padding: '2px 8px', borderRadius: 999, border: `1px solid ${i <= stepIndex(r.status) ? '#14B8A6' : border}`, opacity: i <= stepIndex(r.status) ? 1 : 0.6 }}>{s}</li>)}
          </ol>
          <div role="status" style={{ fontSize: 13, marginBottom: 8 }}><strong>{r.statusLabel}.</strong> {r.nextStep}</div>
        </>
      )}

      {p && (p.status === 'issued' || p.status === 'accepted') && (
        <div style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '0.8rem', margin: '8px 0', fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Proposal, version {p.version}: {p.currency} {Number(p.price).toLocaleString('en-NG')} for {p.durationMonths} months</div>
          <div><strong>Includes:</strong> {p.inclusions.join('; ')}</div>
          {p.exclusions?.length > 0 && <div><strong>Excludes:</strong> {p.exclusions.join('; ')}</div>}
          <div><strong>Developments covered:</strong> {p.coverageScope === 'listed' ? (p.coverageDevelopmentIds.map((id: string) => names[id] ?? id).join('; ')) : 'All your current and future developments (stated explicitly in this proposal)'}</div>
          {p.coverageNote && <div>{p.coverageNote}</div>}
          <div><strong>Activation:</strong> {p.activationCondition}</div>
          {p.effectiveDate && <div><strong>Intended effective date:</strong> {p.effectiveDate}</div>}
          <div><strong>Valid until:</strong> {new Date(p.expiresAt).toLocaleDateString()}</div>
          <details style={{ marginTop: 6 }}><summary>Full terms</summary><div style={{ whiteSpace: 'pre-wrap' }}>{p.terms}</div></details>
          <p style={{ fontSize: 12, margin: '8px 0 0' }}>Accepting records your agreement to these terms. It does not activate the subscription. A fee already earned or triggered under an earlier route is not removed.</p>
          {p.canDecide && (
            <>
              <label style={{ display: 'block', margin: '8px 0', fontSize: 13 }}><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} /> I have read this proposal and accept it for my agency.</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={busy || !confirm} style={{ minHeight: 40, padding: '0.4rem 1rem', fontWeight: 700 }} onClick={() => call('PATCH', { request_id: r.id, proposal_id: p.id, action: 'accept' }, 'Proposal accepted.')}>{busy ? 'Saving…' : 'Accept proposal'}</button>
                <button disabled={busy} style={{ minHeight: 40, padding: '0.4rem 1rem' }} onClick={() => call('PATCH', { request_id: r.id, proposal_id: p.id, action: 'decline' }, 'You declined the proposal.')}>Decline</button>
              </div>
            </>
          )}
        </div>
      )}

      {open && <button disabled={busy} style={{ marginTop: 6, fontSize: 12 }} onClick={() => call('PATCH', { request_id: r.id, action: 'withdraw' }, 'Request withdrawn.')}>Withdraw this request</button>}

      {data.canRequest ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <label style={{ fontSize: 13 }}>Your portfolio (what you market, where, roughly how many developments)
            <textarea rows={3} style={field} value={form.portfolio_summary} onChange={e => setForm({ ...form, portfolio_summary: e.target.value })} /></label>
          <label style={{ fontSize: 13 }}>How you intend to use MANOP
            <textarea rows={3} style={field} value={form.intended_usage} onChange={e => setForm({ ...form, intended_usage: e.target.value })} /></label>
          <label style={{ fontSize: 13 }}>Service requirements (optional)
            <textarea rows={2} style={field} value={form.service_requirements} onChange={e => setForm({ ...form, service_requirements: e.target.value })} /></label>
          <label style={{ fontSize: 13 }}>Developments you expect to cover (optional)
            <textarea rows={2} style={field} value={form.expected_coverage} onChange={e => setForm({ ...form, expected_coverage: e.target.value })} /></label>
          <label style={{ fontSize: 13 }}>Activity you believe came through MANOP (optional)
            <textarea rows={2} style={field} value={form.manop_attributed_context} onChange={e => setForm({ ...form, manop_attributed_context: e.target.value })} /></label>
          <label style={{ fontSize: 13 }}>Activity outside MANOP you wish to mention (optional, context only; it is not used to set your price)
            <textarea rows={2} style={field} value={form.external_context} onChange={e => setForm({ ...form, external_context: e.target.value })} /></label>
          <button disabled={busy} style={{ minHeight: 40, padding: '0.4rem 1rem', fontWeight: 700, justifySelf: 'start' }} onClick={() => call('POST', { action: 'request', ...form }, 'Your request has been received. You can keep completing your profile and submissions meanwhile.')}>{busy ? 'Sending…' : 'Request a custom subscription'}</button>
        </div>
      ) : (!open && data.eligibility && !data.eligibility.ok && <p style={{ fontSize: 13 }}>{data.eligibility.reason}</p>)}
      <p style={{ fontSize: 12, marginTop: 10 }}>{data.notice}</p>
    </div>
  )
}