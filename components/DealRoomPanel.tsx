'use client'
// components/DealRoomPanel.tsx
//
// One introduction's Deal Room: the milestone timeline, what each party has
// said, and the actions the caller may take. It renders for buyer, developer,
// agency and admin from the same /api/deal-room response.
//
// What the buttons offer comes from validateAction() in lib/deal-room.ts — the
// same function the server runs — so the UI cannot offer something the server
// will refuse. The server remains the authority; this is only convenience.
//
// MANOP records the milestones needed to administer its own commercial
// agreement. It does not track the buyer's instalment schedule, and a
// self-reported milestone is always labelled as reported, never as verified.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase/client'
import {
  TIMELINE_ORDER, MILESTONE_LABEL, STATUS_LABEL, deriveStates, validateAction, assessFeeReadiness,
  type Action, type Milestone, type MilestoneRow, type Party,
} from '../lib/deal-room'
import { CheckCircle2, Circle, AlertTriangle, Clock, FileText } from 'lucide-react'
import UnitRequestSummary from './UnitRequestSummary'
import DealRoomConversation from './DealRoomConversation'
import { authedFetch } from '../lib/authed-fetch'

interface Props { leadId: string; dark?: boolean }

interface Payload {
  party: Party
  lead: Record<string, any>
  milestones: MilestoneRow[]
  termsVersion: string | null
}

const FEE_LABEL: Record<string, string> = {
  not_yet_due: 'No qualifying milestone reported',
  awaiting_confirmation: 'Qualifying milestone awaiting confirmation',
  candidate_due: 'Candidate for fee review',
  disputed: 'Qualifying milestone disputed',
  cancelled_or_adjusted: 'Cancelled — review for adjustment',
}

export default function DealRoomPanel({ leadId, dark = true }: Props) {
  const [data, setData] = useState<Payload | null>(null)
  const [userId, setUserId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Milestone | null>(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [rpParty, setRpParty] = useState<'developer' | 'agency'>('developer')
  const [rpReason, setRpReason] = useState('')

  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3  = dark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.6)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.16)'
  const bg     = dark ? '#162032' : '#FFFFFF'
  const input: React.CSSProperties = { background: 'transparent', color: text, border: `1px solid ${border}`, borderRadius: 8, padding: '0.45rem 0.6rem', fontSize: 12.5, width: '100%', boxSizing: 'border-box' }
  const btn = (primary = false): React.CSSProperties => ({
    fontSize: 12, fontWeight: 700, borderRadius: 8, padding: '0.4rem 0.75rem', cursor: 'pointer',
    background: primary ? '#14B8A6' : 'transparent', color: primary ? '#06201C' : text2,
    border: primary ? 'none' : `1px solid ${border}`,
  })

  const token = useCallback(async () => {
    const { data: s } = await sb.auth.getSession()
    setUserId(s.session?.user.id ?? '')
    return s.session?.access_token ?? ''
  }, [])

  const load = useCallback(async () => {
    setError(null)
    const t = await token()
    const res = await fetch(`/api/deal-room?lead_id=${encodeURIComponent(leadId)}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await res.json()
    if (!res.ok) { setError(j.error || 'Could not load this introduction.'); return }
    setData(j)
  }, [leadId, token])

  useEffect(() => { load() }, [load])

  const states = useMemo(() => deriveStates(data?.milestones ?? []), [data])
  const fee = useMemo(() => assessFeeReadiness(states, data?.termsVersion ?? null), [states, data])

  async function send(milestone: Milestone, action: Action, extra: { target_id?: string } = {}) {
    setBusy(true); setError(null)
    try {
      const t = await token()
      const res = await fetch('/api/deal-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          lead_id: leadId, milestone, action,
          event_date: date || null, note: note || null, evidence_ref: evidence || null, ...extra,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'That could not be recorded.'); return }
      setOpen(null); setDate(''); setNote(''); setEvidence('')
      await load()
    } finally { setBusy(false) }
  }

  async function recordResponsible() {
    setBusy(true); setError(null)
    try {
      const res = await authedFetch('/api/deal-room/responsible-party', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId, party: rpParty, reason: rpReason }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'Could not record that.'); return }
      setRpReason(''); await load()
    } finally { setBusy(false) }
  }

  if (error && !data) return <div style={{ fontSize: 12.5, color: '#EF4444' }}>{error}</div>
  if (!data) return <div style={{ fontSize: 12.5, color: text3 }}>Loading introduction…</div>

  const party = data.party
  const rows = data.milestones
  const can = (m: Milestone, a: Action, targetId?: string) =>
    !validateAction({ party, actorUserId: userId, action: a, milestone: m, targetId }, rows)

  const myLiveReport = (m: Milestone) => {
    const live = states[m]?.liveReportIds ?? []
    return rows.find(r => live.includes(r.id) && r.actor_user_id === userId)
  }

  const acknowledged = !!data.lead.acknowledged_at
  const repeats = (rows as any[]).filter(r => r.milestone === 'repeat_enquiry_received')
  const visible = TIMELINE_ORDER.filter(m => m !== 'introduction_created')

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '1rem', color: text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Introduction</div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{data.lead.manop_lead_id ?? leadId}</div>
        </div>
        <div style={{ fontSize: 12, color: text3, textAlign: 'right' }}>
          Viewing as {party}<br />Stage: {data.lead.stage}
        </div>
      </div>

      <div style={{ fontSize: 12, color: text2, lineHeight: 1.6, marginBottom: 12 }}>
        Use the conversation to talk to each other. Milestones below are statements by the parties, labelled by who made them. MANOP does not verify them
        and does not track the buyer’s payment schedule.
        {!acknowledged && ' This introduction has not been acknowledged by the developer or agency yet.'}
      </div>

      {/* Which unit was asked about, the price recorded at that moment, and the request type — straight from
          the lead's own snapshot, so nobody has to reopen the original form or guess from a price. */}
      <UnitRequestSummary lead={data.lead} dark={dark} />

      <div style={{ marginBottom: 14 }}><DealRoomConversation leadId={leadId} dark={dark} /></div>

      {party === 'admin' && (data.lead.routing_status || data.lead.manop_routing_required) && (
        <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '0.7rem', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Handoff</div>
          {(data.lead.routing_status === 'manop_operator' || data.lead.manop_routing_required) && !data.lead.referred_to_developer_at ? (
            <>
              <div style={{ fontSize: 12.5, color: text2, marginTop: 4, lineHeight: 1.5 }}>
                MANOP is holding this introduction. The developer or partner in charge cannot see it until you route it.
                Routing shares the enquirer&apos;s details with them (their consent must be on record). They then approve the introduction and start dealing with the client.
              </div>
              <button disabled={busy} style={{ ...btn(true), marginTop: 8 }} onClick={async () => {
                setBusy(true); setError(null)
                try {
                  const t = await token()
                  const res = await fetch('/api/deal-room/refer', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ lead_id: leadId }) })
                  const j = await res.json()
                  if (!res.ok) { setError(j.error || 'Could not route this introduction.'); return }
                  await load()
                } finally { setBusy(false) }
              }}>Route to developer / partner</button>
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: text2, marginTop: 4 }}>
              {data.lead.referred_to_developer_at ? `Routed to the developer / partner ${new Date(data.lead.referred_to_developer_at).toLocaleString()}.` : 'Not held by MANOP: routed directly when it arrived.'}
            </div>
          )}
        </div>
      )}

      {repeats.length > 0 && (
        <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '0.7rem', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Further enquiries on this introduction</div>
          {repeats.map(r => (
            <div key={r.id} style={{ fontSize: 12, color: text2, marginTop: 6, lineHeight: 1.5 }}>
              {r.created_at ? `${new Date(r.created_at).toLocaleDateString()}: ` : ''}{r.note || 'Repeat enquiry from the same contact.'}
            </div>
          ))}
        </div>
      )}

      {party === 'admin' && (
        <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '0.7rem', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Fee readiness (indicator only)</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{FEE_LABEL[fee.state]}</div>
          <div style={{ fontSize: 12, color: text2, marginTop: 2 }}>{fee.explanation}</div>
          <div style={{ fontSize: 11.5, color: text3, marginTop: 6 }}>
            Commercial terms: {data.termsVersion ?? 'none activated'} · Responsible party: {data.lead.responsible_party ?? 'not set'} ·
            Fee status: {data.lead.fee_status ?? 'not set'}
          </div>
          {!data.lead.responsible_party && (
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <div style={{ fontSize: 11.5, color: text3 }}>
                No party is recorded as responsible. This comes from an executed agreement; until that link exists, record a MANOP decision with a reason.
              </div>
              <select value={rpParty} onChange={e => setRpParty(e.target.value as 'developer' | 'agency')} style={input} aria-label="Responsible party">
                <option value="developer">Developer</option>
                <option value="agency">Agency</option>
              </select>
              <input value={rpReason} onChange={e => setRpReason(e.target.value)} placeholder="Reason for this decision" style={input} />
              <button disabled={busy} style={btn()} onClick={recordResponsible}>Record responsible party</button>
            </div>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 12.5, color: '#EF4444', marginBottom: 8 }}>{error}</div>}

      {visible.map(m => {
        const st = states[m]
        const status = st?.status ?? 'not_reported'
        const Icon = status === 'disputed' ? AlertTriangle
          : status === 'confirmed_by_both' || status === 'admin_resolved' ? CheckCircle2
          : status === 'not_reported' ? Circle : Clock
        const color = status === 'disputed' ? '#EF4444'
          : status === 'confirmed_by_both' || status === 'admin_resolved' ? '#14B8A6'
          : status === 'not_reported' ? text3 : '#F59E0B'
        const mine = myLiveReport(m)
        const isAck = m === 'introduction_acknowledged'
        const canReport = can(m, 'report') && !(isAck && acknowledged)
        const canConfirm = can(m, 'confirm') && !isAck
        const canDispute = can(m, 'dispute') && !isAck
        const canEvidence = can(m, 'evidence')
        const canRequest = can(m, 'request_confirmation')
        const canRetract = !!mine && can(m, 'retract', mine.id)
        const any = canReport || canConfirm || canDispute || canEvidence || canRequest || canRetract
        const isOpen = open === m

        return (
          <div key={m} style={{ borderTop: `1px solid ${border}`, padding: '0.65rem 0' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon size={16} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{MILESTONE_LABEL[m]}</div>
                <div style={{ fontSize: 12, color }}>{STATUS_LABEL[status]}</div>
                <div style={{ fontSize: 11.5, color: text3 }}>
                  {st?.eventDate ? `Event date ${st.eventDate}` : ''}
                  {st && st.evidenceCount > 0 ? `${st.eventDate ? ' · ' : ''}${st.evidenceCount} evidence note${st.evidenceCount > 1 ? 's' : ''}` : ''}
                  {st?.confirmationRequested ? ' · confirmation requested' : ''}
                </div>
              </div>
              {any && (
                <button style={btn()} onClick={() => setOpen(isOpen ? null : m)}>{isOpen ? 'Close' : 'Actions'}</button>
              )}
            </div>

            {isOpen && (
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} aria-label="Event date" />
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (required to dispute)" style={input} />
                <input value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Evidence: document name, reference or link (required for evidence)" style={input} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canReport && <button disabled={busy} style={btn(true)} onClick={() => send(m, 'report')}>{isAck ? 'Acknowledge receipt' : 'Report this'}</button>}
                  {canConfirm && <button disabled={busy} style={btn(true)} onClick={() => send(m, 'confirm')}>Confirm</button>}
                  {canDispute && <button disabled={busy} style={btn()} onClick={() => send(m, 'dispute')}>Dispute</button>}
                  {canEvidence && <button disabled={busy} style={btn()} onClick={() => send(m, 'evidence')}><FileText size={12} style={{ verticalAlign: -2 }} /> Add evidence</button>}
                  {canRequest && <button disabled={busy} style={btn()} onClick={() => send(m, 'request_confirmation')}>Request confirmation</button>}
                  {canRetract && mine && <button disabled={busy} style={btn()} onClick={() => send(m, 'retract', { target_id: mine.id })}>Retract my report</button>}
                </div>
                {isAck && !data.termsVersion && (
                  <div style={{ fontSize: 11.5, color: text3 }}>
                    No commercial terms are active yet, so this records receipt only. It is not acceptance of any fee terms.
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}