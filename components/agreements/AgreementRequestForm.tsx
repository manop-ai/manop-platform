'use client'

// components/agreements/AgreementRequestForm.tsx
//
// Request the MANOP commercial agreement. Everything here is PROPOSED: submitting records the requester's preference
// and information; it does not accept terms and creates no binding agreement. The two options are alternatives and
// none is pre-selected. Agencies that choose commission sharing are asked, explicitly, for their commission structure.

import { useMemo, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'
import {
  OPTION_LABEL, PROPOSED_FEE_RATE_PCT, PROPOSED_SHARE_RATE_PCT, SUPPORTED_CURRENCIES, formatMoney, proposalFor, readinessGaps,
  type CommercialOption, type RequestLike,
} from '../../lib/commercial-terms'

export interface ReqRow { id: string; reference: string; status: string; [k: string]: any }
interface Props {
  role: 'agency' | 'developer'
  dark: boolean
  projects: { id: string; name: string; publishStatus?: string; location?: string; statusLabel?: string; mandateLabel?: string | null; blockedReason?: string | null }[]
  defaults: { company_name: string; requester_name: string; contact_email: string; contact_phone: string }
  /** when editing a returned/draft request */
  existing?: { request: ReqRow; project_ids: string[] } | null
  /** opened from a development's progress page: that development is already selected */
  presetProjectId?: string | null
  onDone: (result: { request: ReqRow; submitted: boolean; notification: { attempted: boolean } | null }) => void
  onCancel: () => void
}

const VARIES = [['development', 'By development'], ['unit_type', 'By unit type'], ['transaction', 'By transaction'], ['client', 'By client']] as const
const PAYERS = ['Buyer', 'Developer', 'Seller', 'Split between parties', 'Other']

export default function AgreementRequestForm({ role, dark, projects, defaults, existing, presetProjectId, onDone, onCancel }: Props) {
  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3 = dark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.6)', border = dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.18)'
  const bg3 = dark ? '#162032' : '#FFFFFF', accent = '#5B2EFF', teal = '#14B8A6', amber = '#F59E0B'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.05)' : '#fff', color: text, fontSize: 16, fontFamily: 'inherit' }
  const lab: React.CSSProperties = { fontSize: 12, color: text3, display: 'block', marginBottom: 5, fontWeight: 600 }
  const card: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 4, padding: 'clamp(0.9rem,3vw,1.25rem)', marginBottom: 14, background: bg3 }
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }

  const [pq, setPq] = useState('')
  const [pStatus, setPStatus] = useState<'all' | 'published' | 'pending_review' | 'draft'>('all')
  const e = existing?.request
  const [clientId] = useState(() => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`))
  const [f, setF] = useState({
    company_name: e?.company_name ?? defaults.company_name, requester_name: e?.requester_name ?? defaults.requester_name, requester_title: e?.requester_title ?? '',
    contact_email: e?.contact_email ?? defaults.contact_email, contact_phone: e?.contact_phone ?? defaults.contact_phone,
    counterparty_name: e?.counterparty_name ?? '', preferred_option: (e?.preferred_option ?? null) as CommercialOption | null,
    currency: e?.currency ?? 'NGN', illustrative_transaction_value: e?.illustrative_transaction_value != null ? String(e.illustrative_transaction_value) : '',
    commission_type: e?.commission_type ?? '', commission_rate_pct: e?.commission_rate_pct != null ? String(e.commission_rate_pct) : '',
    commission_fixed_amount: e?.commission_fixed_amount != null ? String(e.commission_fixed_amount) : '', commission_basis: e?.commission_basis ?? '',
    commission_pct_scope: e?.commission_pct_scope ?? '', commission_payer: e?.commission_payer ?? '',
    commission_shared: (e?.commission_shared ?? null) as boolean | null, commission_shared_details: e?.commission_shared_details ?? '',
    commission_retained_pct: e?.commission_retained_pct != null ? String(e.commission_retained_pct) : '',
    commission_varies: (e?.commission_varies ?? null) as string[] | null, commission_notes: e?.commission_notes ?? '',
    disclosure_declined: !!e?.disclosure_declined, requester_notes: e?.requester_notes ?? '', questions: e?.questions ?? '',
    project_ids: existing?.project_ids ?? (presetProjectId ? [presetProjectId] : ([] as string[])),
    opportunity_kind: (e?.opportunity_kind ?? (presetProjectId ? 'development' : '')) as string, scope_note: e?.scope_note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(p => ({ ...p, [k]: v }))

  const isAgencyB = role === 'agency' && f.preferred_option === 'agency_commission_share'
  const isDevB = role === 'developer' && f.preferred_option === 'agency_commission_share'
  const gaps = useMemo(() => readinessGaps({ ...f, commission_varies: f.commission_varies, commission_shared: f.commission_shared } as any, role), [f, role])
  const calc = useMemo(() => proposalFor({
    requester_role: role, preferred_option: f.preferred_option, currency: f.currency, illustrative_transaction_value: f.illustrative_transaction_value,
    proposed_fee_rate_pct: PROPOSED_FEE_RATE_PCT, proposed_share_rate_pct: PROPOSED_SHARE_RATE_PCT, commission_type: (f.commission_type || null) as any,
    commission_rate_pct: f.commission_rate_pct, commission_fixed_amount: f.commission_fixed_amount, commission_pct_scope: (f.commission_pct_scope || null) as any,
    commission_shared: f.commission_shared, commission_retained_pct: f.commission_retained_pct,
  } as RequestLike), [f, role])

  async function send(submit: boolean) {
    if (busy) return
    setBusy(true); setErr(null)
    const body = { ...f, client_request_id: clientId, requester_role: role, submit }
    const res = await authedFetch(e ? `/api/agreements/${e.id}` : '/api/agreements', { method: e ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(j.error || 'Something went wrong. Please try again.'); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    onDone({ request: j.request, submitted: submit, notification: j.notification ?? null })
  }

  const _unusedOptionCard = ({ value, title, rate, desc }: { value: CommercialOption; title: string; rate?: string; desc: string }) => {
    const on = f.preferred_option === value
    return (
      <label style={{ ...card, marginBottom: 10, cursor: 'pointer', display: 'block', borderColor: on ? accent : border, background: on ? (dark ? 'rgba(91,46,255,0.12)' : 'rgba(91,46,255,0.06)') : bg3 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input type="radio" name="opt" checked={on} onChange={() => set('preferred_option', value)} style={{ marginTop: 4, width: 18, height: 18 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: text }}>{title}{rate && <span style={{ color: teal, fontWeight: 700 }}> · {rate}</span>}</div>
            <div style={{ fontSize: 13.5, color: text2, lineHeight: 1.6, marginTop: 4 }}>{desc}</div>
          </div>
        </div>
      </label>
    )
  }

  return (
    <div style={{ color: text }}>
      {err && <div role="alert" style={{ ...card, borderColor: '#EF4444', color: '#EF4444', fontSize: 14 }}>{err}</div>}

      <div style={{ ...card, borderColor: amber }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Requesting an agreement is not agreeing to terms</div>
        <div style={{ fontSize: 13.5, color: text2, lineHeight: 1.65 }}>
          Tell MANOP which opportunity you want an agreement for. MANOP prepares the agreement and sets its terms, signs it first and sends it to you to sign by hand and upload.
          Nothing is binding until the agreement is signed and MANOP records it as completed. Asking for an agreement does not verify or publish anything, and it does not start any fee.
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }}>1 · Who is asking</div>
      <div style={card}>
        <div style={grid}>
          <div><label style={lab}>{role === 'agency' ? 'Agency name' : 'Company name'} *</label><input style={inp} value={f.company_name} onChange={ev => set('company_name', ev.target.value)} /></div>
          <div><label style={lab}>Your name *</label><input style={inp} value={f.requester_name} onChange={ev => set('requester_name', ev.target.value)} /></div>
          <div><label style={lab}>Your role in the company *</label><input style={inp} value={f.requester_title} onChange={ev => set('requester_title', ev.target.value)} placeholder="e.g. Managing Director" /></div>
          <div><label style={lab}>Business email *</label><input style={inp} type="email" inputMode="email" value={f.contact_email} onChange={ev => set('contact_email', ev.target.value)} /></div>
          <div><label style={lab}>Phone</label><input style={inp} type="tel" inputMode="tel" value={f.contact_phone} onChange={ev => set('contact_phone', ev.target.value)} /></div>
          <div>
            <label style={lab}>{role === 'agency' ? 'Developer you act for' : 'Agency involved (if any)'}{(role === 'agency' || isDevB) ? ' *' : ''}</label>
            <input style={inp} value={f.counterparty_name} onChange={ev => set('counterparty_name', ev.target.value)} placeholder={role === 'agency' ? 'Developer or owner name' : 'Leave blank if you work directly with MANOP'} />
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: text3, marginTop: 10, lineHeight: 1.6 }}>
          {role === 'agency' ? 'You are the agency; the developer is the other contracting party.' : 'You are the developer. If an agency represents you, name it so MANOP can address the right parties.'}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }}>2 · Your opportunity</div>
      <div style={card}>
        <div style={{ fontSize: 13.5, color: text2, marginBottom: 10, lineHeight: 1.6 }}>Search the developments you have submitted and tick the exact ones this agreement covers. Leave all unticked for a broader agency-level agreement.</div>
        {projects.length === 0 && <div style={{ fontSize: 14, color: text3 }}>You have not submitted an opportunity yet. You can still request a broader agency-level agreement below.</div>}
        {projects.length > 0 && (() => {
          const needle = pq.trim().toLowerCase()
          const shown = projects.filter(p => (pStatus === 'all' || p.publishStatus === pStatus) && (!needle || `${p.name} ${p.location ?? ''}`.toLowerCase().includes(needle)))
          const selectable = shown.filter(p => !(p.blockedReason && !f.project_ids.includes(p.id)))
          const chosen = projects.filter(p => f.project_ids.includes(p.id))
          const chip = (on: boolean): React.CSSProperties => ({ border: `1px solid ${on ? accent : border}`, background: on ? accent : 'transparent', color: on ? '#fff' : text2, borderRadius: 99, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32 })
          return (
            <>
              <input type="search" aria-label="Search your developments" placeholder="Search by development name or location" value={pq} onChange={ev => setPq(ev.target.value)} style={{ ...inp, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {([['all', 'All'], ['published', 'Published'], ['pending_review', 'In review'], ['draft', 'Draft']] as const).map(([k, l]) => (
                  <button type="button" key={k} style={chip(pStatus === k)} onClick={() => setPStatus(k)}>{l}</button>
                ))}
                <button type="button" style={{ ...chip(false), marginLeft: 'auto' }} disabled={selectable.length === 0}
                  onClick={() => set('project_ids', Array.from(new Set([...f.project_ids, ...selectable.map(p => p.id)])))}>Select all shown ({selectable.length})</button>
              </div>
              {chosen.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }} aria-label="Selected developments">
                  {chosen.map(p => (
                    <button type="button" key={p.id} onClick={() => set('project_ids', f.project_ids.filter(x => x !== p.id))} style={{ ...chip(true), background: 'transparent', color: text, borderColor: teal }} title="Remove from this agreement">
                      {p.name} ×
                    </button>
                  ))}
                  <button type="button" onClick={() => set('project_ids', [])} style={{ ...chip(false), border: 'none', textDecoration: 'underline' }}>Clear</button>
                </div>
              )}
              <div style={{ fontSize: 12, color: text3, marginBottom: 4 }}>{chosen.length} selected · showing {shown.length} of {projects.length}</div>
              <div style={{ maxHeight: 340, overflowY: 'auto', borderTop: `1px solid ${border}` }}>
                {shown.length === 0 && <div style={{ fontSize: 14, color: text3, padding: '14px 0' }}>No developments match. Clear the search or change the filter.</div>}
                {shown.map(p => {
                  const blocked = !!p.blockedReason && !f.project_ids.includes(p.id)
                  return (
                    <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, cursor: blocked ? 'not-allowed' : 'pointer', fontSize: 15, opacity: blocked ? 0.6 : 1, padding: '8px 0', borderBottom: `1px solid ${border}` }}>
                      <input type="checkbox" disabled={blocked} style={{ width: 18, height: 18, marginTop: 3 }} checked={f.project_ids.includes(p.id)} onChange={ev => set('project_ids', ev.target.checked ? [...f.project_ids, p.id] : f.project_ids.filter(x => x !== p.id))} />
                      <span>
                        <strong>{p.name}</strong>
                        <span style={{ display: 'block', fontSize: 12.5, color: text3 }}>{[p.location, p.statusLabel].filter(Boolean).join(' · ')}{p.mandateLabel ? ` · Mandate letter: ${p.mandateLabel}` : ''}</span>
                        {p.blockedReason && <span style={{ display: 'block', fontSize: 12.5, color: amber }}>{p.blockedReason}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }}>3 · What kind of arrangement</div>
      <div style={card}>
        <label style={{ display: 'block', fontSize: 13.5, marginBottom: 10 }}>Opportunity type
          <select value={f.opportunity_kind} onChange={ev => set('opportunity_kind', ev.target.value)} style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 4, background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 4, padding: '0.5rem', fontFamily: 'inherit' }}>
            <option value="">{f.project_ids.length ? 'Development (default)' : 'Agency-level arrangement (default, no single development)'}</option>
            <option value="development">Development</option><option value="redevelopment">Redevelopment opportunity</option><option value="land">Land opportunity</option><option value="agency_level">Agency-level arrangement (no single development)</option>
          </select>
        </label>
        <label style={{ display: 'block', fontSize: 13.5 }}>The arrangement you are asking for (optional; MANOP prepares the agreement and sets its terms)
          <textarea rows={3} value={f.scope_note} onChange={ev => set('scope_note', ev.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 4, padding: '0.5rem', fontFamily: 'inherit', fontSize: 14 }} />
        </label>
        <div style={{ fontSize: 12.5, color: text3, marginTop: 8, lineHeight: 1.6 }}>Your organisation details and the developments you tick above are attached automatically. Asking for an agreement does not verify or publish anything, and it does not start any fee.</div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }}>Notes and questions</div>
      <div style={card}>
        <label style={lab}>Anything else MANOP should know</label><textarea style={{ ...inp, minHeight: 80, marginBottom: 12 }} value={f.requester_notes} onChange={ev => set('requester_notes', ev.target.value)} />
        <label style={lab}>Questions for MANOP</label><textarea style={{ ...inp, minHeight: 70 }} value={f.questions} onChange={ev => set('questions', ev.target.value)} />
      </div>

      {gaps.length > 0 && (
        <div style={{ ...card, borderColor: amber }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Still needed before MANOP can consider this request</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: text2, lineHeight: 1.7 }}>{gaps.map(g => <li key={g}>{g}</li>)}</ul>
          <div style={{ fontSize: 12.5, color: text3, marginTop: 8 }}>You can still save a draft or submit; MANOP will ask for what is missing.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => send(true)} style={{ minHeight: 48, padding: '0.7rem 1.4rem', borderRadius: 4, border: 'none', background: accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit' }}>
          {busy ? 'Saving…' : e && (e.status === 'information_required' || e.status === 'clarification_requested') ? 'Update and resubmit' : 'Submit request'}
        </button>
        <button type="button" disabled={busy} onClick={() => send(false)} style={{ minHeight: 48, padding: '0.7rem 1.2rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Save draft</button>
        <button type="button" disabled={busy} onClick={onCancel} style={{ minHeight: 48, padding: '0.7rem 1rem', border: 'none', background: 'transparent', color: text3, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
      </div>
      <div style={{ fontSize: 12, color: text3, marginTop: 10, lineHeight: 1.6 }}>Proposed terms only. MANOP does not provide legal, financial or investment advice. Seek independent legal advice before signing any agreement.</div>
    </div>
  )
}