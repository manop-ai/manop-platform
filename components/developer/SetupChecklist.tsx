'use client'
// components/developer/SetupChecklist.tsx — the developer's "get started" card: complete the profile, get verified, add a development.
// Reads its state from /api/developer/setup-status and asks for verification through /api/developer/verification-request. It never verifies
// anything itself: only a MANOP admin can.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Circle, Clock } from 'lucide-react'
import { authedFetch } from '../../lib/authed-fetch'
import type { SetupStatus } from '../../lib/developer-setup'

interface Props { dark: boolean; projectCount: number; submittedCount: number; onAddProject: () => void; compact?: boolean }

export default function SetupChecklist({ dark, projectCount, submittedCount, onAddProject, compact }: Props) {
  const [st, setSt] = useState<SetupStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await authedFetch('/api/developer/setup-status'); const j = await r.json().catch(() => ({}))
      if (r.ok && j.exists) setSt(j.status as SetupStatus)
    } catch { /* the card simply stays hidden if this cannot load */ }
  }, [])
  useEffect(() => { load() }, [load])

  async function requestVerification() {
    setBusy(true); setMsg(null)
    try {
      const r = await authedFetch('/api/developer/verification-request', { method: 'POST' }); const j = await r.json().catch(() => ({}))
      if (!r.ok) setMsg({ ok: false, text: j.error || 'Could not send the request.' })
      else { setMsg({ ok: true, text: 'Request sent. MANOP will review your company and get back to you.' }); await load() }
    } finally { setBusy(false) }
  }

  if (!st) return null
  const allDone = st.profileComplete && st.verified && projectCount > 0
  if (allDone && compact) return null

  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.7)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.12)', card = dark ? '#162032' : '#FFFFFF'
  const TEAL = dark ? '#2DD4BF' : '#0D9488'
  const btn: React.CSSProperties = { background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.55rem 1rem', fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-block' }

  const steps = [
    { key: 'profile', done: st.profileComplete, title: 'Complete your company profile',
      body: st.profileComplete ? 'Your profile is complete.' : `Still needed: ${st.missing.join(', ')}.`,
      action: st.profileComplete ? null : <Link href="/developer/onboard" style={btn}>Complete profile</Link> },
    { key: 'verify', done: st.verified, waiting: st.verification === 'waiting', title: 'Get your account verified by MANOP',
      body: st.verified ? 'Your account is verified.'
        : st.verification === 'waiting' ? 'Requested. MANOP is reviewing your company and will be in touch.'
        : 'MANOP checks your company before your developments can be reviewed and published. Verification is MANOP’s decision.',
      action: st.verified || st.verification === 'waiting' ? null
        : <button style={{ ...btn, opacity: st.profileComplete ? 1 : 0.5 }} disabled={busy || !st.profileComplete} onClick={requestVerification}>{busy ? 'Sending…' : 'Request verification'}</button> },
    { key: 'project', done: projectCount > 0, title: 'Add your first development',
      body: projectCount === 0 ? 'Save it as a draft any time. Submit it for MANOP review when it is ready.'
        : submittedCount === 0 ? 'Your draft is saved. Submit it for MANOP review when it is ready.' : 'Submitted. See its status under Review status.',
      action: projectCount === 0 ? <button style={btn} onClick={onAddProject}>Add a development</button> : null },
  ]

  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.1rem 1.25rem', marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: TEAL, marginBottom: 10 }}>Getting started</div>
      <div style={{ display: 'grid', gap: 14 }}>
        {steps.map(s => (
          <div key={s.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ marginTop: 2, color: s.done ? TEAL : s.waiting ? '#A78BFA' : text2 }}>
              {s.done ? <Check size={18} /> : s.waiting ? <Clock size={18} /> : <Circle size={18} />}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{s.title}</div>
              <div style={{ fontSize: 13, color: text2, lineHeight: 1.55, margin: '2px 0 8px' }}>{s.body}</div>
              {s.action}
            </div>
          </div>
        ))}
      </div>
      {msg && <div role="status" style={{ marginTop: 12, fontSize: 12.5, color: msg.ok ? TEAL : '#EF4444' }}>{msg.text}</div>}
    </div>
  )
}