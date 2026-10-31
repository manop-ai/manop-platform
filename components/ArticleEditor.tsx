'use client'

// components/ArticleEditor.tsx
//
// MANOP Research editor. Writes Markdown through toolbar buttons (no HTML, no
// syntax to remember), with a live preview that uses the same renderer as the
// public page. Hero and inline images use the existing Cloudinary ImageUploader.
// All saves go through /api/admin/articles via authedFetch (the caller's session;
// RLS enforces admin) — never direct table calls from the browser.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImageUploader from './ImageUploader'
import { authedFetch } from '../lib/authed-fetch'
import { renderMarkdown } from '../lib/markdown'
import { ARTICLE_CATEGORIES, SOURCE_TYPES, SOURCE_TYPE_LABEL, readingMinutes, publishBlockers, type ArticleRow, type ArticleSource } from '../lib/research'
import { slugify, resolveLocation, searchLocations, getLocations } from '../lib/locations'

interface Form {
  title: string; slug: string; excerpt: string; body: string
  hero_image_url: string; hero_image_alt: string; hero_image_credit: string
  category: string; author_name: string; location_slug: string
  sources: ArticleSource[]; status: 'draft' | 'published' | 'unpublished'
}
const EMPTY: Form = {
  title: '', slug: '', excerpt: '', body: '', hero_image_url: '', hero_image_alt: '', hero_image_credit: '',
  category: 'MANOP Research', author_name: 'MANOP Research', location_slug: '', sources: [], status: 'draft',
}

export default function ArticleEditor({ articleId, dark }: { articleId: string; dark: boolean }) {
  const router = useRouter()
  const isNew = articleId === 'new'
  const text = dark ? '#F8FAFC' : '#0F172A', text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.14)'
  const bg3 = dark ? '#162032' : '#FFFFFF', accent = '#5B2EFF', teal = '#14B8A6'
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: 4, border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.05)' : '#fff', color: text, fontSize: 16, fontFamily: 'inherit' }
  const lab: React.CSSProperties = { fontSize: 11, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }
  const btn: React.CSSProperties = { minHeight: 40, padding: '0.5rem 1rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

  const [f, setF] = useState<Form>(EMPTY)
  const [id, setId] = useState<string | null>(isNew ? null : articleId)
  const [loaded, setLoaded] = useState(isNew)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [locQuery, setLocQuery] = useState('')
  const [imgKey, setImgKey] = useState(0)
  const [heroKey, setHeroKey] = useState(0)
  const ta = useRef<HTMLTextAreaElement>(null)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (isNew) return
    let live = true
    authedFetch(`/api/admin/articles/${articleId}`).then(async r => {
      const j = await r.json()
      if (!live) return
      if (!r.ok) { setMsg({ ok: false, text: j.error || 'Could not load article.' }); setLoaded(true); return }
      const a = j.article as ArticleRow
      setF({
        title: a.title, slug: a.slug, excerpt: a.excerpt ?? '', body: a.body, hero_image_url: a.hero_image_url ?? '',
        hero_image_alt: a.hero_image_alt ?? '', hero_image_credit: a.hero_image_credit ?? '', category: a.category,
        author_name: a.author_name, location_slug: a.location_slug ?? '', sources: a.sources ?? [], status: a.status,
      })
      setHeroKey(k => k + 1); setLoaded(true)
    })
    return () => { live = false }
  }, [articleId, isNew])

  const flash = (ok: boolean, t: string) => { setMsg({ ok, text: t }); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // ── Markdown toolbar: wraps/prefixes the current selection ────────────────
  const wrap = useCallback((before: string, after = before, placeholder = 'text') => {
    const el = ta.current; if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const sel = value.slice(s, e) || placeholder
    const next = value.slice(0, s) + before + sel + after + value.slice(e)
    set('body', next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length) })
  }, [])
  const prefix = useCallback((p: string, placeholder = 'text') => {
    const el = ta.current; if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const start = value.lastIndexOf('\n', s - 1) + 1
    const chunk = value.slice(start, e) || placeholder
    const out = chunk.split('\n').map((l, i) => (p === '1. ' ? `${i + 1}. ` : p) + l).join('\n')
    set('body', value.slice(0, start) + out + value.slice(e))
    requestAnimationFrame(() => el.focus())
  }, [])
  const insert = useCallback((snippet: string) => {
    const el = ta.current
    setF(p => {
      const pos = el ? el.selectionStart : p.body.length
      return { ...p, body: p.body.slice(0, pos) + (pos > 0 && p.body[pos - 1] !== '\n' ? '\n\n' : '') + snippet + '\n\n' + p.body.slice(pos) }
    })
  }, [])
  const addLink = () => {
    const url = window.prompt('Link address (https://…)'); if (!url) return
    wrap('[', `](${url})`, 'link text')
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const payload = (status: Form['status']) => ({
    title: f.title, slug: f.slug || slugify(f.title), excerpt: f.excerpt || null, body: f.body,
    hero_image_url: f.hero_image_url || null, hero_image_alt: f.hero_image_alt || null, hero_image_credit: f.hero_image_credit || null,
    category: f.category, author_name: f.author_name, location_slug: f.location_slug || null,
    sources: f.sources.filter(s => s.label.trim()), status,
  })

  async function save(status: Form['status'], doneText: string) {
    setBusy(true); setMsg(null)
    if (status === 'published') {
      const blockers = publishBlockers({ title: f.title, slug: f.slug || slugify(f.title), excerpt: f.excerpt, body: f.body })
      if (blockers.length) { setBusy(false); flash(false, `To publish, add ${blockers.join(', ')}.`); return }
    }
    const res = await authedFetch(id ? `/api/admin/articles/${id}` : '/api/admin/articles', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(status)),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { flash(false, j.error || 'Could not save.'); return }
    const a = j.article as ArticleRow
    set('status', a.status); set('slug', a.slug)
    if (!id) { setId(a.id); router.replace(`/admin/research/${a.id}`) }
    flash(true, doneText)
  }

  async function remove() {
    if (!id || !window.confirm('Delete this article permanently?')) return
    setBusy(true)
    const res = await authedFetch(`/api/admin/articles/${id}`, { method: 'DELETE' })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { flash(false, j.error || 'Could not delete.'); return }
    router.replace('/admin/research')
  }

  if (!loaded) return <div style={{ color: text3, fontSize: 14 }}>Loading article…</div>

  const preview = renderMarkdown(f.body || '*Nothing written yet.*', { textPrimary: text, textMuted: text2, textFaint: text3, border, accent, surface: bg3 })
  const locMatches = locQuery.length >= 2 ? searchLocations(locQuery, 6) : []
  const loc = f.location_slug ? resolveLocation(f.location_slug) : null
  const words = f.body.trim().split(/\s+/).filter(Boolean).length
  const tool: React.CSSProperties = { ...btn, minHeight: 36, padding: '0.35rem 0.7rem', fontSize: 12.5 }

  return (
    <div style={{ color: text, maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link href="/admin/research" style={{ color: text2, fontSize: 13, textDecoration: 'none' }}>← All articles</Link>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: f.status === 'published' ? '#22C55E' : f.status === 'unpublished' ? '#F59E0B' : text3 }}>
          {isNew && !id ? 'New article' : f.status}
        </span>
      </div>

      {msg && <div role="status" style={{ padding: '0.7rem 0.9rem', borderRadius: 4, marginBottom: 14, fontSize: 13.5, color: msg.ok ? '#22C55E' : '#EF4444', border: `1px solid ${msg.ok ? '#22C55E55' : '#EF444455'}` }}>{msg.text}</div>}

      <label style={lab}>Title</label>
      <input style={{ ...inp, fontSize: 20, fontWeight: 700, marginBottom: 14 }} value={f.title}
        onChange={e => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)) }} placeholder="Article headline" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, marginBottom: 14 }}>
        <div><label style={lab}>Slug (web address)</label>
          <input style={inp} value={f.slug} onChange={e => { setSlugTouched(true); set('slug', slugify(e.target.value)) }} placeholder="auto-from-title" />
          <div style={{ fontSize: 11.5, color: text3, marginTop: 4 }}>manopintel.com/markets/research/{f.slug || '…'}</div></div>
        <div><label style={lab}>Category</label>
          <input style={inp} list="article-cats" value={f.category} onChange={e => set('category', e.target.value)} />
          <datalist id="article-cats">{ARTICLE_CATEGORIES.map(c => <option key={c} value={c} />)}</datalist></div>
        <div><label style={lab}>Author</label><input style={inp} value={f.author_name} onChange={e => set('author_name', e.target.value)} /></div>
      </div>

      <label style={lab}>Excerpt (shown on cards and in search results)</label>
      <textarea style={{ ...inp, minHeight: 70, marginBottom: 4 }} value={f.excerpt} onChange={e => set('excerpt', e.target.value)} maxLength={320} />
      <div style={{ fontSize: 11.5, color: text3, marginBottom: 14 }}>{f.excerpt.length}/320</div>

      <label style={lab}>Hero image (Cloudinary)</label>
      <ImageUploader key={heroKey} dark={dark} maxImages={1} initialUrls={f.hero_image_url ? [f.hero_image_url] : []}
        label="" hint="A real photograph: development, site, planning or city context." onImagesChange={u => set('hero_image_url', u[0] ?? '')} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12, margin: '10px 0 14px' }}>
        <div><label style={lab}>Image description (alt text)</label><input style={inp} value={f.hero_image_alt} onChange={e => set('hero_image_alt', e.target.value)} /></div>
        <div><label style={lab}>Image credit / licence</label><input style={inp} value={f.hero_image_credit} onChange={e => set('hero_image_credit', e.target.value)} placeholder="Photographer / source / licence" /></div>
      </div>

      <label style={lab}>Related location (optional)</label>
      {loc ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, fontSize: 14 }}>
          <strong>{loc.path}</strong><button style={tool} onClick={() => set('location_slug', '')}>Remove</button>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <input style={inp} value={locQuery} onChange={e => setLocQuery(e.target.value)} placeholder={`Search ${getLocations().length} MANOP locations…`} />
          {locMatches.map(m => (
            <button key={m.location.slug} style={{ ...tool, display: 'block', width: '100%', textAlign: 'left', borderTop: 0 }}
              onClick={() => { set('location_slug', m.location.slug); setLocQuery('') }}>{m.location.path}{m.matchedMicro ? ` (via ${m.matchedMicro})` : ''}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <label style={{ ...lab, margin: 0 }}>Article</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...tool, background: tab === 'write' ? accent : 'transparent', color: tab === 'write' ? '#fff' : text, borderColor: tab === 'write' ? accent : border }} onClick={() => setTab('write')}>Write</button>
          <button style={{ ...tool, background: tab === 'preview' ? accent : 'transparent', color: tab === 'preview' ? '#fff' : text, borderColor: tab === 'preview' ? accent : border }} onClick={() => setTab('preview')}>Preview</button>
        </div>
      </div>

      {tab === 'write' ? (
        <>
          <div role="toolbar" aria-label="Formatting" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button style={tool} onClick={() => prefix('## ', 'Section heading')}>Heading</button>
            <button style={tool} onClick={() => prefix('### ', 'Sub-heading')}>Sub-heading</button>
            <button style={{ ...tool, fontWeight: 800 }} onClick={() => wrap('**')}>B</button>
            <button style={{ ...tool, fontStyle: 'italic' }} onClick={() => wrap('*')}>I</button>
            <button style={tool} onClick={() => prefix('- ', 'List item')}>• List</button>
            <button style={tool} onClick={() => prefix('1. ', 'List item')}>1. List</button>
            <button style={tool} onClick={() => prefix('> ', 'Quote')}>Quote</button>
            <button style={tool} onClick={addLink}>Link</button>
            <button style={tool} onClick={() => insert('---')}>Divider</button>
          </div>
          <textarea ref={ta} style={{ ...inp, minHeight: 420, lineHeight: 1.65, fontFamily: 'inherit' }} value={f.body}
            onChange={e => set('body', e.target.value)} placeholder="Write the article. Use the buttons above for headings, bold, lists and quotes." />
          <div style={{ fontSize: 12, color: text3, margin: '6px 0 12px' }}>{words} words · about {readingMinutes(f.body)} min read</div>
          <label style={lab}>Insert an image into the article</label>
          <ImageUploader key={imgKey} dark={dark} maxImages={1} label="" hint="Uploads to Cloudinary, then adds it at your cursor."
            onImagesChange={u => { if (u[0]) { insert(`![${f.title ? 'Image for ' + f.title : 'Image'}](${u[0]})`); setImgKey(k => k + 1) } }} />
        </>
      ) : (
        <div style={{ border: `1px solid ${border}`, borderRadius: 4, padding: 'clamp(1rem,3vw,1.75rem)', fontSize: 17, lineHeight: 1.8, color: text2, background: bg3 }}>
          {preview.nodes}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <label style={lab}>Sources / references (shown under the article)</label>
        {f.sources.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input style={inp} placeholder="Title / publisher" value={s.label} onChange={e => set('sources', f.sources.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <input style={inp} placeholder="https://…" value={s.url ?? ''} onChange={e => set('sources', f.sources.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
            <select style={inp} value={s.type ?? ''} onChange={e => set('sources', f.sources.map((x, j) => j === i ? { ...x, type: (e.target.value || undefined) as ArticleSource['type'] } : x))}>
              <option value="">Type</option>{SOURCE_TYPES.map(t => <option key={t} value={t}>{SOURCE_TYPE_LABEL[t]}</option>)}
            </select>
            <input style={inp} placeholder="Date" value={s.date ?? ''} onChange={e => set('sources', f.sources.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
            <button style={tool} onClick={() => set('sources', f.sources.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button style={tool} onClick={() => set('sources', [...f.sources, { label: '' }])}>+ Add source</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 28, paddingTop: 18, borderTop: `1px solid ${border}` }}>
        <button style={btn} disabled={busy} onClick={() => save(f.status === 'published' ? 'published' : f.status, 'Saved.')}>{f.status === 'published' ? 'Save changes' : 'Save draft'}</button>
        {f.status !== 'published' && <button style={{ ...btn, background: teal, borderColor: teal, color: '#0F172A' }} disabled={busy} onClick={() => save('published', 'Published. It now appears on Market Intelligence.')}>Publish</button>}
        {f.status === 'published' && <button style={{ ...btn, borderColor: '#F59E0B', color: '#F59E0B' }} disabled={busy} onClick={() => save('unpublished', 'Unpublished. It is no longer public.')}>Unpublish</button>}
        {f.status === 'published' && f.slug && <a style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={`/markets/research/${f.slug}`} target="_blank" rel="noreferrer">View live</a>}
        {id && f.status !== 'published' && <button style={{ ...btn, borderColor: '#EF4444', color: '#EF4444', marginLeft: 'auto' }} disabled={busy} onClick={remove}>Delete</button>}
      </div>
    </div>
  )
}