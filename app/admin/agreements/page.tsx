'use client'
// app/admin/agreements/page.tsx — MANOP admin: agreement requests (proposed commercial terms). Admin only.
// Data via /api/admin/agreements (the admin's own session; RLS is_manop_admin() is what actually protects it).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { authedFetch } from '../../../lib/authed-fetch'
import ManopLoader from '../../../components/ManopLoader'
import { OPTION_LABEL, STATUSES, STATUS_LABEL, DISCLOSURE_STATUS_LABEL, type CommercialOption, type RequestStatus } from '../../../lib/commercial-terms'

interface Row { id: string; reference: string; status: RequestStatus; requester_role: string; company_name: string; requester_name: string | null; contact_email: string | null; preferred_option: CommercialOption | null; disclosure_status: string | null; opportunity_kind?: string | null; developments?: { id: string; name: string }[]; submitted_at: string | null; status_updated_at: string }

export default function AdminAgreementsPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [status, setStatus] = useState('')
  const [email, setEmail] = useState<{ configured: boolean; missing: string[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])

  const load = useCallback(async () => {
    const res = await authedFetch(`/api/admin/agreements${status ? `?status=${status}` : ''}`); const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not load requests.'); setRows([]); return }
    setRows(j.requests); setEmail(j.email); setErr(null)
  }, [status])
  useEffect(() => { if (user) load() }, [user, load])

  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  const bg = dark ? '#0F172A' : '#F8FAFC', card = dark ? '#162032' : '#fff', text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.7)', text3 = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.55)', border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.12)'
  const col = (s: string) => (s === 'executed' ? '#22C55E' : s === 'declined' || s === 'withdrawn' ? '#EF4444' : s === 'submitted' || s.includes('required') || s.includes('requested') ? '#F59E0B' : '#14B8A6')

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/admin" style={{ color: text2, fontSize: 13, textDecoration: 'none' }}>← Command Center</Link>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>Agreement requests</h1>
        <p style={{ fontSize: 13, margin: '0 0 10px' }}><Link href="/admin/commercial" style={{ color: text2 }}>Commercial terms, Agency Subscriptions and agency routes →</Link></p>
        <p style={{ fontSize: 13.5, color: text2, margin: '0 0 14px', maxWidth: 680, lineHeight: 1.6 }}>Requests for MANOP&apos;s commercial agreement. Everything here is <strong>proposed</strong>: a request is never an executed agreement, and rates are proposals until an agreement is signed.</p>
        {email && !email.configured && <div role="status" style={{ border: '1px solid #F59E0B', borderRadius: 4, padding: '0.7rem 0.9rem', marginBottom: 12, fontSize: 13.5, color: '#F59E0B', lineHeight: 1.6 }}>Request notification emails are <strong>not being sent</strong>: missing environment variable{email.missing.length > 1 ? 's' : ''} <code>{email.missing.join(', ')}</code>. Requests still appear here.</div>}
        {err && <div role="alert" style={{ color: '#EF4444', marginBottom: 12, fontSize: 14 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {['', ...STATUSES.filter(s => s !== 'draft')].map(s => (
            <button key={s || 'all'} onClick={() => setStatus(s)} style={{ minHeight: 36, padding: '0.3rem 0.75rem', borderRadius: 4, border: `1px solid ${status === s ? '#5B2EFF' : border}`, background: status === s ? '#5B2EFF22' : 'transparent', color: text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{s ? STATUS_LABEL[s as RequestStatus] : 'All'}</button>
          ))}
        </div>
        {rows === null && <div style={{ color: text3 }}>Loading…</div>}
        {rows && rows.length === 0 && <div style={{ color: text3, padding: '2rem 0' }}>No agreement requests{status ? ' with this status' : ' yet'}.</div>}
        {rows?.map(r => (
          <Link key={r.id} href={`/admin/agreements/${r.id}`} style={{ display: 'block', background: card, border: `1px solid ${border}`, borderRadius: 4, padding: '1rem', marginBottom: 10, textDecoration: 'none', color: text }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div><span style={{ fontWeight: 800 }}>{r.reference}</span> <span style={{ color: text2 }}>· {r.company_name || '—'} ({r.requester_role})</span></div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: col(r.status), border: `1px solid ${col(r.status)}`, borderRadius: 4, padding: '2px 8px' }}>{STATUS_LABEL[r.status]}</span>
            </div>
            <div style={{ fontSize: 13, color: text2, marginTop: 6 }}>
              {(r.opportunity_kind ?? (r.developments?.length ? 'development' : 'agency-level'))} · {r.developments?.length ? r.developments.map(x => x.name).join(', ') : 'no single development'} · {r.preferred_option ? OPTION_LABEL[r.preferred_option] : 'no option preference'}{r.disclosure_status ? ` · commission details: ${DISCLOSURE_STATUS_LABEL[r.disclosure_status] ?? r.disclosure_status}` : ''}
            </div>
            <div style={{ fontSize: 12, color: text3, marginTop: 4 }}>{r.requester_name} · {r.contact_email} · updated {new Date(r.status_updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}