'use client'
// app/admin/upload/page.tsx — Zahazi Upload UI v3
// Sends file to MANOP backend for cleaning (not browser-side)
// Supports CSV + Excel (.xlsx)
// Handles multiple agencies in one file

import { useState, useRef } from 'react'

const MANOP_API = process.env.NEXT_PUBLIC_MANOP_API_URL || 'http://localhost:8003'

const NEIGHBORHOODS = [
  'Lekki Phase 1', 'Ikoyi', 'Victoria Island', 'Lekki',
  'Ikota', 'Chevron', 'Ajah', 'Sangotedo', 'Gbagada',
  'Yaba', 'Ikeja', 'Surulere', 'Magodo',
  'Maitama', 'Asokoro', 'Wuse 2',
  'East Legon', 'Cantonments', 'Labone',
  'Westlands', 'Karen', 'Kilimani',
]

interface CleanRecord {
  property_type: string | null
  bedrooms: number | null
  price_local: number
  currency_code: string
  neighborhood: string
  city: string
  listing_type: string
  _meta: {
    row: number
    location_confidence: string
    price_flagged: boolean
    flag_reason: string
    is_duplicate: boolean
    currency_display: string
  }
}

interface IngestResult {
  filename: string
  source_agency: string
  summary: { total: number; clean: number; flagged: number; skipped: number; duplicates: number }
  benchmarks: Record<number, { count: number; median: number; min: number; max: number }>
  clean: CleanRecord[]
  flagged: CleanRecord[]
  skipped: { row: number; reason: string }[]
}

function fmtN(n: number, c = 'NGN') {
  const sym = c === 'USD' ? '$' : c === 'GHS' ? 'GH₵' : '₦'
  if (n >= 1e9) return `${sym}${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `${sym}${(n/1e6).toFixed(0)}M`
  return `${sym}${(n/1000).toFixed(0)}K`
}

const D = {
  bg: '#0F172A', bg2: '#1E293B', bg3: '#162032', text: '#F8FAFC',
  text2: 'rgba(248,250,252,0.65)', text3: 'rgba(248,250,252,0.35)',
  border: 'rgba(248,250,252,0.07)', purple: '#5B2EFF', teal: '#14B8A6',
  green: '#22C55E', amber: '#F59E0B', red: '#EF4444',
}

export default function UploadPage() {
  const [step,        setStep]        = useState<'upload'|'results'|'done'>('upload')
  const [dragging,    setDragging]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [agency,      setAgency]      = useState('')
  const [neighborhood,setNeighborhood]= useState('')
  const [city,        setCity]        = useState('Lagos')
  const [result,      setResult]      = useState<IngestResult | null>(null)
  const [rejected,    setRejected]    = useState<Set<number>>(new Set())
  const [tab,         setTab]         = useState<'clean'|'flagged'|'skipped'>('clean')
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileNameRef = useRef('')

  const handleFile = async (file: File) => {
    fileNameRef.current = file.name
    setError('')

    const form = new FormData()
    form.append('file', file)
    form.append('source_agency', agency || 'Unknown Agency')
    if (neighborhood) form.append('default_neighborhood', neighborhood)
    if (city) form.append('default_city', city)

    setLoading(true)
    try {
      const res  = await fetch(`${MANOP_API}/ingest/upload`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setResult(data)
      setStep('results')
    } catch (e: any) {
      setError(e.message || 'Could not reach Manop API. Is it running on port 8003?')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    const toSave = result.clean.filter((_, i) => !rejected.has(i))
    try {
      const res  = await fetch(`${MANOP_API}/ingest/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: toSave, source_agency: agency || 'Unknown' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Save failed')
      setSaved(data.inserted)
      setStep('done')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const card = { background: D.bg3, border: `1px solid ${D.border}`, borderRadius: 16, padding: '1.25rem', marginBottom: '0.75rem' }
  const lbl  = { fontSize: '0.65rem', fontWeight: 700 as const, color: D.teal, textTransform: 'uppercase' as const, letterSpacing: '0.12em', display: 'block' as const, marginBottom: '0.4rem' }
  const inp  = { width: '100%', padding: '0.65rem 0.875rem', background: 'rgba(255,255,255,0.05)', border: `1px solid ${D.border}`, borderRadius: 8, color: D.text, fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit' }

  // ── UPLOAD STEP ──────────────────────────────────────────────────────────
  if (step === 'upload') return (
    <div style={{ background: D.bg, minHeight: '100vh', color: D.text, padding: '3rem 2rem' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>Manop Intelligence</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>Data Upload</h1>
          <p style={{ color: D.text2, lineHeight: 1.65, fontSize: '0.9rem' }}>
            Upload CSV or Excel (.xlsx). Manop cleans, validates, detects duplicates, and computes intelligence.
            Multiple agencies in one file — each row's agency is auto-detected.
          </p>
        </div>

        {/* Config */}
        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={lbl}>Primary Agency / Source</label>
              <input style={inp} value={agency} onChange={e => setAgency(e.target.value)} placeholder="e.g. Vala Homes, Property Pro..." />
              <div style={{ fontSize: '0.68rem', color: D.text3, marginTop: '0.3rem' }}>Used when file has multiple sources — each row keeps its own agency tag</div>
            </div>
            <div>
              <label style={lbl}>Default City</label>
              <input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Lagos" />
            </div>
          </div>
          <div>
            <label style={lbl}>Default Neighborhood (if not in file)</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}>
              <option value="">— Select if all rows are same neighborhood —</option>
              {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          style={{
            border: `2px dashed ${dragging ? D.purple : D.border}`,
            borderRadius: 16, padding: '3rem 2rem', textAlign: 'center',
            cursor: 'pointer', background: dragging ? 'rgba(91,46,255,0.08)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📂</div>
          <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
            {loading ? '⟳ Processing...' : 'Drop CSV or Excel file here'}
          </div>
          <div style={{ color: D.text3, fontSize: '0.82rem', marginBottom: '1.25rem' }}>
            Supports: .csv, .xlsx, .xls, .tsv
          </div>
          {!loading && (
            <div style={{ background: D.purple, color: '#fff', display: 'inline-block', padding: '0.5rem 1.5rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
              Choose File
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.875rem 1.25rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: D.red, fontSize: '0.85rem' }}>
            ✗ {error}
          </div>
        )}

        {/* Info panel */}
        <div style={{ ...card, marginTop: '1.5rem' }}>
          <span style={lbl}>What Manop Checks Automatically</span>
          {[
            ['Multi-agency detection', 'If your file has a "Platform Source" or "Agency" column, each row keeps its correct source — no manual splitting needed'],
            ['USD vs NGN detection', 'Properties priced in dollars ($ sign, "USD", or suspiciously low NGN amounts) are automatically detected and stored with correct currency'],
            ['Price plausibility', 'Prices outside the verified range for that neighborhood and bedroom count are flagged — not deleted, flagged for your review'],
            ['Duplicate detection', 'Same neighborhood + bedrooms + price (within 5%) across rows — caught and shown separately'],
            ['Location normalization', '"Lekki Ph 1", "LEKKI PHASE ONE", "Lekki ph1" → all become "Lekki Phase 1"'],
          ].map(([title, desc]) => (
            <div key={title} style={{ padding: '0.65rem 0', borderBottom: `1px solid ${D.border}`, fontSize: '0.82rem' }}>
              <span style={{ color: D.text, fontWeight: 600 }}>{title}: </span>
              <span style={{ color: D.text2 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── RESULTS STEP ─────────────────────────────────────────────────────────
  if (step === 'results' && result) {
    const display = tab === 'clean' ? result.clean : tab === 'flagged' ? result.flagged : result.skipped as any[]
    const approveCount = result.clean.length - rejected.size

    return (
      <div style={{ background: D.bg, minHeight: '100vh', color: D.text }}>
        {/* Header */}
        <div style={{ background: D.bg2, borderBottom: `1px solid ${D.border}`, padding: '1.25rem 2rem' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: D.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.2rem' }}>Cleaning Complete · {result.source_agency}</div>
              <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{result.filename}</div>
            </div>
            <button onClick={handleSave} disabled={saving || approveCount === 0} style={{ background: D.green, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 1.5rem', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? '⟳ Saving...' : `✓ Save ${approveCount} Records to Manop`}
            </button>
          </div>

          {/* Stats */}
          <div style={{ maxWidth: 1100, margin: '0.875rem auto 0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {[
              { l: 'Total Rows',   v: result.summary.total,       c: D.text },
              { l: 'Clean',        v: result.summary.clean,        c: D.green },
              { l: 'Flagged',      v: result.summary.flagged,      c: D.amber },
              { l: 'Duplicates',   v: result.summary.duplicates,   c: D.text3 },
              { l: 'Skipped',      v: result.summary.skipped,      c: D.red },
            ].map(s => (
              <div key={s.l} style={{ background: D.bg3, border: `1px solid ${D.border}`, borderRadius: 10, padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>{s.l}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.c, letterSpacing: '-0.03em' }}>{s.v}</div>
              </div>
            ))}
          </div>

          {/* Real benchmarks from this upload */}
          {Object.keys(result.benchmarks).length > 0 && (
            <div style={{ maxWidth: 1100, margin: '0.875rem auto 0', background: D.bg3, border: `1px solid ${D.border}`, borderRadius: 10, padding: '0.875rem 1rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
                Real Benchmarks Computed From This Upload (NGN equiv.)
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {Object.entries(result.benchmarks).map(([beds, b]) => (
                  <div key={beds} style={{ fontSize: '0.78rem' }}>
                    <span style={{ color: D.text3 }}>{beds}-Bed ({b.count}): </span>
                    <span style={{ color: D.text, fontWeight: 600 }}>{fmtN(b.median)} median</span>
                    <span style={{ color: D.text3 }}> · {fmtN(b.min)}–{fmtN(b.max)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: `1px solid ${D.border}`, padding: '0 2rem', background: D.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex' }}>
            {(['clean', 'flagged', 'skipped'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t ? D.purple : 'transparent'}`, color: tab === t ? D.text : D.text2, fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: t==='clean' ? D.green : t==='flagged' ? D.amber : D.red }}>{t==='clean'?'✓':t==='flagged'?'⚠':'✗'}</span>
                {t.charAt(0).toUpperCase()+t.slice(1)}
                <span style={{ background: t==='clean'?D.green:t==='flagged'?D.amber:D.red, color:'#fff', borderRadius:100, padding:'0.05rem 0.4rem', fontSize:'0.62rem', fontWeight:700 }}>
                  {t==='clean'?result.summary.clean:t==='flagged'?result.summary.flagged:result.summary.skipped}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Records */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem 2rem' }}>
          {display.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: D.text3, fontSize: '0.875rem' }}>No records in this category</div>
          ) : (
            display.map((r: any, i: number) => {
              const meta = r._meta || {}
              const isRej = rejected.has(i)
              return (
                <div key={i} style={{ background: isRej ? 'rgba(239,68,68,0.05)' : D.bg3, border: `1px solid ${isRej ? 'rgba(239,68,68,0.2)' : meta.price_flagged ? 'rgba(245,158,11,0.25)' : meta.is_duplicate ? 'rgba(148,163,184,0.2)' : D.border}`, borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '0.5rem', opacity: isRej ? 0.55 : 1, transition: 'all 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ fontWeight: 700, color: D.text }}>{r.bedrooms ? `${r.bedrooms}-Bed ` : ''}{r.property_type || 'Property'}</span>
                        <span style={{ fontWeight: 700, color: r.currency_code === 'USD' ? '#F59E0B' : D.teal }}>{meta.currency_display || fmtN(r.price_local, r.currency_code)}</span>
                        {r.currency_code === 'USD' && <span style={{ fontSize: '0.65rem', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: D.amber, borderRadius: 100, padding: '0.1rem 0.4rem', fontWeight: 700 }}>USD</span>}
                        {r.neighborhood && <span style={{ fontSize: '0.78rem', color: D.text2 }}>📍 {r.neighborhood}, {r.city}</span>}
                        <span style={{ fontSize: '0.65rem', background: meta.location_confidence === 'exact' ? 'rgba(34,197,94,0.12)' : meta.location_confidence === 'fuzzy' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)', color: meta.location_confidence === 'exact' ? D.green : meta.location_confidence === 'fuzzy' ? D.amber : D.red, border: `1px solid currentColor`, borderRadius: 100, padding: '0.1rem 0.45rem', fontWeight: 700 }}>
                          {meta.location_confidence}
                        </span>
                        {meta.is_duplicate && <span style={{ fontSize: '0.65rem', color: D.text3, border: `1px solid ${D.border}`, borderRadius: 100, padding: '0.1rem 0.45rem', fontWeight: 600 }}>DUPLICATE</span>}
                        {r.raw_data?.platform && <span style={{ fontSize: '0.65rem', color: D.text3 }}>· {r.raw_data.platform}</span>}
                      </div>
                      {meta.price_flagged && <div style={{ fontSize: '0.75rem', color: D.amber, background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '0.3rem 0.6rem', marginTop: '0.3rem' }}>⚠ {meta.flag_reason}</div>}
                      {r.reason && <div style={{ fontSize: '0.75rem', color: D.red, marginTop: '0.2rem' }}>✗ {r.reason}</div>}
                    </div>
                    {tab === 'clean' && (
                      <button onClick={() => setRejected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })} style={{ padding: '0.35rem 0.75rem', background: isRej ? 'rgba(239,68,68,0.15)' : 'transparent', border: `1px solid ${isRej ? D.red : D.border}`, color: isRej ? D.red : D.text3, borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
                        {isRej ? '↩ Restore' : '✕ Reject'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // ── DONE STEP ─────────────────────────────────────────────────────────────
  return (
    <div style={{ background: D.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: D.text }}>
      <div style={{ textAlign: 'center', maxWidth: 440, padding: '2rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: D.green, marginBottom: '0.75rem' }}>{saved} Records Saved</h1>
        <p style={{ color: D.text2, lineHeight: 1.65, marginBottom: '2rem' }}>
          Properties from <strong>{agency || 'this upload'}</strong> are now in Manop's database with source attribution. They appear on Zahazi immediately.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { setStep('upload'); setResult(null); setRejected(new Set()); setSaved(0) }} style={{ background: D.purple, color: '#fff', border: 'none', borderRadius: 10, padding: '0.75rem 1.5rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>Upload Another →</button>
          <a href="/neighborhood/lekki-phase-1" style={{ background: D.bg3, color: D.text, border: `1px solid ${D.border}`, borderRadius: 10, padding: '0.75rem 1.5rem', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', display: 'inline-block' }}>View Lekki Phase 1 →</a>
        </div>
      </div>
    </div>
  )
}
