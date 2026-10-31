'use client'
// app/admin/developments/review/page.tsx — Review Submissions
//
// Dedicated review workspace for developments SUBMITTED by agencies/developers.
// MANOP's own records are created and managed in /admin/developments (Add / Manage).
// Uses the same developer_projects review fields and the same publishing rule
// as before: publish is blocked until reviewed_at is set. No new tables.
//
//   Open → Review → Request information → Mark reviewed → Publish
//
// "Request information" has no dedicated status in the schema: it saves the
// message into manop_flag_note (considerations) and records a
// development_info_requested event in activity_log. It does not notify the
// submitter by itself.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { sb } from '../../../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../../../lib/theme'
import { useAuth } from '../../../../lib/useAuth'
import ManopLoader from '../../../../components/ManopLoader'
import { logDevelopmentChange } from '../../../../lib/log-development-change'
import { awaitingReview } from '../../../../lib/submission-origin'
import DevelopmentCompleteness from '../../../../components/DevelopmentCompleteness'
import SurroundingDevelopments from '../../../../components/SurroundingDevelopments'

interface Submission {
  id: string; name: string; neighborhood: string | null; city: string | null; state: string | null
  country_code: string | null; stage: string | null; total_units: number | null; handover_date: string | null
  description: string | null; images: string[] | null; video_urls: string[] | null
  publish_status: string; submitted_via: string | null; submitting_agency_id: string | null
  mandate_type: string | null; mandate_document_url: string | null; fee_model: string | null
  reviewed_at: string | null; manop_checked_note: string | null; manop_flag_note: string | null
  created_at: string; developer_id: string
  developer_accounts: { company_name: string } | { company_name: string }[] | null
  data_partners: { name: string; verification_status: string } | { name: string; verification_status: string }[] | null
}
interface Doc { id: string; document_type: string; document_name: string; document_url: string; verified: boolean }
interface Unit { id: string; unit_type: string; price_ngn: number | null }

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

type Filter = 'needs_review' | 'ready'

export default function ReviewSubmissionsPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)
  const [rows, setRows] = useState<Submission[]>([])
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState<Filter>('needs_review')
  const [selectedId, setSelectedId] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [form, setForm] = useState({ checked: '', flag: '', request: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000) }

  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])

  const load = useCallback(async () => {
    const { data, error } = await sb.from('developer_projects')
      .select('id,name,neighborhood,city,state,country_code,stage,total_units,handover_date,description,images,video_urls,publish_status,submitted_via,submitting_agency_id,mandate_type,mandate_document_url,fee_model,reviewed_at,manop_checked_note,manop_flag_note,created_at,developer_id,developer_accounts(company_name),data_partners!submitting_agency_id(name,verification_status)')
      .neq('publish_status', 'published')
      .order('created_at', { ascending: false })
    if (error) { flash('Could not load submissions.', false); setLoaded(true); return }
    setRows(((data as unknown as Submission[]) || []).filter(awaitingReview))
    setLoaded(true)
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  const needsReview = useMemo(() => rows.filter(r => r.publish_status === 'pending_review' && !r.reviewed_at), [rows])
  const ready = useMemo(() => rows.filter(r => !!r.reviewed_at && r.publish_status !== 'rejected'), [rows])
  const list = filter === 'needs_review' ? needsReview : ready
  const sel = rows.find(r => r.id === selectedId) || null

  useEffect(() => {
    if (!sel) { setDocs([]); setUnits([]); setEvidenceCount(0); return }
    setForm({ checked: sel.manop_checked_note || '', flag: sel.manop_flag_note || '', request: '' })
    ;(async () => {
      const [d, u, e] = await Promise.all([
        sb.from('developer_documents').select('id,document_type,document_name,document_url,verified').eq('project_id', sel.id).order('provided_at', { ascending: false }),
        sb.from('developer_unit_types').select('id,unit_type,price_ngn').eq('project_id', sel.id),
        sb.from('development_evidence').select('id', { count: 'exact', head: true }).eq('project_id', sel.id),
      ])
      setDocs((d.data as Doc[]) || []); setUnits((u.data as Unit[]) || []); setEvidenceCount(e.count ?? 0)
    })()
  }, [sel?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function act(kind: 'save' | 'request' | 'review' | 'publish') {
    if (!sel || !user) return
    if (kind === 'request' && !form.request.trim()) { flash('Write what information you need from the submitter.', false); return }
    if (kind === 'publish' && !sel.reviewed_at) { flash('Mark as reviewed first — unreviewed developments cannot publish.', false); return }
    setBusy(true)
    const notes = { manop_checked_note: form.checked || null, manop_flag_note: form.flag || null }
    let patch: Record<string, unknown> = notes
    if (kind === 'request') patch = { ...notes, manop_flag_note: [form.flag, `Information requested: ${form.request.trim()}`].filter(Boolean).join('\n\n'), publish_status: 'pending_review' }
    if (kind === 'review')  patch = { ...notes, reviewed_at: new Date().toISOString() }
    if (kind === 'publish') patch = { publish_status: 'published' }
    const { error } = await sb.from('developer_projects').update(patch).eq('id', sel.id)
    if (error) { setBusy(false); flash(`Could not save: ${error.message}`, false); return }

    const ctx = { projectId: sel.id, projectName: sel.name, neighborhood: sel.neighborhood, city: sel.city, countryCode: sel.country_code, actorUserId: user.id, actorRole: 'admin' as const }
    if (kind === 'request') void logDevelopmentChange(sb, 'development_info_requested', ctx, { request: form.request.trim() })
    if (kind === 'review')  void logDevelopmentChange(sb, 'development_reviewed', ctx)
    if (kind === 'publish') void logDevelopmentChange(sb, 'development_published', ctx)

    flash(kind === 'save' ? '✓ Notes saved' : kind === 'request' ? '✓ Information request recorded' : kind === 'review' ? '✓ Marked as reviewed' : '✓ Published', true)
    if (kind === 'publish') setSelectedId('')
    setBusy(false)
    await load()
  }

  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />

  const bg = dark ? '#0F172A' : '#F8FAFC', bg2 = dark ? '#1E293B' : '#F1F5F9', bg3 = dark ? '#162032' : '#FFFFFF'
  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)', text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)', accent = '#5B2EFF', teal = '#14B8A6'
  const card: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.1rem', marginBottom: 14 }
  const label: React.CSSProperties = { fontSize: 11, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }
  const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.7rem', borderRadius: 8, border: `1px solid ${border}`, background: bg2, color: text, fontSize: 16, fontFamily: 'inherit', marginBottom: 10, minHeight: 64 }
  const btn = (primary: boolean, off = false): React.CSSProperties => ({ minHeight: 42, padding: '0.55rem 1rem', borderRadius: 8, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.4 : 1, border: primary ? 'none' : `1px solid ${border}`, background: primary ? accent : 'transparent', color: primary ? '#fff' : text })

  const agency = sel ? one(sel.data_partners) : null
  const developer = sel ? one(sel.developer_accounts) : null
  const check = sel ? [
    { ok: !!sel.description?.trim(), label: 'Description' },
    { ok: (sel.images?.length ?? 0) > 0, label: 'At least one image' },
    { ok: !!sel.stage, label: 'Stage' },
    { ok: !!sel.total_units, label: 'Total units' },
    { ok: !!sel.handover_date, label: 'Handover date' },
    { ok: units.some(u => u.price_ngn), label: 'A unit type with a price' },
    { ok: docs.length > 0, label: 'At least one supporting document' },
    ...(sel.submitting_agency_id ? [
      { ok: !!sel.mandate_document_url, label: 'Mandate document' },
      { ok: agency?.verification_status === 'verified', label: 'Agency verified by MANOP' },
    ] : []),
  ] : []

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh' }}>
      <style>{`.rv-grid{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px}@media(max-width:820px){.rv-grid{grid-template-columns:1fr}}`}</style>
      <div style={{ borderBottom: `1px solid ${border}`, padding: '0.8rem clamp(1rem,3vw,1.5rem)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Admin · Review Submissions</div>
          <div style={{ fontSize: 11, color: text3 }}>Developments submitted by agencies and developers</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
          <Link href="/admin/developments" style={{ color: teal, textDecoration: 'none', fontWeight: 700 }}>Add / Manage Developments →</Link>
          <Link href="/admin" style={{ color: text2, textDecoration: 'none' }}>Overview</Link>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(1rem,3vw,1.5rem)' }}>
        {msg && <div role="status" style={{ ...card, color: msg.ok ? '#22C55E' : '#EF4444', fontSize: 13 }}>{msg.text}</div>}

        <div className="rv-grid">
          {/* Queue */}
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {([['needs_review', `Needs review (${needsReview.length})`], ['ready', `Reviewed, not published (${ready.length})`]] as [Filter, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ ...btn(filter === k), flex: 1, fontSize: 12, padding: '0.5rem 0.4rem' }}>{l}</button>
              ))}
            </div>
            {!loaded && <div style={{ fontSize: 13, color: text3 }}>Loading…</div>}
            {loaded && list.length === 0 && (
              <div style={{ ...card, fontSize: 13, color: text3 }}>
                {filter === 'needs_review' ? 'No submissions waiting for review.' : 'Nothing reviewed and waiting to publish.'}
              </div>
            )}
            {list.map(r => {
              const ag = one(r.data_partners), dv = one(r.developer_accounts)
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', color: text, cursor: 'pointer', background: r.id === selectedId ? bg2 : bg3, border: `1px solid ${r.id === selectedId ? accent : border}`, borderRadius: 12, padding: '0.85rem 1rem', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: text2, marginTop: 2 }}>{[r.neighborhood, r.city].filter(Boolean).join(', ') || 'Location not given'}</div>
                  <div style={{ fontSize: 11.5, color: text3, marginTop: 4 }}>
                    {dv?.company_name || 'Developer unknown'}{ag ? ` · via ${ag.name}` : ''} · {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Review workspace */}
          <div>
            {!sel && <div style={{ ...card, color: text3, fontSize: 13 }}>Select a submission to review it.</div>}
            {sel && (
              <>
                <div style={card}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{sel.name}</div>
                  <div style={{ fontSize: 13, color: text2, marginTop: 4, lineHeight: 1.7 }}>
                    {[sel.neighborhood, sel.city, sel.state].filter(Boolean).join(', ') || 'Location not given'}<br />
                    Developer: {developer?.company_name || 'unknown'}<br />
                    Submitted by: {agency ? `${agency.name} (${agency.verification_status})` : 'MANOP team or developer'} · {new Date(sel.created_at).toLocaleDateString()}<br />
                    Stage: {sel.stage || '—'} · Units: {sel.total_units ?? '—'} · Handover: {sel.handover_date || '—'}
                    {sel.submitting_agency_id && <><br />Mandate: {sel.mandate_type || '—'} · Fee model: {sel.fee_model || '—'}</>}
                  </div>
                  {sel.description && <p style={{ fontSize: 13, color: text2, lineHeight: 1.65, margin: '10px 0 0' }}>{sel.description}</p>}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <DevelopmentCompleteness projectId={sel.id} dark={dark} tier="all" reloadToken={`${docs.length}-${units.length}-${evidenceCount}`} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <SurroundingDevelopments projectId={sel.id} neighborhood={sel.neighborhood} city={sel.city} dark={dark} />
                </div>

                {!!sel.images?.length && (
                  <div style={card}>
                    <span style={label}>Media</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {sel.images.slice(0, 8).map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`${sel.name} ${i + 1}`} loading="lazy" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: `1px solid ${border}` }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div style={card}>
                  <span style={label}>Submitted documents</span>
                  {docs.length === 0 && <div style={{ fontSize: 13, color: text3 }}>None attached.</div>}
                  {docs.map(d => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0.45rem 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
                      <a href={d.document_url} target="_blank" rel="noreferrer" style={{ color: teal, textDecoration: 'none', wordBreak: 'break-word' }}>{d.document_name} <span style={{ color: text3 }}>· {d.document_type}</span></a>
                      <span style={{ color: d.verified ? '#22C55E' : text3, whiteSpace: 'nowrap' }}>{d.verified ? 'Verified' : 'Unverified'}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11.5, color: text3, marginTop: 8 }}>Verify documents and record evidence in <Link href="/admin/developments" style={{ color: teal }}>Add / Manage Developments</Link>.</div>
                </div>

                <div style={card}>
                  <span style={label}>What we checked</span>
                  <textarea style={input} value={form.checked} onChange={e => setForm({ ...form, checked: e.target.value })} />
                  <span style={label}>Identified considerations (or state that none were found)</span>
                  <textarea style={input} value={form.flag} onChange={e => setForm({ ...form, flag: e.target.value })} />
                  <span style={label}>Request information from the submitter</span>
                  <textarea style={input} placeholder="e.g. Please upload the Certificate of Occupancy." value={form.request} onChange={e => setForm({ ...form, request: e.target.value })} />
                  <div style={{ fontSize: 11.5, color: text3, marginBottom: 12 }}>
                    MANOP does not issue recommendations. Marking as reviewed records what MANOP checked and found; it is not an endorsement.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button disabled={busy} style={btn(false)} onClick={() => act('save')}>Save notes</button>
                    <button disabled={busy} style={btn(false)} onClick={() => act('request')}>Request information</button>
                    <button disabled={busy} style={btn(true)} onClick={() => act('review')}>Mark as reviewed</button>
                    <button disabled={busy || !sel.reviewed_at} style={btn(true, !sel.reviewed_at)} onClick={() => act('publish')}>Publish</button>
                  </div>
                  {!sel.reviewed_at && <div style={{ fontSize: 11.5, color: '#F59E0B', marginTop: 8 }}>Publishing is blocked until this development is marked as reviewed.</div>}
                  {sel.reviewed_at && <div style={{ fontSize: 11.5, color: '#14B8A6', marginTop: 8 }}>✓ Reviewed {new Date(sel.reviewed_at).toLocaleDateString()}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}