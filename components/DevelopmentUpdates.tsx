'use client'

// components/DevelopmentUpdates.tsx
//
// THE canonical development-update UI. Used by the developer dashboard, the
// agency dashboard and admin so all three write the same rows:
//   development_updates (+ images)  and  development_update_changes (unit history)
// Images use the existing development_updates.media_urls column.
// Unit change history needs development_update_changes (see supabase/migrations draft).

import { useCallback, useEffect, useState } from 'react'
import { sb } from '../lib/supabase/client'
import { authedFetch } from '../lib/authed-fetch'
import ImageUploader from './ImageUploader'
import { logDevelopmentChange } from '../lib/log-development-change'

export interface UpdateUnit {
  id: string
  unit_type: string
  price_ngn: number | null
  available_count: number | null
}

interface Props {
  projectId: string
  projectName: string
  neighborhood?: string | null
  city?: string | null
  countryCode?: string | null
  role: 'admin' | 'developer' | 'agency'
  units: UpdateUnit[]
  dark: boolean
  /** Called after a save so the parent can reload unit data. */
  onSaved?: () => void
}

interface UpdateRow {
  id: string; title: string; body: string | null; stage_at_time: string | null
  completion_pct_at_time: number | null; posted_by_role: string
  verification_status: string | null; posted_at: string; media_urls: string[] | null
}
interface ChangeRow {
  id: string; update_id: string; unit_label: string; field: 'price_ngn' | 'available_count'
  previous_value: number | null; new_value: number | null
}

const STAGES = ['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed']
const ROLE_LABEL: Record<string, string> = { admin: 'MANOP', developer: 'Developer', agency: 'Agency' }
const fmt = (n: number | null, f: string) =>
  n == null ? '—' : f === 'price_ngn' ? `₦${n.toLocaleString()}` : String(n)

export default function DevelopmentUpdates(p: Props) {
  const { dark } = p
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', borderRadius: 8,
    border: `1px solid ${border}`, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    color: text, fontSize: 16, // 16px prevents iOS zoom on focus
    fontFamily: 'inherit',
  }

  const [rows, setRows] = useState<UpdateRow[]>([])
  const [changes, setChanges] = useState<Record<string, ChangeRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ title: '', body: '', stage: '', pct: '' })
  const [images, setImages] = useState<string[]>([])
  const [unitEdits, setUnitEdits] = useState<Record<string, { price: string; qty: string }>>({})
  const [saving, setSaving] = useState(false)
  const [confirmed, setConfirmed] = useState(false)   // admin only: has MANOP itself verified this update?
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploaderKey, setUploaderKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: ups } = await sb.from('development_updates')
      .select('id,title,body,stage_at_time,completion_pct_at_time,posted_by_role,verification_status,posted_at,media_urls')
      .eq('project_id', p.projectId)
      .order('posted_at', { ascending: false })
    const list = (ups as UpdateRow[]) || []
    setRows(list)
    if (list.length) {
      const { data: ch } = await sb.from('development_update_changes')
        .select('id,update_id,unit_label,field,previous_value,new_value')
        .eq('project_id', p.projectId)
      const grouped: Record<string, ChangeRow[]> = {}
      for (const c of (ch as ChangeRow[]) || []) (grouped[c.update_id] ||= []).push(c)
      setChanges(grouped)
    } else setChanges({})
    setLoading(false)
  }, [p.projectId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setUnitEdits({}) }, [p.projectId])

  async function save() {
    if (!form.title.trim()) { setMsg({ ok: false, text: 'Give the update a short title.' }); return }
    const pct = form.pct === '' ? null : parseInt(form.pct, 10)
    if (pct != null && (isNaN(pct) || pct < 0 || pct > 100)) { setMsg({ ok: false, text: '% complete must be 0–100.' }); return }

    // Only units whose value actually differs become change records.
    const pending: { unit: UpdateUnit; field: 'price_ngn' | 'available_count'; prev: number | null; next: number | null }[] = []
    for (const u of p.units) {
      const e = unitEdits[u.id]; if (!e) continue
      if (e.price !== '') {
        const next = parseFloat(e.price)
        if (isNaN(next) || next < 0) { setMsg({ ok: false, text: `Invalid price for ${u.unit_type}.` }); return }
        if (next !== u.price_ngn) pending.push({ unit: u, field: 'price_ngn', prev: u.price_ngn, next })
      }
      if (e.qty !== '') {
        const next = parseInt(e.qty, 10)
        if (isNaN(next) || next < 0) { setMsg({ ok: false, text: `Invalid availability for ${u.unit_type}.` }); return }
        if (next !== u.available_count) pending.push({ unit: u, field: 'available_count', prev: u.available_count, next })
      }
    }

    setSaving(true); setMsg(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); setMsg({ ok: false, text: 'Session expired — sign in again.' }); return }

    const { data: created, error } = await sb.from('development_updates').insert({
      project_id: p.projectId,
      title: form.title.trim(),
      body: form.body.trim() || null,
      stage_at_time: form.stage || null,
      completion_pct_at_time: pct,
      posted_by_role: p.role,
      posted_by_user_id: user.id,
      // admin posts are MANOP-confirmed (existing convention); others stay "reported"
      // MANOP-confirmed only when the admin says MANOP verified it. Passing on what a developer reported stays "reported".
      ...(p.role === 'admin' && confirmed ? { verification_status: 'manop_confirmed' } : {}),
      media_urls: images,
    }).select('id').single()

    if (error || !created) {
      setSaving(false)
      setMsg({ ok: false, text: `Could not save update: ${error?.message ?? 'no row returned'}` })
      return
    }

    const ctx = {
      projectId: p.projectId, projectName: p.projectName, neighborhood: p.neighborhood,
      city: p.city, countryCode: p.countryCode, actorUserId: user.id, actorRole: p.role,
    }
    let unitErr: string | null = null

    if (pending.length) {
      // One call per unit through the server route: it validates, checks ownership, records the history (before, after, who, when)
      // atomically with the change, refuses if the value moved since this page loaded, and tells MANOP about material changes.
      const byUnit = new Map<string, typeof pending>()
      for (const c of pending) byUnit.set(c.unit.id, [...(byUnit.get(c.unit.id) ?? []), c])
      for (const [unitId, list] of byUnit) {
        const changes: Record<string, number> = {}; const expected: Record<string, number | null> = {}
        for (const c of list) { changes[c.field] = c.next as number; expected[c.field] = c.prev }
        try {
          const res = await authedFetch('/api/developer/unit-terms', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unit_id: unitId, changes, expected, update_id: created.id }),
          })
          const j = await res.json().catch(() => ({}))
          if (!res.ok) { unitErr = `${list[0].unit.unit_type}: ${j.error || 'not saved'}`; break }
        } catch { unitErr = `${list[0].unit.unit_type}: network error`; break }
      }
    }

    void logDevelopmentChange(sb, 'development_update_added', ctx, { update_id: created.id, stage: form.stage || null })
    if (form.stage) void logDevelopmentChange(sb, 'development_status_changed', ctx, { update_id: created.id, stage: form.stage })
    if (images.length) void logDevelopmentChange(sb, 'development_image_added', ctx, { update_id: created.id, count: images.length })

    setForm({ title: '', body: '', stage: '', pct: '' })
    setImages([]); setUnitEdits({}); setConfirmed(false); setUploaderKey(k => k + 1)
    setSaving(false)
    setMsg(unitErr
      ? { ok: false, text: `Update saved, but unit changes were not fully applied (${unitErr}).` }
      : { ok: true, text: 'Update saved to the development timeline.' })
    await load()
    p.onSaved?.()
  }

  return (
    <div style={{ color: text }}>
      <div style={{ border: `1px solid ${border}`, borderRadius: 12, padding: 'clamp(0.85rem, 3vw, 1.25rem)', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Add an update
        </div>
        <input style={{ ...inp, marginBottom: 8 }} placeholder="e.g. Foundation works complete" value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })} />
        <textarea style={{ ...inp, minHeight: 70, marginBottom: 8 }} placeholder="Details (optional)" value={form.body}
          onChange={e => setForm({ ...form, body: e.target.value })} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
          <select style={inp} value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
            <option value="">Stage (optional)</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input style={inp} type="number" inputMode="numeric" min={0} max={100} placeholder="% complete (optional)"
            value={form.pct} onChange={e => setForm({ ...form, pct: e.target.value })} />
        </div>

        {p.units.length > 0 && p.role !== 'agency' && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: text2, marginBottom: 6 }}>
              Unit changes (optional) — leave blank for no change. Every change is recorded permanently and MANOP is notified of significant ones.
            </div>
            {p.units.map(u => (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {u.unit_type}
                  <div style={{ fontSize: 11, color: text3, fontWeight: 400 }}>
                    now {fmt(u.price_ngn, 'price_ngn')} · {u.available_count ?? '—'} available
                  </div>
                </div>
                <input style={inp} type="number" inputMode="decimal" min={0} placeholder="New price (₦)"
                  value={unitEdits[u.id]?.price ?? ''}
                  onChange={e => setUnitEdits({ ...unitEdits, [u.id]: { price: e.target.value, qty: unitEdits[u.id]?.qty ?? '' } })} />
                <input style={inp} type="number" inputMode="numeric" min={0} placeholder="Units now available"
                  value={unitEdits[u.id]?.qty ?? ''}
                  onChange={e => setUnitEdits({ ...unitEdits, [u.id]: { price: unitEdits[u.id]?.price ?? '', qty: e.target.value } })} />
              </div>
            ))}
          </div>
        )}

        {p.role === 'admin' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: text2, margin: '10px 0 0' }}>
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
            <span>MANOP has verified this update itself (site visit, photos or documents reviewed). Leave unticked if you are passing on what the developer told you; buyers will then see it as relayed, not verified.</span>
          </label>
        )}
        <ImageUploader key={uploaderKey} dark={dark} label="Photos (optional)" maxImages={6}
          hint="Site progress, completed sections, amenities" onImagesChange={setImages} />

        <button onClick={save} disabled={saving}
          style={{ marginTop: 12, width: '100%', minHeight: 44, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
          {saving ? 'Saving…' : 'Post update'}
        </button>
        {msg && <div role="status" style={{ marginTop: 8, fontSize: 12.5, color: msg.ok ? '#22C55E' : '#EF4444' }}>{msg.text}</div>}
        <div style={{ fontSize: 11, color: text3, marginTop: 6 }}>
          {p.role === 'admin'
            ? 'Posted as MANOP-confirmed.'
            : 'Shown to buyers as reported by you; MANOP may separately confirm it.'}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Development updates
      </div>
      {loading && <div style={{ fontSize: 13, color: text3 }}>Loading…</div>}
      {!loading && rows.length === 0 && <div style={{ fontSize: 13, color: text3 }}>No updates yet.</div>}
      {rows.map(u => (
        <div key={u.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${u.verification_status === 'manop_confirmed' ? '#0D9488' : '#5B2EFF'}`, marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: text3 }}>
            {new Date(u.posted_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            {' · '}{ROLE_LABEL[u.posted_by_role] || u.posted_by_role}
            {u.verification_status === 'manop_confirmed' ? ' · MANOP-confirmed' : ''}
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{u.title}</div>
          {u.body && <div style={{ fontSize: 13, color: text2, lineHeight: 1.55, marginTop: 3, whiteSpace: 'pre-wrap' }}>{u.body}</div>}
          {(u.stage_at_time || u.completion_pct_at_time != null) && (
            <div style={{ fontSize: 12, color: text3, marginTop: 3 }}>
              {u.stage_at_time}{u.stage_at_time && u.completion_pct_at_time != null ? ' · ' : ''}
              {u.completion_pct_at_time != null ? `${u.completion_pct_at_time}% complete` : ''}
            </div>
          )}
          {(changes[u.id] || []).map(c => (
            <div key={c.id} style={{ fontSize: 13, marginTop: 4 }}>
              <strong>{c.unit_label}</strong>{' '}
              <span style={{ color: text3 }}>{c.field === 'price_ngn' ? 'price' : 'units available'}</span>{' '}
              {fmt(c.previous_value, c.field)} → {fmt(c.new_value, c.field)}
            </div>
          ))}
          {!!u.media_urls?.length && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {u.media_urls.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`${u.title} photo ${i + 1}`} loading="lazy"
                    style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 8, border: `1px solid ${border}` }} />
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}