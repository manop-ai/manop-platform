'use client'
// app/admin/comparables/page.tsx — standalone comparables tracker
//
// Comparables are sourced continuously during due diligence and market
// research — often before any specific development exists to attach them
// to. This page lets admin log a comparable the moment it's found, and
// browse/search what's already recorded per neighborhood. The
// development_comparables table was always independent of any one
// project (matched at read-time by neighborhood + city + unit class) —
// this page just gives that table its own front door instead of hiding
// it inside the development-creation flow.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const COUNTRIES = [
  { code: 'NG', label: 'Nigeria', currency: 'NGN' },
  { code: 'GH', label: 'Ghana',   currency: 'GHS' },
]

const SOURCE_LABELS: Record<string, string> = {
  manop_direct_listing: 'MANOP direct listing',
  agency_listing: 'Agency listing on MANOP',
  market_research: 'Market research',
  developer_disclosed: 'Developer disclosed',
}

interface Comparable {
  id: string
  neighborhood: string
  city: string
  country_code: string
  unit_size_class: string
  comparable_name: string
  developer_name: string | null
  price_local: number
  currency_code: string
  size_sqm: number | null
  construction_stage: string | null
  source_type: string
  recorded_at: string
  notes: string | null
}

export default function AdminComparablesPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)

  const [comparables, setComparables] = useState<Comparable[]>([])
  const [loading, setLoading] = useState(true)
  const [filterNeighborhood, setFilterNeighborhood] = useState('')
  const [filterCity, setFilterCity] = useState('')

  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500) }

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const loadComparables = useCallback(async () => {
    setLoading(true)
    let q = sb
      .from('development_comparables')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(200)

    if (filterNeighborhood.trim()) q = q.ilike('neighborhood', `%${filterNeighborhood.trim()}%`)
    if (filterCity.trim()) q = q.ilike('city', `%${filterCity.trim()}%`)

    const { data } = await q
    setComparables((data as Comparable[]) || [])
    setLoading(false)
  }, [filterNeighborhood, filterCity])

  useEffect(() => { if (user) loadComparables() }, [user, loadComparables])

  // ── Add comparable form ─────────────────────────────────────
  const emptyForm = {
    neighborhood: '', city: '', country_code: 'NG', unit_size_class: '',
    comparable_name: '', developer_name: '', price_local: '', currency_code: 'NGN',
    size_sqm: '', construction_stage: '', source_type: 'market_research', notes: '',
  }
  const [form, setForm] = useState(emptyForm)

  async function addComparable() {
    if (!form.neighborhood.trim() || !form.city.trim() || !form.unit_size_class.trim()
        || !form.comparable_name.trim() || !form.price_local) {
      flash('Neighborhood, city, unit class, name, and price are required', false)
      return
    }
    const { error } = await sb.from('development_comparables').insert({
      neighborhood:        form.neighborhood.trim(),
      city:                form.city.trim(),
      country_code:        form.country_code,
      unit_size_class:     form.unit_size_class.trim(),
      comparable_name:     form.comparable_name.trim(),
      developer_name:      form.developer_name.trim() || null,
      price_local:         parseFloat(form.price_local),
      currency_code:       form.currency_code,
      size_sqm:            form.size_sqm ? parseFloat(form.size_sqm) : null,
      construction_stage:  form.construction_stage.trim() || null,
      source_type:         form.source_type,
      notes:               form.notes.trim() || null,
    })
    if (error) { flash(`Error: ${error.message}`, false); return }
    flash('✓ Comparable recorded', true)
    setForm(emptyForm)
    await loadComparables()
  }

  // ── Theme (matches the developments admin page) ─────────────
  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const accent = '#5B2EFF'
  const teal   = '#14B8A6'

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8,
    border: `1px solid ${border}`, background: bg2, color: text,
    fontSize: 13, fontFamily: 'inherit', marginBottom: 8,
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: text3, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const sectionStyle: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 16 }
  const btnPrimary: React.CSSProperties = { background: accent, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: accent, borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>Admin · Comparables</div>
            <div style={{ fontSize: 11, color: text3 }}>Log a price the moment you find it — no development required</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/admin/developments" style={{ fontSize: 12, color: text2, textDecoration: 'none' }}>← Developments</Link>
          <div style={{ fontSize: 12, color: text3 }}>{user?.email}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {msg && (
          <div style={{ background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: 13, color: msg.ok ? '#22C55E' : '#EF4444', marginBottom: 14 }}>
            {msg.text}
          </div>
        )}

        {/* ── Add form ───────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Record a comparable
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Neighborhood</label>
              <input style={inputStyle} value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} placeholder="e.g. Ikate, Lekki" />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input style={inputStyle} value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="e.g. Lagos" />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select style={inputStyle} value={form.country_code} onChange={e => setForm({ ...form, country_code: e.target.value })}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unit size class</label>
              <input style={inputStyle} value={form.unit_size_class} onChange={e => setForm({ ...form, unit_size_class: e.target.value })} placeholder="e.g. 2-bed apartment" />
            </div>
            <div>
              <label style={labelStyle}>Comparable name</label>
              <input style={inputStyle} value={form.comparable_name} onChange={e => setForm({ ...form, comparable_name: e.target.value })} placeholder="Development or listing name" />
            </div>
            <div>
              <label style={labelStyle}>Developer (if known)</label>
              <input style={inputStyle} value={form.developer_name} onChange={e => setForm({ ...form, developer_name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Price (local currency)</label>
              <input type="number" style={inputStyle} value={form.price_local} onChange={e => setForm({ ...form, price_local: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Size (sqm, optional)</label>
              <input type="number" style={inputStyle} value={form.size_sqm} onChange={e => setForm({ ...form, size_sqm: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Construction stage (optional)</label>
              <input style={inputStyle} value={form.construction_stage} onChange={e => setForm({ ...form, construction_stage: e.target.value })} placeholder="e.g. Structure" />
            </div>
            <div>
              <label style={labelStyle}>Source</label>
              <select style={inputStyle} value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })}>
                <option value="market_research">Market research</option>
                <option value="manop_direct_listing">MANOP direct listing</option>
                <option value="agency_listing">Agency listing on MANOP</option>
                <option value="developer_disclosed">Developer disclosed</option>
              </select>
            </div>
          </div>
          <label style={labelStyle}>Notes (who told you, when, anything relevant)</label>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />

          <button style={btnPrimary} onClick={addComparable}>Add comparable</button>
        </div>

        {/* ── Browse / filter ────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Recorded comparables
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Filter by neighborhood" value={filterNeighborhood} onChange={e => setFilterNeighborhood(e.target.value)} />
            <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder="Filter by city" value={filterCity} onChange={e => setFilterCity(e.target.value)} />
          </div>

          {loading && <div style={{ fontSize: 13, color: text3 }}>Loading…</div>}
          {!loading && comparables.length === 0 && (
            <div style={{ fontSize: 13, color: text3 }}>No comparables recorded yet for this filter.</div>
          )}

          {!loading && comparables.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: `1px solid ${border}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.comparable_name}{c.developer_name ? ` — ${c.developer_name}` : ''}</div>
                <div style={{ fontSize: 12, color: text2, marginTop: 2 }}>{c.unit_size_class} · {c.neighborhood}, {c.city} {c.size_sqm ? `· ${c.size_sqm}sqm` : ''}</div>
                <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>
                  {SOURCE_LABELS[c.source_type] || c.source_type} · recorded {new Date(c.recorded_at).toLocaleDateString()}
                  {c.construction_stage ? ` · ${c.construction_stage}` : ''}
                </div>
                {c.notes && <div style={{ fontSize: 11, color: text3, marginTop: 4, fontStyle: 'italic' }}>{c.notes}</div>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' as const, marginLeft: 12 }}>
                {c.currency_code} {Number(c.price_local).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}