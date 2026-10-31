'use client'
// app/admin/research/page.tsx — MANOP Research: article list (admin)
// Data flows through /api/admin/articles (caller's session via authedFetch; RLS enforces admin).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { authedFetch } from '../../../lib/authed-fetch'
import ManopLoader from '../../../components/ManopLoader'
import { resolveLocation } from '../../../lib/locations'
import type { ArticleListRow, ArticleStatus } from '../../../lib/research'

export default function AdminResearchPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)
  const [rows, setRows] = useState<ArticleListRow[] | null>(null)
  const [filter, setFilter] = useState<'all' | ArticleStatus>('all')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])

  const load = useCallback(async () => {
    const res = await authedFetch('/api/admin/articles'); const j = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg({ ok: false, text: j.error || 'Could not load articles.' }); setRows([]); return }
    setRows(j.articles)
  }, [])
  useEffect(() => { if (user) load() }, [user, load])

  async function setStatus(id: string, status: ArticleStatus) {
    const res = await authedFetch(`/api/admin/articles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    const j = await res.json().catch(() => ({}))
    setMsg({ ok: res.ok, text: res.ok ? (status === 'published' ? 'Published.' : 'Unpublished.') : j.error || 'Could not update.' })
    await load()
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this article permanently?')) return
    const res = await authedFetch(`/api/admin/articles/${id}`, { method: 'DELETE' }); const j = await res.json().catch(() => ({}))
    setMsg({ ok: res.ok, text: res.ok ? 'Deleted.' : j.error || 'Could not delete.' }); await load()
  }

  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  const bg = dark ? '#0F172A' : '#F8FAFC', card = dark ? '#162032' : '#fff'
  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)', text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const btn: React.CSSProperties = { minHeight: 36, padding: '0.35rem 0.8rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontFamily: 'inherit' }
  const shown = (rows ?? []).filter(r => filter === 'all' || r.status === filter)
  const colour = (s: string) => (s === 'published' ? '#22C55E' : s === 'unpublished' ? '#F59E0B' : text3)

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <Link href="/admin" style={{ color: text2, fontSize: 13, textDecoration: 'none' }}>← Command Center</Link>
          <Link href="/admin/research/new" style={{ ...btn, background: '#5B2EFF', borderColor: '#5B2EFF', color: '#fff' }}>+ New article</Link>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '8px 0 4px' }}>MANOP Research</h1>
        <p style={{ fontSize: 13.5, color: text2, margin: '0 0 16px' }}>Published articles appear on Market Intelligence automatically. Unpublished and draft articles are never public.</p>
        {msg && <div role="status" style={{ padding: '0.6rem 0.8rem', borderRadius: 4, marginBottom: 12, fontSize: 13, color: msg.ok ? '#22C55E' : '#EF4444', border: `1px solid ${msg.ok ? '#22C55E55' : '#EF444455'}` }}>{msg.text}</div>}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {(['all', 'draft', 'published', 'unpublished'] as const).map(s => (
            <button key={s} style={{ ...btn, background: filter === s ? '#5B2EFF22' : 'transparent', borderColor: filter === s ? '#5B2EFF' : border }} onClick={() => setFilter(s)}>
              {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}{rows ? ` (${s === 'all' ? rows.length : rows.filter(r => r.status === s).length})` : ''}
            </button>))}
        </div>
        {rows === null && <div style={{ color: text3, fontSize: 14 }}>Loading…</div>}
        {rows && shown.length === 0 && <div style={{ color: text3, fontSize: 14, padding: '2rem 0' }}>{rows.length === 0 ? 'No articles yet. Create the first one.' : 'No articles with this status.'}</div>}
        {shown.map(a => (
          <div key={a.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 4, padding: '1rem', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: colour(a.status), textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.status}</div>
                <Link href={`/admin/research/${a.id}`} style={{ fontSize: 17, fontWeight: 700, color: text, textDecoration: 'none', lineHeight: 1.35 }}>{a.title}</Link>
                <div style={{ fontSize: 12.5, color: text3, marginTop: 4 }}>
                  {a.category} · /{a.slug}{a.location_slug ? ` · ${resolveLocation(a.location_slug)?.label ?? a.location_slug}` : ''} · updated {new Date(a.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <Link href={`/admin/research/${a.id}`} style={btn}>Edit</Link>
                {a.status !== 'published' && <button style={btn} onClick={() => setStatus(a.id, 'published')}>Publish</button>}
                {a.status === 'published' && <button style={{ ...btn, color: '#F59E0B', borderColor: '#F59E0B' }} onClick={() => setStatus(a.id, 'unpublished')}>Unpublish</button>}
                {a.status === 'published' && <a style={btn} href={`/markets/research/${a.slug}`} target="_blank" rel="noreferrer">View</a>}
                {a.status !== 'published' && <button style={{ ...btn, color: '#EF4444', borderColor: '#EF4444' }} onClick={() => remove(a.id)}>Delete</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}