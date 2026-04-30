'use client'
// app/developer/dashboard/page.tsx — Manop Developer Dashboard
// For property developers: project management, unit tracker, 
// sales pipeline, payment plan tracking

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────
type Tab = 'overview' | 'projects' | 'units' | 'pipeline' | 'plans' | 'addproject'

interface Project {
  id:           string
  name:         string
  location:     string
  city:         string
  total_units:  number
  sold_units:   number
  reserved_units: number
  handover_date: string
  completion_pct: number
  stage:        string
  images:       string[]
  unit_types:   UnitType[]
  created_at:   string
}

interface UnitType {
  type:      string
  price_ngn: number
  quantity:  number
  sold:      number
  reserved:  number
}

interface Lead {
  id:         string
  name:       string
  phone:      string
  email:      string
  project_id: string
  unit_type:  string
  stage:      'new' | 'contacted' | 'site_visit' | 'reserved' | 'sold'
  note:       string
  created_at: string
}

interface PaymentPlan {
  id:          string
  buyer_name:  string
  unit_ref:    string
  project:     string
  total_ngn:   number
  paid_ngn:    number
  duration_months: number
  next_due:    string
  status:      'on_track' | 'overdue' | 'completed'
}

// ─── Helpers ──────────────────────────────────────────────────
function fmtNGN(n: number) {
  if (n >= 1e9) return `₦${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `₦${Math.round(n/1e3)}K`
  return `₦${Math.round(n)}`
}
function parseMillion(v: string): number {
  const n = parseFloat(v); return isNaN(n) ? 0 : n * 1_000_000
}
function pct(a: number, b: number) { return b > 0 ? Math.round((a/b)*100) : 0 }

// ─── Sample data (replace with Supabase queries in production) ─
const SAMPLE_PROJECTS: Project[] = [
  { id:'p1', name:'The Lekki Waterfront', location:'Lekki Phase 1', city:'Lagos', total_units:80, sold_units:62, reserved_units:11, handover_date:'2025-06-30', completion_pct:78, stage:'Finishing', images:[], unit_types:[
    { type:'Studio', price_ngn:45e6, quantity:10, sold:10, reserved:0 },
    { type:'1-bedroom', price_ngn:75e6, quantity:20, sold:18, reserved:2 },
    { type:'2-bedroom', price_ngn:120e6, quantity:25, sold:22, reserved:3 },
    { type:'3-bedroom', price_ngn:185e6, quantity:15, sold:10, reserved:4 },
    { type:'4-bedroom', price_ngn:285e6, quantity:8, sold:2, reserved:2 },
    { type:'Penthouse', price_ngn:450e6, quantity:2, sold:0, reserved:0 },
  ], created_at:'2024-01-01' },
  { id:'p2', name:'Abuja Prime Residences', location:'Maitama', city:'Abuja', total_units:120, sold_units:88, reserved_units:24, handover_date:'2025-12-31', completion_pct:55, stage:'Structure', images:[], unit_types:[
    { type:'2-bedroom', price_ngn:85e6, quantity:60, sold:45, reserved:12 },
    { type:'3-bedroom', price_ngn:130e6, quantity:40, sold:32, reserved:8 },
    { type:'4-bedroom', price_ngn:200e6, quantity:20, sold:11, reserved:4 },
  ], created_at:'2024-03-01' },
  { id:'p3', name:'Chevron Court', location:'Chevron', city:'Lagos', total_units:60, sold_units:18, reserved_units:8, handover_date:'2026-09-30', completion_pct:22, stage:'Foundation', images:[], unit_types:[
    { type:'2-bedroom', price_ngn:95e6, quantity:30, sold:10, reserved:5 },
    { type:'3-bedroom', price_ngn:150e6, quantity:20, sold:6, reserved:2 },
    { type:'4-bedroom', price_ngn:250e6, quantity:10, sold:2, reserved:1 },
  ], created_at:'2024-06-01' },
]

const SAMPLE_LEADS: Lead[] = [
  { id:'l1', name:'Adaeze Okafor', phone:'+234 803 000 1234', email:'adaeze@gmail.com', project_id:'p1', unit_type:'2-bedroom', stage:'new', note:'Interested from Lagos. Diaspora buyer.', created_at:'2024-11-20T10:00:00Z' },
  { id:'l2', name:'Kwame Asante',  phone:'+233 24 000 5678',  email:'kwame@yahoo.com',  project_id:'p1', unit_type:'3-bedroom', stage:'contacted', note:'Site visit scheduled for Dec 5.', created_at:'2024-11-18T14:00:00Z' },
  { id:'l3', name:'Tunde Adeyemi', phone:'+234 812 000 9012', email:'tunde@corp.com',   project_id:'p2', unit_type:'4-bedroom', stage:'site_visit', note:'Corporate buyer — needs installment plan.', created_at:'2024-11-15T09:00:00Z' },
  { id:'l4', name:'Fatou Diallo',  phone:'+221 77 000 3456',  email:'fatou@mail.com',   project_id:'p1', unit_type:'Penthouse', stage:'reserved', note:'30% deposit received.', created_at:'2024-11-10T11:00:00Z' },
  { id:'l5', name:'Ibrahim Musa',  phone:'+234 806 000 7890', email:'ibrahim@biz.com',  project_id:'p2', unit_type:'2-bedroom', stage:'sold', note:'Full payment received. Keys handed.', created_at:'2024-10-01T00:00:00Z' },
]

const SAMPLE_PLANS: PaymentPlan[] = [
  { id:'pp1', buyer_name:'Emeka Okonkwo', unit_ref:'LW-B204', project:'The Lekki Waterfront', total_ngn:120e6, paid_ngn:72e6, duration_months:24, next_due:'2025-01-15', status:'on_track' },
  { id:'pp2', buyer_name:'Aisha Mohammed', unit_ref:'AP-A112', project:'Abuja Prime Residences', total_ngn:85e6, paid_ngn:34e6, duration_months:18, next_due:'2024-12-10', status:'on_track' },
  { id:'pp3', buyer_name:'Chidi Obi', unit_ref:'LW-C301', project:'The Lekki Waterfront', total_ngn:185e6, paid_ngn:55.5e6, duration_months:36, next_due:'2024-11-30', status:'overdue' },
  { id:'pp4', buyer_name:'Grace Nwosu', unit_ref:'AP-B220', project:'Abuja Prime Residences', total_ngn:130e6, paid_ngn:130e6, duration_months:12, next_due:'—', status:'completed' },
]

const STAGE_ORDER: Lead['stage'][] = ['new','contacted','site_visit','reserved','sold']
const STAGE_LABELS: Record<string, string> = { new:'New',contacted:'Contacted',site_visit:'Site visit',reserved:'Reserved',sold:'Sold' }
const STAGE_COLORS: Record<string, string> = { new:'#5B2EFF',contacted:'#F59E0B',site_visit:'#14B8A6',reserved:'#22C55E',sold:'#7C5FFF' }

// ─── Add Project Form ─────────────────────────────────────────
function AddProjectForm({ dark, onSaved }: { dark: boolean; onSaved: () => void }) {
  const [name,       setName]       = useState('')
  const [location,   setLocation]   = useState('')
  const [totalUnits, setTotalUnits] = useState('')
  const [handover,   setHandover]   = useState('')
  const [completion, setCompletion] = useState('0')
  const [stage,      setStage]      = useState('Foundation')
  const [unitTypes,  setUnitTypes]  = useState([{ type:'2-bedroom', priceM:'', qty:'', installment:'24' }])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<{ file: File; preview: string }[]>([])

  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const INP: React.CSSProperties = { width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.875rem', padding: '0.6rem 0.875rem', outline: 'none', fontFamily: 'inherit' }
  const LBL: React.CSSProperties = { fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

  function addUnitType() { setUnitTypes(prev => [...prev, { type:'Studio', priceM:'', qty:'', installment:'24' }]) }
  function removeUnitType(i: number) { setUnitTypes(prev => prev.filter((_,idx) => idx !== i)) }
  function updateUnit(i: number, field: string, val: string) { setUnitTypes(prev => prev.map((u,idx) => idx === i ? { ...u, [field]: val } : u)) }

  function addImages(files: FileList | null) {
    if (!files) return
    const newImgs = Array.from(files).slice(0, 8 - images.length).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setImages(prev => [...prev, ...newImgs].slice(0, 8))
  }

  async function handleSave() {
    if (!name.trim())     { setError('Project name is required'); return }
    if (!location.trim()) { setError('Location is required'); return }
    if (!totalUnits)      { setError('Enter total unit count'); return }
    setSaving(true); setError('')
    // In production: save to a projects table in Supabase
    // For now: simulate success
    await new Promise(r => setTimeout(r, 1200))
    setSaving(false); setSuccess(true)
    setTimeout(onSaved, 1500)
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '2rem', color: '#22C55E' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✓</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Project created!</div>
      <div style={{ fontSize: 13, color: text2, marginTop: 6 }}>Your project is now live on Manop.</div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Project details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LBL}>Project name *</label>
          <input style={INP} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Lekki Waterfront" />
        </div>
        <div>
          <label style={LBL}>Location / Neighborhood *</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={location} onChange={e => setLocation(e.target.value)}>
            <option value="">Select location</option>
            {['Lekki Phase 1, Lagos','Ikoyi, Lagos','Victoria Island, Lagos','Ajah, Lagos','Maitama, Abuja','Asokoro, Abuja','East Legon, Accra','Westlands, Nairobi','Other'].map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Total units *</label>
          <input style={INP} type="number" value={totalUnits} onChange={e => setTotalUnits(e.target.value)} placeholder="e.g. 80" min="1" />
        </div>
        <div>
          <label style={LBL}>Expected handover</label>
          <input style={INP} type="month" value={handover} onChange={e => setHandover(e.target.value)} />
        </div>
        <div>
          <label style={LBL}>Project stage</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={stage} onChange={e => setStage(e.target.value)}>
            {['Foundation','Structure','Roofing','Finishing','Completed'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Completion % (physical)</label>
          <input style={INP} type="number" value={completion} onChange={e => setCompletion(e.target.value)} min="0" max="100" placeholder="e.g. 45" />
          <div style={{ fontSize: '0.62rem', color: text3, marginTop: 3 }}>Physical construction progress</div>
        </div>
      </div>

      {/* Unit types */}
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Unit types & pricing</div>
      {unitTypes.map((u, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <div>
            {i === 0 && <label style={LBL}>Unit type</label>}
            <select style={{ ...INP, cursor: 'pointer' }} value={u.type} onChange={e => updateUnit(i,'type',e.target.value)}>
              {['Studio','1-bedroom','2-bedroom','3-bedroom','4-bedroom','5-bedroom','Penthouse','Commercial'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            {i === 0 && <label style={LBL}>Price (₦M)</label>}
            <input style={INP} type="number" value={u.priceM} onChange={e => updateUnit(i,'priceM',e.target.value)} placeholder="e.g. 120" min="0.1" step="0.5" />
          </div>
          <div>
            {i === 0 && <label style={LBL}>Quantity</label>}
            <input style={INP} type="number" value={u.qty} onChange={e => updateUnit(i,'qty',e.target.value)} placeholder="e.g. 20" min="1" />
          </div>
          <div>
            {i === 0 && <label style={LBL}>Payment plan</label>}
            <select style={{ ...INP, cursor: 'pointer' }} value={u.installment} onChange={e => updateUnit(i,'installment',e.target.value)}>
              {['Cash only','6','12','18','24','36','48','Custom'].map(m => <option key={m} value={m}>{m === 'Cash only' ? 'Cash only' : `${m} months`}</option>)}
            </select>
          </div>
          <button onClick={() => removeUnitType(i)} disabled={unitTypes.length === 1} style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, color: '#EF4444', cursor: 'pointer', padding: '0.6rem 0.75rem', fontSize: 13, alignSelf: 'flex-end' }}>×</button>
        </div>
      ))}
      <button onClick={addUnitType} style={{ fontSize: 12, color: '#14B8A6', background: 'transparent', border: `1px solid rgba(20,184,166,0.3)`, borderRadius: 7, padding: '0.4rem 0.875rem', cursor: 'pointer', marginBottom: 16 }}>
        + Add unit type
      </button>

      {/* Media upload */}
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Project media (renders, floor plans, site photos)</div>
      <div onClick={() => fileRef.current?.click()} onDrop={e => { e.preventDefault(); addImages(e.dataTransfer.files) }} onDragOver={e => e.preventDefault()}
        style={{ border: `2px dashed ${border}`, borderRadius: 10, padding: '1.25rem', textAlign: 'center', cursor: 'pointer', marginBottom: 10, background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🏗️</div>
        <div style={{ fontSize: 13, color: text2, marginBottom: 3 }}>Upload renders, floor plans, site photos</div>
        <div style={{ fontSize: 11, color: text3 }}>JPG, PNG, PDF — up to 10MB each</div>
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={e => addImages(e.target.files)} />
      </div>
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 14 }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 70, height: 56 }}>
              <img src={img.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 7, border: `1px solid ${border}` }} />
              <button onClick={() => setImages(prev => prev.filter((_,idx) => idx !== i))} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, background: '#EF4444', border: 'none', borderRadius: '50%', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}
      <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Creating project…' : 'Create project →'}
      </button>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function DeveloperDashboard() {
  const [dark, setDark]   = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [loginVal, setLoginVal] = useState('')
  const [tab, setTab]     = useState<Tab>('overview')
  const [activeProject, setActiveProject] = useState<Project>(SAMPLE_PROJECTS[0])
  const [leads, setLeads] = useState<Lead[]>(SAMPLE_LEADS)

  useEffect(() => { setDark(getInitialDark()); return listenTheme(d => setDark(d)) }, [])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.875rem', outline: 'none', padding: '0.65rem 0.875rem', fontFamily: 'inherit', width: '100%' }

  // Portfolio stats
  const totalUnits   = SAMPLE_PROJECTS.reduce((s, p) => s + p.total_units, 0)
  const totalSold    = SAMPLE_PROJECTS.reduce((s, p) => s + p.sold_units, 0)
  const totalReserved = SAMPLE_PROJECTS.reduce((s, p) => s + p.reserved_units, 0)
  const totalAvail   = totalUnits - totalSold - totalReserved
  const totalRevenue = SAMPLE_PROJECTS.reduce((s, p) =>
    s + p.unit_types.reduce((sum, u) => sum + u.sold * u.price_ngn, 0), 0)

  function moveLead(id: string, newStage: Lead['stage']) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage: newStage } : l))
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',    label: 'Overview'        },
    { key: 'projects',    label: `Projects (${SAMPLE_PROJECTS.length})` },
    { key: 'units',       label: 'Unit tracker'    },
    { key: 'pipeline',   label: 'Sales pipeline'  },
    { key: 'plans',       label: 'Payment plans'   },
    { key: 'addproject',  label: '+ New project'   },
  ]

  // ── Login screen ─────────────────────────────────────────────
  if (!loggedIn) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text, padding: '1rem', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          <div style={{ fontWeight: 700, color: text }}>Manop · Developer</div>
        </Link>
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: text }}>Developer dashboard</h1>
          <p style={{ fontSize: 13, color: text2, marginBottom: '1.5rem', lineHeight: 1.55 }}>
            Manage your projects, track unit sales, monitor payment plans, and run your sales pipeline from one place.
          </p>
          <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 5, fontWeight: 500 }}>Company name or email</label>
          <input style={{ ...INP, marginBottom: 10 }} placeholder="e.g. Mixta Africa or info@mixta.com" value={loginVal}
            onChange={e => setLoginVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && loginVal && setLoggedIn(true)} autoFocus />
          <button onClick={() => loginVal && setLoggedIn(true)} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Access dashboard →
          </button>
          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 13, color: text2 }}>
            Not registered?{' '}
            <a href="mailto:partners@manopintel.com" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Email us to onboard →</a>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: 8, fontSize: 11, color: text3 }}>
            Demo: type any name and press Enter
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s' }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{loginVal || 'Developer'}</div>
            <div style={{ fontSize: 11, color: text3 }}>Developer account · {SAMPLE_PROJECTS.length} active projects</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#5B2EFF', background: 'rgba(91,46,255,0.1)', border: '1px solid rgba(91,46,255,0.25)', borderRadius: 20, padding: '2px 8px' }}>Developer</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View site</Link>
          <button onClick={() => setLoggedIn(false)} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#5B2EFF' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { label: 'Active projects', value: SAMPLE_PROJECTS.length, color: '#7C5FFF', sub: 'Lagos · Abuja' },
                { label: 'Units available', value: totalAvail, color: '#14B8A6', sub: `of ${totalUnits} total` },
                { label: 'Units sold', value: totalSold, color: '#22C55E', sub: fmtNGN(totalRevenue)+' revenue' },
                { label: 'Active leads', value: leads.filter(l => l.stage !== 'sold').length, color: '#F59E0B', sub: `${leads.filter(l=>l.stage==='new').length} new this week` },
              ].map(s => (
                <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                  <div style={{ fontSize: '0.62rem', color: text3, marginTop: 2 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }}>Project progress</div>
            {SAMPLE_PROJECTS.map(p => {
              const avail = p.total_units - p.sold_units - p.reserved_units
              const soldPct = pct(p.sold_units, p.total_units)
              return (
                <div key={p.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: text3 }}>{p.location}, {p.city} · Handover {new Date(p.handover_date).toLocaleDateString('en-GB',{month:'short',year:'numeric'})} · {p.stage}</div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#7C5FFF' }}>{fmtNGN(p.unit_types.reduce((s,u)=>s+u.sold*u.price_ngn,0))}</div>
                      <div style={{ fontSize: 11, color: text3 }}>sold revenue</div>
                    </div>
                  </div>
                  {/* Construction progress */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: text3, marginBottom: 4 }}>
                      <span>Construction: {p.completion_pct}%</span>
                      <span>Sales: {soldPct}% sold</span>
                    </div>
                    <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 3 }}>
                      <div style={{ height: '100%', width: `${p.completion_pct}%`, background: '#14B8A6', borderRadius: 3 }} />
                    </div>
                    <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${soldPct}%`, background: '#5B2EFF', borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '2px 8px', borderRadius: 20 }}>{avail} available</span>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 8px', borderRadius: 20 }}>{p.reserved_units} reserved</span>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '2px 8px', borderRadius: 20 }}>{p.sold_units} sold</span>
                    <button onClick={() => { setActiveProject(p); setTab('units') }} style={{ fontSize: 11, color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', padding: '2px 8px', borderRadius: 20, cursor: 'pointer', marginLeft: 'auto' }}>
                      Manage units →
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── PROJECTS ── */}
        {tab === 'projects' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em' }}>All projects</div>
              <button onClick={() => setTab('addproject')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New project</button>
            </div>
            {SAMPLE_PROJECTS.map(p => {
              const avail = p.total_units - p.sold_units - p.reserved_units
              const projRevenue = p.unit_types.reduce((s,u)=>s+u.sold*u.price_ngn,0)
              const expectedRevenue = p.unit_types.reduce((s,u)=>s+u.quantity*u.price_ngn,0)
              return (
                <div key={p.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: text }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>{p.location}, {p.city} · {p.total_units} units · Handover {new Date(p.handover_date).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</div>
                      <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>Stage: {p.stage} · {p.completion_pct}% complete (construction)</div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#7C5FFF' }}>{fmtNGN(projRevenue)}</div>
                      <div style={{ fontSize: 11, color: text3 }}>of {fmtNGN(expectedRevenue)} expected</div>
                    </div>
                  </div>
                  {/* Unit type breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6, marginBottom: 12 }}>
                    {p.unit_types.map(u => {
                      const available = u.quantity - u.sold - u.reserved
                      return (
                        <div key={u.type} style={{ background: bg2, borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: text, marginBottom: 2 }}>{u.type}</div>
                          <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>{fmtNGN(u.price_ngn)}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '1px 5px', borderRadius: 10 }}>{available} avail</span>
                            <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '1px 5px', borderRadius: 10 }}>{u.reserved} res</span>
                            <span style={{ fontSize: 10, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '1px 5px', borderRadius: 10 }}>{u.sold} sold</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setActiveProject(p); setTab('units') }} style={{ fontSize: 12, color: '#5B2EFF', background: 'rgba(91,46,255,0.08)', border: '1px solid rgba(91,46,255,0.2)', padding: '4px 12px', borderRadius: 7, cursor: 'pointer' }}>Unit tracker →</button>
                    <button onClick={() => setTab('pipeline')} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, padding: '4px 12px', borderRadius: 7, cursor: 'pointer' }}>View leads →</button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── UNIT TRACKER ── */}
        {tab === 'units' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Unit tracker — {activeProject.name}</div>
              <select value={activeProject.id} onChange={e => setActiveProject(SAMPLE_PROJECTS.find(p=>p.id===e.target.value)!)} style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 7, background: bg3, color: text, outline: 'none', cursor: 'pointer' }}>
                {SAMPLE_PROJECTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {activeProject.unit_types.map(u => {
                const available = u.quantity - u.sold - u.reserved
                return (
                  <div key={u.type} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: text, marginBottom: 2 }}>{u.type}</div>
                    <div style={{ fontSize: 12, color: text3, marginBottom: 10 }}>{fmtNGN(u.price_ngn)} each</div>
                    <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct(u.sold, u.quantity)}%`, background: '#5B2EFF', borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '2px 7px', borderRadius: 20 }}>{available} avail</span>
                      <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 7px', borderRadius: 20 }}>{u.reserved} res</span>
                      <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '2px 7px', borderRadius: 20 }}>{u.sold} sold</span>
                    </div>
                    <div style={{ fontSize: 11, color: text3, marginTop: 8 }}>Revenue: {fmtNGN(u.sold * u.price_ngn)} of {fmtNGN(u.quantity * u.price_ngn)}</div>
                  </div>
                )
              })}
            </div>

            {/* Mark unit form */}
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Mark a unit</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {[
                  { l: 'Unit type', el: <select style={{ width:'100%', fontSize:13, padding:'7px 10px', border:`1px solid ${border}`, borderRadius:8, background:bg3, color:text, outline:'none' }}>{activeProject.unit_types.map(u=><option key={u.type}>{u.type}</option>)}</select> },
                  { l: 'Unit ref (e.g. B-204)', el: <input style={{ width:'100%', fontSize:13, padding:'7px 10px', border:`1px solid ${border}`, borderRadius:8, background:dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)', color:text, outline:'none', fontFamily:'inherit' }} placeholder="e.g. B-204" /> },
                  { l: 'Buyer name', el: <input style={{ width:'100%', fontSize:13, padding:'7px 10px', border:`1px solid ${border}`, borderRadius:8, background:dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)', color:text, outline:'none', fontFamily:'inherit' }} placeholder="Full name" /> },
                  { l: 'Buyer phone', el: <input style={{ width:'100%', fontSize:13, padding:'7px 10px', border:`1px solid ${border}`, borderRadius:8, background:dark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)', color:text, outline:'none', fontFamily:'inherit' }} placeholder="+234..." /> },
                ].map(f => (
                  <div key={f.l}>
                    <div style={{ fontSize: 11, color: text2, marginBottom: 4 }}>{f.l}</div>
                    {f.el}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark Reserved</button>
                <button style={{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark Sold</button>
              </div>
            </div>
          </>
        )}

        {/* ── SALES PIPELINE ── */}
        {tab === 'pipeline' && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Sales pipeline — {leads.length} leads</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, overflowX: 'auto' as const }}>
              {STAGE_ORDER.map(stage => {
                const stageleads = leads.filter(l => l.stage === stage)
                const color = STAGE_COLORS[stage]
                return (
                  <div key={stage}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color, borderBottom: `2px solid ${color}`, paddingBottom: 6, marginBottom: 8 }}>
                      {STAGE_LABELS[stage]} ({stageleads.length})
                    </div>
                    {stageleads.map(l => (
                      <div key={l.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 9, padding: '0.75rem', marginBottom: 7 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 2 }}>{l.name}</div>
                        <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>{SAMPLE_PROJECTS.find(p=>p.id===l.project_id)?.name?.split(' ').slice(0,2).join(' ')} · {l.unit_type}</div>
                        <div style={{ fontSize: 11, color: text3, fontStyle: 'italic', marginBottom: 6, lineHeight: 1.4 }}>{l.note.slice(0, 50)}{l.note.length > 50 ? '…' : ''}</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                          {STAGE_ORDER.filter(s => s !== stage).slice(0, 2).map(s => (
                            <button key={s} onClick={() => moveLead(l.id, s)} style={{ fontSize: 10, color: STAGE_COLORS[s], background: 'transparent', border: `1px solid ${STAGE_COLORS[s]}40`, padding: '1px 6px', borderRadius: 5, cursor: 'pointer' }}>
                              → {STAGE_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {stageleads.length === 0 && <div style={{ fontSize: 11, color: text3, padding: '0.5rem', textAlign: 'center' }}>Empty</div>}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── PAYMENT PLANS ── */}
        {tab === 'plans' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { l:'Active plans', v:SAMPLE_PLANS.filter(p=>p.status!=='completed').length, c:'#7C5FFF' },
                { l:'Total collected', v:fmtNGN(SAMPLE_PLANS.reduce((s,p)=>s+p.paid_ngn,0)), c:'#22C55E' },
                { l:'Outstanding', v:fmtNGN(SAMPLE_PLANS.reduce((s,p)=>s+(p.total_ngn-p.paid_ngn),0)), c:'#F59E0B' },
              ].map(s => (
                <div key={s.l} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{s.l}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            {SAMPLE_PLANS.map(plan => {
              const paidPct    = pct(plan.paid_ngn, plan.total_ngn)
              const remaining  = plan.total_ngn - plan.paid_ngn
              const statusColor = plan.status === 'completed' ? '#22C55E' : plan.status === 'overdue' ? '#EF4444' : '#14B8A6'
              const statusBg    = plan.status === 'completed' ? 'rgba(34,197,94,0.1)' : plan.status === 'overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)'
              return (
                <div key={plan.id} style={{ background: bg3, border: `1px solid ${plan.status === 'overdue' ? 'rgba(239,68,68,0.3)' : border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{plan.buyer_name}</div>
                      <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>{plan.unit_ref} · {plan.project}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#7C5FFF' }}>{fmtNGN(plan.paid_ngn)} <span style={{ fontWeight: 400, color: text3, fontSize: 12 }}>/ {fmtNGN(plan.total_ngn)}</span></div>
                        <div style={{ fontSize: 11, color: text3 }}>{fmtNGN(remaining)} remaining</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: statusBg, color: statusColor }}>
                        {plan.status === 'on_track' ? 'On track' : plan.status === 'overdue' ? 'Overdue' : 'Completed'}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 7, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${paidPct}%`, background: plan.status === 'overdue' ? '#EF4444' : '#5B2EFF', borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: text3 }}>
                    <span>{paidPct}% paid · {plan.duration_months}-month plan</span>
                    <span>{plan.status !== 'completed' ? `Next due: ${plan.next_due}` : '✓ Fully paid'}</span>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── ADD PROJECT ── */}
        {tab === 'addproject' && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>Create new project</div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem' }}>
              <AddProjectForm dark={dark} onSaved={() => setTab('projects')} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
