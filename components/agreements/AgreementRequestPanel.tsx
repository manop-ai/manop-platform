'use client'

// components/agreements/AgreementRequestPanel.tsx
//
// A requester's view of the commercial agreement workflow: their requests and status, MANOP's messages, a new-request
// form, and edit/resubmit/withdraw. Used by the agency dashboard and the developer dashboard. All data comes from
// /api/agreements via authedFetch (the caller's own session); nothing here reads another company's requests.

import { useCallback, useEffect, useState } from 'react'
import { authedFetch } from '../../lib/authed-fetch'
import {
  OPTION_LABEL, REQUESTER_EDITABLE, REQUESTER_WITHDRAWABLE, STATUS_EXPLANATION, STATUS_LABEL, DISCLOSURE_STATUS_LABEL, formatMoney,
  type CommercialOption, type RequestStatus,
} from '../../lib/commercial-terms'
import AgreementRequestForm, { type ReqRow } from './AgreementRequestForm'
import AgreementDocumentsSection from './AgreementDocumentsSection'

interface ListRow { id: string; reference: string; status: RequestStatus; preferred_option: CommercialOption | null; company_name: string; submitted_at: string | null; status_updated_at: string; created_at: string }
interface Detail { request: ReqRow; project_ids: string[]; developments: { id: string; name: string }[]; events: { id: string; event_type: string; message: string | null; created_at: string; actor_role: string; to_status: string | null }[]; gaps: string[]; proposal: any }

export default function AgreementRequestPanel({ role, dark, startForProject = null, openRequestId = null, onHandled }: { role: 'agency' | 'developer'; dark: boolean; startForProject?: string | null; openRequestId?: string | null; onHandled?: () => void }) {
  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3 = dark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.6)', border = dark ? 'rgba(248,250,252,0.14)' : 'rgba(15,23,42,0.18)'
  const bg3 = dark ? '#162032' : '#FFFFFF', accent = '#5B2EFF', teal = '#14B8A6', amber = '#F59E0B'

  const [list, setList] = useState<ListRow[] | null>(null)
  const [meta, setMeta] = useState<{ defaults: any; projects: { id: string; name: string }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'new' | 'edit'>('list')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [done, setDone] = useState<{ request: ReqRow; submitted: boolean; notification: { attempted: boolean } | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [preset, setPreset] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/agreements?role=${role}`); const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not load your agreement requests.'); setList([]); return }
    setList(j.requests); setMeta({ defaults: j.defaults, projects: j.projects }); setErr(null)
  }, [role])
  useEffect(() => { load() }, [load])

  async function open(id: string) {
    const res = await authedFetch(`/api/agreements/${id}`); const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not open this request.'); return }
    setDetail(j); setDone(null)
  }
  // Arriving from a development's progress page: open the new-request form with that development already chosen, or open the existing request.
  useEffect(() => {
    if (startForProject && meta) { setPreset(startForProject); setDetail(null); setDone(null); setView('new'); onHandled?.() }
  }, [startForProject, meta]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openRequestId && meta) { open(openRequestId); onHandled?.() } }, [openRequestId, meta]) // eslint-disable-line react-hooks/exhaustive-deps

  async function withdraw(id: string) {
    if (!window.confirm('Withdraw this request? You can submit a new one later.')) return
    setBusy(true)
    const res = await authedFetch(`/api/agreements/${id}/withdraw`, { method: 'POST' }); const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(j.error || 'Could not withdraw.'); return }
    setDetail(null); await load()
  }

  const badge = (s: RequestStatus) => {
    const c = s === 'executed' ? '#22C55E' : s === 'declined' || s === 'withdrawn' ? '#EF4444' : s === 'information_required' || s === 'clarification_requested' ? amber : teal
    return <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: c, border: `1px solid ${c}`, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' }}>{STATUS_LABEL[s]}</span>
  }
  const card: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 4, padding: 'clamp(0.9rem,3vw,1.25rem)', marginBottom: 12, background: bg3, color: text }
  const btn: React.CSSProperties = { minHeight: 44, padding: '0.55rem 1.1rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

  if (view === 'new' || view === 'edit') {
    if (!meta) return <div style={{ color: text3 }}>Loading…</div>
    return (
      <AgreementRequestForm
        role={role} dark={dark} projects={meta.projects} defaults={meta.defaults}
        existing={view === 'edit' && detail ? { request: detail.request, project_ids: detail.project_ids } : null}
        presetProjectId={view === 'new' ? preset : null}
        onCancel={() => { setView('list') }}
        onDone={async r => { setDone(r); setView('list'); setDetail(null); await load() }}
      />
    )
  }

  return (
    <div style={{ color: text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Commercial agreement</div>
          <div style={{ fontSize: 13.5, color: text2, lineHeight: 1.6, maxWidth: 620 }}>
            Request MANOP&apos;s commercial agreement for your developments. Two proposed options exist as alternatives; nothing is binding until an agreement is signed.
          </div>
        </div>
        <button style={{ ...btn, background: accent, borderColor: accent, color: '#fff' }} onClick={() => { setDetail(null); setDone(null); setPreset(null); setView('new') }}>New request</button>
      </div>

      {err && <div role="alert" style={{ ...card, borderColor: '#EF4444', color: '#EF4444', fontSize: 14 }}>{err}</div>}

      {done && (
        <div role="status" style={{ ...card, borderColor: teal }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{done.submitted ? 'Request submitted' : 'Draft saved'}</div>
          <div style={{ fontSize: 14, color: text2, lineHeight: 1.65 }}>
            Reference <strong>{done.request.reference}</strong> · status <strong>{STATUS_LABEL[done.request.status as RequestStatus]}</strong>.{' '}
            {done.submitted
              ? <>Your request is saved and in MANOP&apos;s review queue{done.notification?.attempted ? ', and the MANOP team has been notified' : ''}. No terms are agreed. You can follow its status below.</>
              : <>It is saved to your account. Open it below to finish and submit it.</>}
          </div>
        </div>
      )}

      {detail ? (
        <div>
          <button style={{ ...btn, border: 'none', padding: '0.4rem 0', color: text3 }} onClick={() => setDetail(null)}>← All requests</button>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{detail.request.reference}</div>{badge(detail.request.status as RequestStatus)}
            </div>
            <div style={{ fontSize: 14, color: text2, margin: '8px 0', lineHeight: 1.65 }}>{STATUS_EXPLANATION[detail.request.status as RequestStatus]}</div>
            <div style={{ fontSize: 13.5, color: text2, lineHeight: 1.8 }}>
              {detail.request.preferred_option && <>Preference you gave (not agreed): <strong>{OPTION_LABEL[detail.request.preferred_option as CommercialOption]}</strong><br /></>}
              Developments: {detail.developments.map(d => d.name).join(', ') || (detail.request.opportunity_kind === 'agency_level' || !detail.request.opportunity_kind ? 'None (agency-level request)' : '—')}<br />
              {detail.request.opportunity_kind && <>Opportunity type: {detail.request.opportunity_kind.replace('_', ' ')}<br /></>}
              {detail.request.preferred_option === 'agency_commission_share' && detail.request.disclosure_status && <>Commission details: {DISCLOSURE_STATUS_LABEL[detail.request.disclosure_status] ?? detail.request.disclosure_status}<br /></>}
              {detail.proposal?.status === 'calculated' && <>Illustrative proposed MANOP amount: <strong>{formatMoney(detail.proposal.amount, detail.proposal.currency)}</strong> (not an amount owed)</>}
            </div>
            {detail.gaps.length > 0 && !['executed', 'declined', 'withdrawn'].includes(detail.request.status) && (
              <div style={{ marginTop: 10, fontSize: 13.5, color: amber, lineHeight: 1.6 }}>Still needed: {detail.gaps.join('; ')}.</div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              {REQUESTER_EDITABLE.includes(detail.request.status as RequestStatus) && (
                <button style={{ ...btn, background: accent, borderColor: accent, color: '#fff' }} onClick={() => setView('edit')}>{detail.request.status === 'draft' ? 'Continue editing' : 'Update and resubmit'}</button>
              )}
              {REQUESTER_WITHDRAWABLE.includes(detail.request.status as RequestStatus) && <button style={btn} disabled={busy} onClick={() => withdraw(detail.request.id)}>Withdraw request</button>}
            </div>
          </div>
          <AgreementDocumentsSection requestId={detail.request.id} status={detail.request.status} dark={dark} onChanged={() => { open(detail.request.id); load() }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '16px 0 8px' }}>History</div>
          {detail.events.map(ev => (
            <div key={ev.id} style={{ borderLeft: `2px solid ${ev.actor_role === 'admin' ? teal : border}`, paddingLeft: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: text3 }}>{new Date(ev.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {ev.actor_role === 'admin' ? 'MANOP' : 'You'}{ev.to_status ? ` · ${STATUS_LABEL[ev.to_status as RequestStatus] ?? ev.to_status}` : ''}</div>
              {ev.message && <div style={{ fontSize: 14, lineHeight: 1.65, marginTop: 2, whiteSpace: 'pre-wrap' }}>{ev.message}</div>}
            </div>
          ))}
        </div>
      ) : list === null ? (
        <div style={{ color: text3 }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ ...card, color: text2, fontSize: 14, lineHeight: 1.65 }}>You have not requested an agreement yet. Choose <strong>New request</strong> to start. You can save a draft and come back to it.</div>
      ) : (
        list.map(r => (
          <button key={r.id} onClick={() => open(r.id)} style={{ ...card, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontWeight: 800 }}>{r.reference}</span>{badge(r.status)}
            </div>
            <div style={{ fontSize: 13.5, color: text2, marginTop: 6 }}>
              {r.preferred_option ? OPTION_LABEL[r.preferred_option] : 'No option chosen yet'} · {r.submitted_at ? `submitted ${new Date(r.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'not yet submitted'}
            </div>
            {(r.status === 'information_required' || r.status === 'clarification_requested') && <div style={{ fontSize: 13.5, color: amber, marginTop: 6 }}>MANOP is waiting for your update. Open to see what is needed.</div>}
          </button>
        ))
      )}
    </div>
  )
}