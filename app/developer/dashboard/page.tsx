'use client'
// app/developer/dashboard/page.tsx — LIVE VERSION (no mock data)
// All data comes from Supabase — developer_projects, developer_units,
// developer_leads, developer_payment_plans tables
// Session auth via partner_sessions token stored in localStorage

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import ImageUploader from '@/components/ImageUploader'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ── Types ──────────────────────────────────────────────────────
interface DevAccount {
  id: string; company_name: string; contact_name: string
  email: string; cities: string[]; verified: boolean
}
interface Project {
  id: string; name: string; location: string; city: string
  total_units: number; completion_pct: number; stage: string
  handover_date: string | null; images: string[]; active: boolean
  created_at: string
  unit_types?: UnitType[]
}
interface UnitType {
  id: string; project_id: string; unit_type: string
  price_ngn: number; quantity: number; sold_count: number
  reserved_count: number; installment_months: number | null
}
interface Lead {
  id: string; project_id: string | null; name: string
  phone: string | null; email: string | null; unit_interest: string | null
  stage: string; note: string | null; created_at: string
}
interface PaymentPlan {
  id: string; buyer_name: string; unit_ref: string | null
  project_id: string | null; total_ngn: number; paid_ngn: number
  duration_months: number; next_due_date: string | null; status: string
}

type Tab = 'overview' | 'projects' | 'units' | 'pipeline' | 'plans' | 'addproject'

const STAGE_ORDER = ['new','contacted','site_visit','reserved','sold'] as const
const STAGE_LABELS: Record<string, string> = {
  new:'New', contacted:'Contacted', site_visit:'Site visit',
  reserved:'Reserved', sold:'Sold',
}
const STAGE_COLORS: Record<string, string> = {
  new:'#5B2EFF', contacted:'#F59E0B', site_visit:'#14B8A6',
  reserved:'#22C55E', sold:'#7C5FFF',
}

function fmtNGN(n: number | null) {
  if (!n) return '₦0'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(2)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(1)}M`
  return `₦${Math.round(n/1e3)}K`
}
function pct(a: number, b: number) { return b > 0 ? Math.round((a/b)*100) : 0 }
function parseMillion(v: string): number | null {
  const n = parseFloat(v); return isNaN(n)||n<=0 ? null : Math.round(n*1_000_000)
}

// ── Add Project Form ───────────────────────────────────────────
function AddProjectForm({ devId, dark, onSaved }: {
  devId: string; dark: boolean; onSaved: () => void
}) {
  const [name,       setName]       = useState('')
  const [location,   setLocation]   = useState('')
  const [city,       setCity]       = useState('Lagos')
  const [totalUnits, setTotalUnits] = useState('')
  const [handover,   setHandover]   = useState('')
  const [completion, setCompletion] = useState('0')
  const [stage,      setStage]      = useState('Foundation')
  const [description,setDesc]       = useState('')
  const [mediaUrls,  setMediaUrls]  = useState<string[]>([])
  const [unitTypes,  setUnitTypes]  = useState([
    { type: '2-bedroom', priceM: '', qty: '', months: '24' }
  ])
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.875rem', padding: '0.6rem 0.875rem', outline: 'none', fontFamily: 'inherit',
  }
  const LBL: React.CSSProperties = {
    fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500,
  }

  function addUnitType() {
    setUnitTypes(p => [...p, { type: 'Studio', priceM: '', qty: '', months: '24' }])
  }
  function updateUnit(i: number, f: string, v: string) {
    setUnitTypes(p => p.map((u, idx) => idx === i ? { ...u, [f]: v } : u))
  }

  async function handleSave() {
    if (!name.trim())     { setError('Project name required'); return }
    if (!location.trim()) { setError('Location required'); return }
    if (!totalUnits)      { setError('Total units required'); return }
    const validUnits = unitTypes.filter(u => u.type && u.priceM && u.qty)
    if (validUnits.length === 0) { setError('Add at least one unit type with price and quantity'); return }

    setSaving(true); setError('')
    try {
      // Insert project
      const { data: proj, error: projErr } = await sb.from('developer_projects').insert({
        developer_id:   devId,
        name:           name.trim(),
        location:       location.trim(),
        city,
        total_units:    parseInt(totalUnits) || 0,
        completion_pct: parseInt(completion) || 0,
        stage,
        handover_date:  handover || null,
        description:    description.trim() || null,
        images:         mediaUrls,
        active:         true,
      }).select('id').single()

      if (projErr) throw new Error(projErr.message)

      // Insert unit types
      const unitInserts = validUnits.map(u => ({
        project_id:         proj!.id,
        unit_type:          u.type,
        price_ngn:          parseMillion(u.priceM) || 0,
        quantity:           parseInt(u.qty) || 0,
        sold_count:         0,
        reserved_count:     0,
        installment_months: u.months && u.months !== 'Cash only' ? parseInt(u.months) : null,
      }))
      const { error: utErr } = await sb.from('developer_unit_types').insert(unitInserts)
      if (utErr) throw new Error(utErr.message)

      // Log signal
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'project_created',
          metadata: { dev_id: devId, project: name.trim(), units: parseInt(totalUnits) },
        }),
      }).catch(() => {})

      setSuccess(true)
      setTimeout(onSaved, 1500)
    } catch (e: any) {
      setError(e.message || 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: '#22C55E' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✓</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: text }}>Project created!</div>
      <div style={{ fontSize: 13, color: text2, marginTop: 6 }}>Redirecting to your projects…</div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Project details</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LBL}>Project name *</label>
          <input style={INP} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. The Lekki Waterfront" />
        </div>
        <div>
          <label style={LBL}>Location / Neighborhood *</label>
          <input style={INP} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Lekki Phase 1" />
        </div>
        <div>
          <label style={LBL}>City *</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={city} onChange={e => setCity(e.target.value)}>
            {['Lagos','Abuja','Port Harcourt','Accra','Nairobi','Other'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Total units *</label>
          <input style={INP} type="number" value={totalUnits} onChange={e => setTotalUnits(e.target.value)} placeholder="e.g. 80" />
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
          <input style={INP} type="number" value={completion} onChange={e => setCompletion(e.target.value)} min="0" max="100" />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LBL}>Description (optional)</label>
          <textarea style={{ ...INP, minHeight: 70, resize: 'vertical' }} value={description} onChange={e => setDesc(e.target.value)} placeholder="Key selling points, amenities, location advantages…" />
        </div>
      </div>

      {/* Unit types */}
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Unit types & pricing *</div>
      {unitTypes.map((u, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
          <div>
            {i === 0 && <label style={LBL}>Type</label>}
            <select style={{ ...INP, cursor: 'pointer' }} value={u.type} onChange={e => updateUnit(i, 'type', e.target.value)}>
              {['Studio','1-bedroom','2-bedroom','3-bedroom','4-bedroom','5-bedroom','Penthouse','Commercial'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            {i === 0 && <label style={LBL}>Price (₦M)</label>}
            <input style={INP} type="number" value={u.priceM} onChange={e => updateUnit(i, 'priceM', e.target.value)} placeholder="e.g. 120" />
          </div>
          <div>
            {i === 0 && <label style={LBL}>Quantity</label>}
            <input style={INP} type="number" value={u.qty} onChange={e => updateUnit(i, 'qty', e.target.value)} placeholder="e.g. 20" />
          </div>
          <div>
            {i === 0 && <label style={LBL}>Payment plan</label>}
            <select style={{ ...INP, cursor: 'pointer' }} value={u.months} onChange={e => updateUnit(i, 'months', e.target.value)}>
              {['Cash only','6','12','18','24','36','48'].map(m => <option key={m} value={m}>{m === 'Cash only' ? 'Cash only' : `${m} months`}</option>)}
            </select>
          </div>
          <button onClick={() => setUnitTypes(p => p.filter((_, idx) => idx !== i))} disabled={unitTypes.length === 1}
            style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, color: '#EF4444', cursor: 'pointer', padding: '0.6rem 0.75rem', fontSize: 14, alignSelf: 'flex-end' }}>×</button>
        </div>
      ))}
      <button onClick={addUnitType} style={{ fontSize: 12, color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 7, padding: '0.4rem 0.875rem', cursor: 'pointer', marginBottom: 16 }}>
        + Add unit type
      </button>

      {/* Media */}
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Project media (renders, floor plans)</div>
      <ImageUploader onImagesChange={setMediaUrls} maxImages={8} dark={dark} label="Project photos" hint="Upload renders, floor plans, site photos — JPG or PNG" />

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10, marginTop: 10 }}>{error}</div>}

      <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, marginTop: 12 }}>
        {saving ? 'Creating project…' : 'Create project →'}
      </button>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function DeveloperDashboard() {
  const [dark, setDark]     = useState(true)
  const [dev,  setDev]      = useState<DevAccount | null>(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginErr,   setLoginErr]   = useState('')
  const [logging,    setLogging]    = useState(false)
  const [checking,   setChecking]   = useState(true)

  const [projects, setProjects] = useState<Project[]>([])
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [plans,    setPlans]    = useState<PaymentPlan[]>([])
  const [tab,      setTab]      = useState<Tab>('overview')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const [markUnit, setMarkUnit] = useState({ type: '', ref: '', buyer: '', phone: '', status: 'reserved' })
  const [markMsg,  setMarkMsg]  = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Check for existing session on mount
  useEffect(() => {
    async function checkSession() {
      const token = localStorage.getItem('manop_dev_token')
      const devId = localStorage.getItem('manop_dev_id')
      if (token && devId) {
        // Verify token is valid
        const { data: session } = await sb.from('partner_sessions')
          .select('partner_id, expires_at')
          .eq('token', token)
          .eq('partner_type', 'developer')
          .single()
        if (session && new Date(session.expires_at) > new Date()) {
          // Load developer account
          const { data: account } = await sb.from('developer_accounts')
            .select('id,company_name,contact_name,email,cities,verified')
            .eq('id', devId).single()
          if (account) {
            setDev(account as DevAccount)
            loadData(account.id)
          }
        } else {
          localStorage.removeItem('manop_dev_token')
          localStorage.removeItem('manop_dev_id')
        }
      }
      setChecking(false)
    }
    checkSession()
  }, [])

  const loadData = useCallback(async (devId: string) => {
    setLoading(true)
    try {
      // Load projects with unit types
      const { data: projs } = await sb.from('developer_projects')
        .select('*').eq('developer_id', devId).eq('active', true)
        .order('created_at', { ascending: false })

      if (projs && projs.length > 0) {
        const projIds = projs.map(p => p.id)
        const { data: unitTypes } = await sb.from('developer_unit_types')
          .select('*').in('project_id', projIds)

        const projectsWithUnits = projs.map(p => ({
          ...p,
          unit_types: unitTypes?.filter(u => u.project_id === p.id) || [],
        }))
        setProjects(projectsWithUnits as Project[])
        if (!activeProjectId && projs.length > 0) setActiveProjectId(projs[0].id)
      } else {
        setProjects([])
      }

      // Load leads
      const { data: leadsData } = await sb.from('developer_leads')
        .select('*').eq('developer_id', devId)
        .order('created_at', { ascending: false })
      setLeads((leadsData as Lead[]) || [])

      // Load payment plans
      const { data: plansData } = await sb.from('developer_payment_plans')
        .select('*').eq('developer_id', devId)
        .order('created_at', { ascending: false })
      setPlans((plansData as PaymentPlan[]) || [])
    } catch {}
    setLoading(false)
  }, [activeProjectId])

  async function handleLogin() {
    if (!loginEmail.trim() || !loginEmail.includes('@')) { setLoginErr('Enter a valid email address'); return }
    setLogging(true); setLoginErr('')
    try {
      const { data: account } = await sb.from('developer_accounts')
        .select('id,company_name,contact_name,email,cities,verified')
        .eq('email', loginEmail.trim().toLowerCase()).eq('active', true).single()

      if (!account) {
        setLoginErr('No developer account found for this email. Register first.')
        setLogging(false); return
      }

      // Create new session
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const token = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      await sb.from('partner_sessions').insert({
        partner_type: 'developer', partner_id: account.id, token, email: account.email,
      })
      localStorage.setItem('manop_dev_token',   token)
      localStorage.setItem('manop_dev_id',      account.id)
      localStorage.setItem('manop_dev_email',   account.email)
      localStorage.setItem('manop_dev_company', account.company_name)

      setDev(account as DevAccount)
      loadData(account.id)
    } catch {
      setLoginErr('Login failed. Try again.')
    } finally { setLogging(false) }
  }

  async function moveLead(leadId: string, newStage: string) {
    await sb.from('developer_leads').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l))
  }

  async function handleMarkUnit() {
    if (!markUnit.type || !markUnit.buyer) { setMarkMsg('Unit type and buyer name required'); return }
    if (!activeProjectId || !dev) return

    const unitType = activeProject?.unit_types?.find(u => u.unit_type === markUnit.type)
    if (!unitType) { setMarkMsg('Unit type not found'); return }

    const { error } = await sb.from('developer_units').insert({
      project_id:  activeProjectId,
      unit_type_id: unitType.id,
      unit_ref:    markUnit.ref || null,
      status:      markUnit.status,
      buyer_name:  markUnit.buyer,
      buyer_phone: markUnit.phone || null,
      reserved_at: markUnit.status === 'reserved' ? new Date().toISOString() : null,
      sold_at:     markUnit.status === 'sold'     ? new Date().toISOString() : null,
      price_ngn:   unitType.price_ngn,
    })

    if (error) { setMarkMsg(error.message); return }

    // Update unit type counts
    const field = markUnit.status === 'sold' ? 'sold_count' : 'reserved_count'
    await sb.from('developer_unit_types').update({
      [field]: (unitType[field === 'sold_count' ? 'sold_count' : 'reserved_count'] || 0) + 1
    }).eq('id', unitType.id)

    setMarkMsg(`✓ Unit marked as ${markUnit.status}`)
    setMarkUnit({ type: '', ref: '', buyer: '', phone: '', status: 'reserved' })
    loadData(dev.id)
    setTimeout(() => setMarkMsg(''), 3000)
  }

  // ── Styles ─────────────────────────────────────────────────
  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.875rem', outline: 'none', padding: '0.65rem 0.875rem',
    fontFamily: 'inherit', width: '100%',
  }
  const CARD: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 10,
  }
  const STAG: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6',
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
  }

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null

  // Portfolio stats
  const totalUnitsAll  = projects.reduce((s, p) => s + p.total_units, 0)
  const totalSold      = projects.reduce((s, p) => s + (p.unit_types?.reduce((a, u) => a + u.sold_count, 0) || 0), 0)
  const totalReserved  = projects.reduce((s, p) => s + (p.unit_types?.reduce((a, u) => a + u.reserved_count, 0) || 0), 0)
  const totalRevenue   = projects.reduce((s, p) => s + (p.unit_types?.reduce((a, u) => a + u.sold_count * u.price_ngn, 0) || 0), 0)
  const activeLeads    = leads.filter(l => l.stage !== 'sold').length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview' },
    { key: 'projects',   label: `Projects (${projects.length})` },
    { key: 'units',      label: 'Unit tracker' },
    { key: 'pipeline',   label: `Pipeline (${activeLeads})` },
    { key: 'plans',      label: `Payment plans (${plans.length})` },
    { key: 'addproject', label: '+ New project' },
  ]

  // ── Loading check ─────────────────────────────────────────
  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: text3 }}>Loading…</div>
    </div>
  )

  // ── Login screen ─────────────────────────────────────────
  if (!dev) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text, padding: '1rem', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          <div style={{ fontWeight: 700, color: text }}>Manop · Developer</div>
        </Link>
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: text }}>Developer dashboard</h1>
          <p style={{ fontSize: 13, color: text2, marginBottom: '1.5rem', lineHeight: 1.55 }}>
            Enter your registered email to access your dashboard.
          </p>
          <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 5, fontWeight: 500 }}>Email address</label>
          <input style={{ ...INP, marginBottom: 10 }} type="email" placeholder="you@company.com"
            value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
          {loginErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{loginErr}</div>}
          <button onClick={handleLogin} disabled={logging} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: logging ? 0.7 : 1 }}>
            {logging ? 'Checking…' : 'Access dashboard →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 13, color: text2 }}>
            Not registered yet?{' '}
            <Link href="/developer/onboard" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Create account →</Link>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Dashboard ─────────────────────────────────────────────
  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s' }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{dev.company_name}</div>
            <div style={{ fontSize: 11, color: text3 }}>Developer · {dev.cities.join(', ')}</div>
          </div>
          {dev.verified && <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '2px 8px' }}>● Verified</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View site</Link>
          <button onClick={() => { localStorage.removeItem('manop_dev_token'); localStorage.removeItem('manop_dev_id'); setDev(null) }}
            style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
            Log out
          </button>
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

        {/* ── OVERVIEW ─────────────────────────────────────── */}
        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { l: 'Active projects', v: projects.length,    c: '#7C5FFF', s: `${projects.length} project${projects.length !== 1 ? 's' : ''}` },
                { l: 'Units available', v: totalUnitsAll - totalSold - totalReserved, c: '#14B8A6', s: `of ${totalUnitsAll} total` },
                { l: 'Units sold',      v: totalSold,          c: '#22C55E', s: fmtNGN(totalRevenue) + ' revenue' },
                { l: 'Active leads',    v: activeLeads,        c: '#F59E0B', s: `${leads.filter(l=>l.stage==='new').length} new this week` },
              ].map(s => (
                <div key={s.l} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={STAG}>{s.l}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.c, letterSpacing: '-0.03em' }}>{s.v}</div>
                  <div style={{ fontSize: '0.62rem', color: text3, marginTop: 2 }}>{s.s}</div>
                </div>
              ))}
            </div>

            {loading ? <div style={{ color: text3, fontSize: 13 }}>Loading projects…</div>
            : projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏗️</div>
                <div style={{ marginBottom: 10, fontSize: 14 }}>No projects yet</div>
                <button onClick={() => setTab('addproject')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Add your first project →
                </button>
              </div>
            ) : projects.map(p => {
              const sold     = p.unit_types?.reduce((s, u) => s + u.sold_count, 0) || 0
              const reserved = p.unit_types?.reduce((s, u) => s + u.reserved_count, 0) || 0
              const avail    = p.total_units - sold - reserved
              const revenue  = p.unit_types?.reduce((s, u) => s + u.sold_count * u.price_ngn, 0) || 0
              return (
                <div key={p.id} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 2 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: text3 }}>{p.location}, {p.city} · {p.stage} · {p.total_units} units</div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#7C5FFF' }}>{fmtNGN(revenue)}</div>
                      <div style={{ fontSize: 11, color: text3 }}>sold revenue</div>
                    </div>
                  </div>
                  <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${pct(sold, p.total_units)}%`, background: '#5B2EFF', borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '2px 8px', borderRadius: 20 }}>{avail} available</span>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 8px', borderRadius: 20 }}>{reserved} reserved</span>
                    <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '2px 8px', borderRadius: 20 }}>{sold} sold</span>
                    <button onClick={() => { setActiveProjectId(p.id); setTab('units') }} style={{ fontSize: 11, color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', padding: '2px 8px', borderRadius: 20, cursor: 'pointer', marginLeft: 'auto' }}>
                      Manage units →
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── PROJECTS ─────────────────────────────────────── */}
        {tab === 'projects' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={STAG}>All projects ({projects.length})</div>
              <button onClick={() => setTab('addproject')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New project</button>
            </div>
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏗️</div>
                <button onClick={() => setTab('addproject')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add your first project →</button>
              </div>
            ) : projects.map(p => {
              const sold     = p.unit_types?.reduce((s, u) => s + u.sold_count, 0) || 0
              const reserved = p.unit_types?.reduce((s, u) => s + u.reserved_count, 0) || 0
              return (
                <div key={p.id} style={CARD}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: text3, marginBottom: 10 }}>{p.location}, {p.city} · {p.stage} · Handover {p.handover_date ? new Date(p.handover_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBD'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 10 }}>
                    {p.unit_types?.map(u => {
                      const avail = u.quantity - u.sold_count - u.reserved_count
                      return (
                        <div key={u.id} style={{ background: bg2, borderRadius: 8, padding: '8px 10px' }}>
                          <div style={{ fontSize: 11, fontWeight: 500, color: text, marginBottom: 2 }}>{u.unit_type}</div>
                          <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>{fmtNGN(u.price_ngn)}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '1px 5px', borderRadius: 10 }}>{avail} avail</span>
                            <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '1px 5px', borderRadius: 10 }}>{u.reserved_count} res</span>
                            <span style={{ fontSize: 10, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '1px 5px', borderRadius: 10 }}>{u.sold_count} sold</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => { setActiveProjectId(p.id); setTab('units') }} style={{ fontSize: 12, color: '#5B2EFF', background: 'rgba(91,46,255,0.08)', border: '1px solid rgba(91,46,255,0.2)', padding: '4px 12px', borderRadius: 7, cursor: 'pointer' }}>Unit tracker →</button>
                </div>
              )
            })}
          </>
        )}

        {/* ── UNIT TRACKER ─────────────────────────────────── */}
        {tab === 'units' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={STAG}>Unit tracker {activeProject ? `— ${activeProject.name}` : ''}</div>
              {projects.length > 1 && (
                <select value={activeProjectId || ''} onChange={e => setActiveProjectId(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 7, background: bg3, color: text, outline: 'none', cursor: 'pointer' }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            {!activeProject ? <div style={{ color: text3, fontSize: 13 }}>No projects yet. Add a project first.</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
                  {activeProject.unit_types?.map(u => {
                    const avail = u.quantity - u.sold_count - u.reserved_count
                    return (
                      <div key={u.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: text, marginBottom: 2 }}>{u.unit_type}</div>
                        <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>{fmtNGN(u.price_ngn)} each</div>
                        <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                          <div style={{ height: '100%', width: `${pct(u.sold_count, u.quantity)}%`, background: '#5B2EFF', borderRadius: 3 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '2px 7px', borderRadius: 20 }}>{avail} avail</span>
                          <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 7px', borderRadius: 20 }}>{u.reserved_count} res</span>
                          <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '2px 7px', borderRadius: 20 }}>{u.sold_count} sold</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Mark a unit */}
                <div style={CARD}>
                  <div style={STAG}>Mark a unit</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    {[
                      { l: 'Unit type', el: <select style={{ ...INP, cursor: 'pointer' }} value={markUnit.type} onChange={e => setMarkUnit(p => ({ ...p, type: e.target.value }))}><option value="">Select</option>{activeProject.unit_types?.map(u => <option key={u.id}>{u.unit_type}</option>)}</select> },
                      { l: 'Unit ref (e.g. B-204)', el: <input style={INP} placeholder="e.g. B-204" value={markUnit.ref} onChange={e => setMarkUnit(p => ({ ...p, ref: e.target.value }))} /> },
                      { l: 'Buyer name', el: <input style={INP} placeholder="Full name" value={markUnit.buyer} onChange={e => setMarkUnit(p => ({ ...p, buyer: e.target.value }))} /> },
                      { l: 'Buyer phone', el: <input style={INP} placeholder="+234..." value={markUnit.phone} onChange={e => setMarkUnit(p => ({ ...p, phone: e.target.value }))} /> },
                    ].map(f => <div key={f.l}><div style={{ fontSize: 11, color: text2, marginBottom: 4 }}>{f.l}</div>{f.el}</div>)}
                  </div>
                  {markMsg && <div style={{ fontSize: 12, color: markMsg.startsWith('✓') ? '#22C55E' : '#EF4444', marginBottom: 10 }}>{markMsg}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setMarkUnit(p => ({ ...p, status: 'reserved' })); handleMarkUnit() }} style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark Reserved</button>
                    <button onClick={() => { setMarkUnit(p => ({ ...p, status: 'sold' })); handleMarkUnit() }}     style={{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Mark Sold</button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── PIPELINE (Kanban) ────────────────────────────── */}
        {tab === 'pipeline' && (
          <>
            <div style={STAG}>Sales pipeline — {leads.length} leads</div>
            {leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>👥</div>
                <div style={{ fontSize: 14, marginBottom: 10 }}>No leads yet</div>
                <div style={{ fontSize: 12, color: text3 }}>Leads added via your listings or manually will appear here.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, overflowX: 'auto' as const }}>
                {STAGE_ORDER.map(stage => {
                  const stageLeads = leads.filter(l => l.stage === stage)
                  const color = STAGE_COLORS[stage]
                  return (
                    <div key={stage}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color, borderBottom: `2px solid ${color}`, paddingBottom: 6, marginBottom: 8 }}>
                        {STAGE_LABELS[stage]} ({stageLeads.length})
                      </div>
                      {stageLeads.map(l => {
                        const proj = projects.find(p => p.id === l.project_id)
                        return (
                          <div key={l.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 9, padding: '0.75rem', marginBottom: 7 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 2 }}>{l.name}</div>
                            <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>{proj?.name?.split(' ').slice(0,2).join(' ') || 'No project'}{l.unit_interest ? ` · ${l.unit_interest}` : ''}</div>
                            {l.note && <div style={{ fontSize: 11, color: text3, fontStyle: 'italic', marginBottom: 6, lineHeight: 1.4 }}>{l.note.slice(0, 50)}{l.note.length > 50 ? '…' : ''}</div>}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                              {STAGE_ORDER.filter(s => s !== stage).slice(0, 2).map(s => (
                                <button key={s} onClick={() => moveLead(l.id, s)} style={{ fontSize: 10, color: STAGE_COLORS[s], background: 'transparent', border: `1px solid ${STAGE_COLORS[s]}40`, padding: '1px 6px', borderRadius: 5, cursor: 'pointer' }}>
                                  → {STAGE_LABELS[s]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {stageLeads.length === 0 && <div style={{ fontSize: 11, color: text3, padding: '0.5rem', textAlign: 'center' }}>Empty</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── PAYMENT PLANS ────────────────────────────────── */}
        {tab === 'plans' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { l: 'Active plans',    v: plans.filter(p=>p.status!=='completed').length, c: '#7C5FFF' },
                { l: 'Total collected', v: fmtNGN(plans.reduce((s,p)=>s+p.paid_ngn,0)),   c: '#22C55E' },
                { l: 'Outstanding',     v: fmtNGN(plans.reduce((s,p)=>s+(p.total_ngn-p.paid_ngn),0)), c: '#F59E0B' },
              ].map(s => (
                <div key={s.l} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={STAG}>{s.l}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
            {plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>💳</div>
                <div style={{ fontSize: 14 }}>No payment plans yet</div>
              </div>
            ) : plans.map(plan => {
              const paidPct   = pct(plan.paid_ngn, plan.total_ngn)
              const remaining = plan.total_ngn - plan.paid_ngn
              const sc = plan.status === 'completed' ? '#22C55E' : plan.status === 'overdue' ? '#EF4444' : '#14B8A6'
              const sb2 = plan.status === 'completed' ? 'rgba(34,197,94,0.1)' : plan.status === 'overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(20,184,166,0.1)'
              const proj = projects.find(p => p.id === plan.project_id)
              return (
                <div key={plan.id} style={{ ...CARD, border: `1px solid ${plan.status === 'overdue' ? 'rgba(239,68,68,0.3)' : border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: text }}>{plan.buyer_name}</div>
                      <div style={{ fontSize: 12, color: text3, marginTop: 2 }}>{plan.unit_ref || 'Unit'} · {proj?.name || 'Project'}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#7C5FFF' }}>{fmtNGN(plan.paid_ngn)} <span style={{ fontWeight: 400, color: text3, fontSize: 12 }}>/ {fmtNGN(plan.total_ngn)}</span></div>
                        <div style={{ fontSize: 11, color: text3 }}>{fmtNGN(remaining)} remaining</div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: sb2, color: sc }}>
                        {plan.status === 'on_track' ? 'On track' : plan.status === 'overdue' ? 'Overdue' : 'Completed'}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 7, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${paidPct}%`, background: plan.status === 'overdue' ? '#EF4444' : '#5B2EFF', borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: text3 }}>
                    <span>{paidPct}% paid · {plan.duration_months}-month plan</span>
                    <span>{plan.status !== 'completed' ? `Next due: ${plan.next_due_date || 'TBD'}` : '✓ Fully paid'}</span>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── ADD PROJECT ──────────────────────────────────── */}
        {tab === 'addproject' && (
          <>
            <div style={STAG}>Create new project</div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem' }}>
              <AddProjectForm devId={dev.id} dark={dark} onSaved={() => { loadData(dev.id); setTab('projects') }} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}