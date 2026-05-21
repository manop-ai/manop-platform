'use client'
// app/developer/dashboard/page.tsx — AUTH REBUILT FOR SPRINT 1
//
// OLD ROOT CAUSE: manop_dev_token / manop_dev_id in localStorage + partner_sessions race.
// NEW: useAuth('developer') → session guard → load by auth_user_id.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────
interface DevAccount {
  id:           string
  company_name: string
  contact_name: string
  email:        string
  cities:       string[]
  verified:     boolean
  mape_score:   number | null
}

interface Project {
  id:            string
  name:          string
  location:      string
  city:          string
  stage:         string
  total_units:   number
  handover_date: string | null
  completion_pct: number | null
  unit_types?:   UnitType[]
}

interface UnitType {
  id:             string
  unit_type:      string
  price_ngn:      number
  quantity:       number
  sold_count:     number
  reserved_count: number
}

interface Lead {
  id:           string
  name:         string
  phone:        string | null
  unit_interest: string | null
  note:         string | null
  stage:        string
  project_id:   string
  created_at:   string
}

type Tab = 'overview' | 'projects' | 'units' | 'pipeline' | 'addproject'

function fmtNGN(n: number): string {
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1000)}K`
}
function pct(a: number, b: number) { return b === 0 ? 0 : Math.round((a/b)*100) }

export default function DeveloperDashboard() {
  const router  = useRouter()
  const { user, checking } = useAuth('developer')
  const [dark, setDark] = useState(true)

  const [dev,      setDev]      = useState<DevAccount | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [leads,    setLeads]    = useState<Lead[]>([])
  const [tab,      setTab]      = useState<Tab>('overview')
  const [loading,  setLoading]  = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  // Add project form
  const [newProj, setNewProj] = useState({ name: '', location: '', city: 'Lagos', total_units: '', stage: 'Foundation', handover: '', completion: '' })
  const [addErr, setAddErr]   = useState('')
  const [adding,  setAdding]  = useState(false)

  // Mark unit form
  const [markUnit, setMarkUnit] = useState({ type: '', ref: '', buyer: '', phone: '', status: 'reserved' })
  const [markMsg,  setMarkMsg]  = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const loadData = useCallback(async (authUserId: string) => {
    setLoading(true)
    try {
      const { data: account } = await sb
        .from('developer_accounts')
        .select('id,company_name,contact_name,email,cities,verified,mape_score')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (!account) { setLoading(false); return }
      setDev(account as DevAccount)

      const { data: projs } = await sb
        .from('developer_projects')
        .select('*')
        .eq('developer_id', account.id)
        .eq('active', true)
        .order('created_at', { ascending: false })

      if (projs && projs.length > 0) {
        const projIds = projs.map((p: Project) => p.id)
        const { data: unitTypes } = await sb.from('developer_unit_types').select('*').in('project_id', projIds)
        const projectsWithUnits = projs.map((p: Project) => ({
          ...p,
          unit_types: (unitTypes || []).filter((u: UnitType & { project_id: string }) => u.project_id === p.id),
        }))
        setProjects(projectsWithUnits as Project[])
        if (!activeProjectId && projs.length > 0) setActiveProjectId(projs[0].id)
      }

      const { data: leadsData } = await sb
        .from('developer_leads')
        .select('*')
        .eq('developer_id', account.id)
        .order('created_at', { ascending: false })
      setLeads((leadsData as Lead[]) || [])
    } catch {}
    setLoading(false)
  }, [activeProjectId])

  useEffect(() => {
    if (user) loadData(user.id)
  }, [user, loadData])

  async function handleAddProject() {
    setAddErr('')
    if (!newProj.name.trim() || !newProj.location.trim()) { setAddErr('Project name and location are required.'); return }
    if (!newProj.total_units || parseInt(newProj.total_units) < 1) { setAddErr('Total units required.'); return }
    if (!dev) return
    setAdding(true)
    try {
      const { error } = await sb.from('developer_projects').insert({
        developer_id:    dev.id,
        name:            newProj.name.trim(),
        location:        newProj.location.trim(),
        city:            newProj.city,
        stage:           newProj.stage,
        total_units:     parseInt(newProj.total_units),
        handover_date:   newProj.handover || null,
        completion_pct:  newProj.completion ? parseInt(newProj.completion) : 0,
        active:          true,
        created_at:      new Date().toISOString(),
      })
      if (error) throw new Error(error.message)
      setNewProj({ name: '', location: '', city: 'Lagos', total_units: '', stage: 'Foundation', handover: '', completion: '' })
      setTab('projects')
      await loadData(user!.id)
    } catch (e: unknown) {
      setAddErr(e instanceof Error ? e.message : 'Failed to create project.')
    } finally {
      setAdding(false)
    }
  }

  async function moveLead(leadId: string, newStage: string) {
    await sb.from('developer_leads').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l))
  }

  async function handleSignOut() {
    await sb.auth.signOut()
    router.replace('/login')
  }

  // ── Styles ─────────────────────────────────────────────────
  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const STAG: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10 }
  const INP: React.CSSProperties  = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.875rem', outline: 'none', padding: '0.65rem 0.875rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const CARD: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: 10 }

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0] || null
  const totalUnitsAll = projects.reduce((s, p) => s + p.total_units, 0)
  const totalSold     = projects.reduce((s, p) => s + (p.unit_types?.reduce((a, u) => a + u.sold_count, 0) || 0), 0)
  const totalRevenue  = projects.reduce((s, p) => s + (p.unit_types?.reduce((a, u) => a + u.sold_count * u.price_ngn, 0) || 0), 0)
  const activeLeads   = leads.filter(l => l.stage !== 'sold').length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Overview' },
    { key: 'projects',   label: `Projects (${projects.length})` },
    { key: 'units',      label: 'Unit tracker' },
    { key: 'pipeline',   label: `Pipeline (${activeLeads})` },
    { key: 'addproject', label: '+ New project' },
  ]

  if (checking || (user && !dev && loading)) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (user && !dev) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: text, marginBottom: '0.75rem' }}>Setup not complete</h2>
        <Link href="/developer/onboard" style={{ background: '#F59E0B', color: '#fff', borderRadius: 8, padding: '0.65rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>
          Complete setup →
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{dev?.company_name}</div>
            <div style={{ fontSize: 11, color: text3 }}>Developer · {dev?.cities?.join(', ')}</div>
          </div>
          {dev?.verified && <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '2px 8px' }}>● Verified</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View site</Link>
          <button onClick={handleSignOut} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#F59E0B' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { l: 'Active projects', v: projects.length,              c: '#7C5FFF' },
                { l: 'Units available', v: totalUnitsAll - totalSold,    c: '#14B8A6' },
                { l: 'Units sold',      v: totalSold,                    c: '#22C55E' },
                { l: 'Active leads',    v: activeLeads,                  c: '#F59E0B' },
              ].map(s => (
                <div key={s.l} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={STAG}>{s.l}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.c, letterSpacing: '-0.03em' }}>{s.v}</div>
                </div>
              ))}
            </div>
            {loading ? <div style={{ color: text3, fontSize: 13 }}>Loading…</div>
              : projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏗️</div>
                  <button onClick={() => setTab('addproject')} style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add your first project →</button>
                </div>
              ) : projects.map(p => {
                const sold = p.unit_types?.reduce((s, u) => s + u.sold_count, 0) || 0
                return (
                  <div key={p.id} style={CARD}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>{p.location}, {p.city} · {p.stage} · {p.total_units} units</div>
                    <div style={{ height: 6, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${pct(sold, p.total_units)}%`, background: '#F59E0B', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: text3 }}>{sold}/{p.total_units} sold · {fmtNGN(p.unit_types?.reduce((s, u) => s + u.sold_count * u.price_ngn, 0) || 0)} revenue</div>
                  </div>
                )
              })}
          </>
        )}

        {tab === 'projects' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={STAG}>All projects</div>
              <button onClick={() => setTab('addproject')} style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ New project</button>
            </div>
            {projects.map(p => (
              <div key={p.id} style={CARD}>
                <div style={{ fontWeight: 700, fontSize: 15, color: text, marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>{p.location}, {p.city} · {p.stage} · Handover {p.handover_date ? new Date(p.handover_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'TBD'}</div>
                <button onClick={() => { setActiveProjectId(p.id); setTab('units') }} style={{ fontSize: 12, color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', padding: '4px 12px', borderRadius: 7, cursor: 'pointer' }}>Unit tracker →</button>
              </div>
            ))}
          </>
        )}

        {tab === 'units' && activeProject && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={STAG}>Unit tracker — {activeProject.name}</div>
              {projects.length > 1 && (
                <select value={activeProjectId || ''} onChange={e => setActiveProjectId(e.target.value)}
                  style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${border}`, borderRadius: 7, background: bg3, color: text, outline: 'none', cursor: 'pointer' }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {activeProject.unit_types?.map(u => {
                const avail = u.quantity - u.sold_count - u.reserved_count
                return (
                  <div key={u.id} style={CARD}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: text, marginBottom: 2 }}>{u.unit_type}</div>
                    <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>{fmtNGN(u.price_ngn)} each</div>
                    <div style={{ height: 5, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${pct(u.sold_count, u.quantity)}%`, background: '#F59E0B', borderRadius: 3 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22C55E', padding: '2px 7px', borderRadius: 20 }}>{avail} avail</span>
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 7px', borderRadius: 20 }}>{u.reserved_count} res</span>
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'rgba(91,46,255,0.1)', color: '#7C5FFF', padding: '2px 7px', borderRadius: 20 }}>{u.sold_count} sold</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {markMsg && <div style={{ fontSize: 13, color: markMsg.startsWith('✓') ? '#22C55E' : '#EF4444', marginBottom: 10 }}>{markMsg}</div>}
          </>
        )}

        {tab === 'pipeline' && (
          <>
            <div style={STAG}>Sales pipeline — {leads.length} leads</div>
            {leads.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3, fontSize: 14 }}>No leads yet</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 10 }}>
                {['new','contacted','viewing','offer'].map(stage => {
                  const stageLeads = leads.filter(l => l.stage === stage)
                  return (
                    <div key={stage}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', color: '#F59E0B', borderBottom: '2px solid #F59E0B', paddingBottom: 5, marginBottom: 8 }}>
                        {stage} ({stageLeads.length})
                      </div>
                      {stageLeads.map(l => (
                        <div key={l.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 9, padding: '0.75rem', marginBottom: 7 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: text, marginBottom: 2 }}>{l.name}</div>
                          <div style={{ fontSize: 11, color: text3, marginBottom: 6 }}>{l.unit_interest}</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                            {['contacted','viewing','offer','sold'].map(s => (
                              <button key={s} onClick={() => moveLead(l.id, s)}
                                style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, border: `1px solid ${border}`, background: 'transparent', color: text3, cursor: 'pointer', fontFamily: 'inherit' }}>
                                → {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'addproject' && (
          <div style={{ maxWidth: 560 }}>
            <div style={STAG}>New project</div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Project name *</label>
                  <input style={INP} value={newProj.name} onChange={e => setNewProj(p => ({...p,name:e.target.value}))} placeholder="e.g. The Lekki Waterfront" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Location / Neighborhood *</label>
                  <input style={INP} value={newProj.location} onChange={e => setNewProj(p => ({...p,location:e.target.value}))} placeholder="e.g. Lekki Phase 1" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>City</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={newProj.city} onChange={e => setNewProj(p => ({...p,city:e.target.value}))}>
                    {['Lagos','Abuja','Port Harcourt','Accra','Nairobi','Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Total units *</label>
                  <input style={INP} type="number" value={newProj.total_units} onChange={e => setNewProj(p => ({...p,total_units:e.target.value}))} placeholder="e.g. 80" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Stage</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={newProj.stage} onChange={e => setNewProj(p => ({...p,stage:e.target.value}))}>
                    {['Foundation','Structure','Roofing','Finishing','Completed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Completion %</label>
                  <input style={INP} type="number" min="0" max="100" value={newProj.completion} onChange={e => setNewProj(p => ({...p,completion:e.target.value}))} placeholder="0" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 4 }}>Expected handover</label>
                  <input style={INP} type="month" value={newProj.handover} onChange={e => setNewProj(p => ({...p,handover:e.target.value}))} />
                </div>
              </div>
              {addErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{addErr}</div>}
              <button onClick={handleAddProject} disabled={adding}
                style={{ width: '100%', background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 9, padding: '0.8rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: adding ? 0.7 : 1 }}>
                {adding ? 'Creating…' : 'Create project →'}
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}