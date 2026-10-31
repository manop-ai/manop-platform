'use client'

// app/developer/dashboard/page.tsx
// AUTH + PROJECT CAP + TRANSACTION MODAL PATCHED

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../../lib/supabase/client'

import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

import { ManopLogoSVG } from '../../../components/ManopLogo'
import TransactionPromptModal from '../../../components/TransactionPromptModal'
import MyFinancePanel from '../../../components/MyFinancePanel'
import { authedFetch } from '../../../lib/authed-fetch'
import DealRoomPanel from '../../../components/DealRoomPanel'
import UnitRequestSummary from '../../../components/UnitRequestSummary'
import { LEAD_STAGES, CLOSED_STAGES } from '../../../lib/deal-room'
import DevelopmentUpdates from '../../../components/DevelopmentUpdates'
import DevelopmentCompleteness from '../../../components/DevelopmentCompleteness'
import DevelopmentProgress from '../../../components/DevelopmentProgress'
import PartnerFeesPanel from '../../../components/PartnerFeesPanel'
import AgreementRequestPanel from '../../../components/agreements/AgreementRequestPanel'
import { ExternalLink } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface DevAccount {
  id: string
  company_name: string
  contact_name: string
  email: string
  cities: string[]
  verified: boolean
}

interface Project {
  id: string
  name: string
  location: string
  city: string
  neighborhood?: string | null
  country_code?: string | null
  stage: string
  total_units: number
  handover_date: string | null
  completion_pct: number | null
  publish_status: string
  reviewed_at: string | null
  manop_checked_note: string | null
  unit_types?: UnitType[]
}

interface UnitType {
  id: string
  unit_type: string
  price_ngn: number | null
  quantity: number | null
  available_count?: number | null
  sold_count: number
  reserved_count: number
  size_sqm: number | null
}

interface Lead {
  id: string
  name: string
  phone: string | null
  unit_interest: string | null
  note: string | null
  stage: string
  project_id: string
  created_at: string
  source: string | null       // 'manop_financing_developer_plan' flags a buyer who
  budget_usd: number | null   // chose Developer Installment Plan in Get Financed,
}                              // distinct from a general enquiry — see Finance tab

type Tab =
  | 'overview'
  | 'projects'
  | 'units'
  | 'construction'
  | 'review'
  | 'agreement'
  | 'pipeline'
  | 'finance'
  | 'addproject'
  | 'settings'

// ─── Helpers ──────────────────────────────────────────────────

function fmtNGN(n: number): string {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1000)}K`
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100)
}

// ─── Component ────────────────────────────────────────────────

export default function DeveloperDashboard() {
  const router = useRouter()
  const { user, checking } = useAuth('developer')

  const [dark, setDark] = useState(getInitialDark)

  const [dev, setDev] = useState<DevAccount | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [dealRoomLead, setDealRoomLead] = useState<string | null>(null)

  const [tab, setTab] = useState<Tab>('overview')
  const [agreementFor, setAgreementFor]   = useState<string | null>(null)
  const [agreementOpen, setAgreementOpen] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)

  const [activeProjectId, setActiveProjectId] =
    useState<string | null>(null)

  // ── Transaction modal ────────────────────────────────

  const [showTxPrompt, setShowTxPrompt] = useState(false)
  const [txProjectName, setTxProjectName] = useState('')
  const [txCity, setTxCity] = useState('')

  // ── Add project form ─────────────────────────────────

  const [newProj, setNewProj] = useState({
    name: '',
    location: '',
    city: 'Lagos',
    total_units: '',
    stage: 'Foundation',
    handover: '',
    completion: '',
  })

  const [addErr, setAddErr] = useState('')
  const [adding, setAdding] = useState(false)

  // ── Theme ────────────────────────────────────────────

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  // ── Load data ────────────────────────────────────────

  const loadData = useCallback(
    async (authUserId: string) => {
      setLoading(true)

      try {
        const { data: account } = await sb
          .from('developer_accounts')
          .select(
            'id,company_name,contact_name,email,cities,verified',
          )
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        if (!account) {
          setLoading(false)
          return
        }

        setDev(account as DevAccount)

        const { data: projs } = await sb
          .from('developer_projects')
          .select('*')
          .eq('developer_id', account.id)
          .eq('active', true)
          .order('created_at', { ascending: false })

        if (projs && projs.length > 0) {
          const projIds = projs.map((p: Project) => p.id)

          const { data: unitTypes } = await sb
            .from('developer_unit_types')
            .select('*')
            .in('project_id', projIds)

          const projectsWithUnits = projs.map((p: Project) => ({
            ...p,
            unit_types: (unitTypes || []).filter(
              (u: UnitType & { project_id: string }) =>
                u.project_id === p.id,
            ),
          }))

          setProjects(projectsWithUnits as Project[])

          if (!activeProjectId && projs.length > 0) {
            setActiveProjectId(projs[0].id)
          }
        }

        const { data: leadsData } = await sb
          .from('developer_leads')
          .select('*')
          .eq('developer_id', account.id)
          .order('created_at', { ascending: false })

        setLeads((leadsData as Lead[]) || [])
      } catch {}

      setLoading(false)
    },
    [activeProjectId],
  )

  useEffect(() => {
    if (user) loadData(user.id)
  }, [user, loadData])

  // ── Add project ──────────────────────────────────────

  async function handleAddProject() {
    setAddErr('')

    if (!newProj.name.trim() || !newProj.location.trim()) {
      setAddErr('Project name and location are required.')
      return
    }

    if (
      !newProj.total_units ||
      parseInt(newProj.total_units) < 1
    ) {
      setAddErr('Total units required.')
      return
    }

    if (!dev) return

    setAdding(true)

    try {
      const { error } = await sb
        .from('developer_projects')
        .insert({
          developer_id: dev.id,
          name: newProj.name.trim(),
          location: newProj.location.trim(),
          city: newProj.city,
          stage: newProj.stage,
          total_units: parseInt(newProj.total_units),
          handover_date: newProj.handover || null,
          completion_pct: newProj.completion
            ? parseInt(newProj.completion)
            : 0,
          active: true,
          created_at: new Date().toISOString(),
        })

      if (error) throw new Error(error.message)

      // ── Transaction prompt ─────────────────────

      setTxProjectName(newProj.name)
      setTxCity(newProj.city)
      setShowTxPrompt(true)

      // ── Reset form ─────────────────────────────

      setNewProj({
        name: '',
        location: '',
        city: 'Lagos',
        total_units: '',
        stage: 'Foundation',
        handover: '',
        completion: '',
      })

      setTab('projects')

      await loadData(user!.id)
    } catch (e: unknown) {
      setAddErr(
        e instanceof Error
          ? e.message
          : 'Failed to create project.',
      )
    } finally {
      setAdding(false)
    }
  }

  // ── Move lead ────────────────────────────────────────

  async function moveLead(
    leadId: string,
    newStage: string,
  ) {
    // Stage changes go through the server (authorised from database facts, stage rules
    // applied, audit row written). Direct table updates are blocked by a database trigger.
    const res = await authedFetch('/api/deal-room/stage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, to_stage: newStage }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      window.alert(j.error || 'That stage change could not be saved.')
      return
    }

    setLeads(prev =>
      prev.map(l =>
        l.id === leadId
          ? { ...l, stage: newStage }
          : l,
      ),
    )
  }

  // ── Sign out ─────────────────────────────────────────

  // ── Unit types — developers can now manage their own, not just view ──
  const [newUnit, setNewUnit] = useState({ unit_type: '', price_ngn: '', quantity: '', size_sqm: '' })

  async function addUnitType() {
    if (!activeProject) return
    if (!newUnit.unit_type.trim()) return

    const { error } = await sb.from('developer_unit_types').insert({
      project_id: activeProject.id,
      unit_type: newUnit.unit_type.trim(),
      price_ngn: newUnit.price_ngn ? parseFloat(newUnit.price_ngn) : null,
      quantity: newUnit.quantity ? parseInt(newUnit.quantity) : null,
      size_sqm: newUnit.size_sqm ? parseFloat(newUnit.size_sqm) : null,
    })

    if (error) return
    setNewUnit({ unit_type: '', price_ngn: '', quantity: '', size_sqm: '' })
    await loadData(user!.id)
  }

  async function updateUnitTypeField(unitId: string, field: 'price_ngn' | 'quantity' | 'size_sqm', value: string) {
    const parsed = value === '' ? null : (field === 'quantity' ? parseInt(value) : parseFloat(value))
    await sb.from('developer_unit_types').update({ [field]: parsed }).eq('id', unitId)
    setProjects(prev => prev.map(p => ({
      ...p,
      unit_types: p.unit_types?.map(u => u.id === unitId ? { ...u, [field]: parsed } : u),
    })))
  }

  async function deleteUnitType(unitId: string) {
    await sb.from('developer_unit_types').delete().eq('id', unitId)
    setProjects(prev => prev.map(p => ({
      ...p,
      unit_types: p.unit_types?.filter(u => u.id !== unitId),
    })))
  }

  // ── Construction updates — a real timeline, not just an overwritten
  // stage field. This is the developer's own reported history; it's
  // recorded as 'reported', not 'manop_confirmed' — matching the same
  // claims-vs-verified distinction used across the rest of the platform.
  async function handleSignOut() {
    await sb.auth.signOut()
    router.replace('/login')
  }

  // ── Styles ───────────────────────────────────────────

  const bg = dark ? '#0F172A' : '#F8FAFC'
  const bg2 = dark ? '#1E293B' : '#F1F5F9'
  const bg3 = dark ? '#162032' : '#FFFFFF'

  const text = dark ? '#F8FAFC' : '#0F172A'

  const text2 = dark
    ? 'rgba(248,250,252,0.65)'
    : 'rgba(15,23,42,0.65)'

  const text3 = dark
    ? 'rgba(248,250,252,0.35)'
    : 'rgba(15,23,42,0.35)'

  const border = dark
    ? 'rgba(248,250,252,0.08)'
    : 'rgba(15,23,42,0.08)'

  const STAG: React.CSSProperties = {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    marginBottom: 10,
  }

  const INP: React.CSSProperties = {
    background: dark
      ? 'rgba(255,255,255,0.05)'
      : 'rgba(0,0,0,0.04)',

    border: `1px solid ${border}`,
    borderRadius: 8,
    color: text,
    fontSize: '0.875rem',
    outline: 'none',
    padding: '0.65rem 0.875rem',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  }

  const CARD: React.CSSProperties = {
    background: bg3,
    border: `1px solid ${border}`,
    borderRadius: 12,
    padding: '1.25rem',
    marginBottom: 10,
  }

  // ── Stats ────────────────────────────────────────────

  const activeProject =
    projects.find(p => p.id === activeProjectId) ||
    projects[0] ||
    null

  const totalUnitsAll = projects.reduce(
    (s, p) => s + p.total_units,
    0,
  )

  const totalSold = projects.reduce(
    (s, p) =>
      s +
      (p.unit_types?.reduce(
        (a, u) => a + u.sold_count,
        0,
      ) || 0),
    0,
  )

  const activeLeads = leads.filter(
    l => !CLOSED_STAGES.includes(l.stage),
  ).length

  // Leads that came in through Get Financed choosing a Developer
  // Installment Plan, not a general "Enquire about this development"
  // submission — same table, same pipeline, just tagged at the source
  // so a developer can tell "this buyer wants to talk payment terms"
  // apart from a general enquiry without a second lead system.
  const financeLeads = leads.filter(
    l => l.source === 'manop_financing_developer_plan',
  )
  const isVerified = dev?.verified || false

  // ── Tabs ─────────────────────────────────────────────

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    {
      key: 'projects',
      label: `Projects (${projects.length})`,
    },
    { key: 'units', label: 'Unit tracker' },
    { key: 'construction', label: 'Construction' },
    { key: 'review', label: 'Review status' },
    { key: 'agreement', label: 'Agreement' },
    {
      key: 'pipeline',
      label: `Pipeline (${activeLeads})`,
    },
    {
      key: 'finance',
      label: `Finance (${financeLeads.length})`,
    },
    { key: 'addproject', label: '+ New project' },
  ]

  // Site Intelligence lives on its own domain — same pattern already
  // used on the investor and agency dashboards (external nav links,
  // not an embedded reimplementation of a page that already exists).
  // This was the one dashboard missing it entirely.
  const EXTERNAL_NAV: { href: string; label: string }[] = [
    { href: '/site-intelligence',        label: 'Site Intelligence' },
    { href: '/site-intelligence/submit', label: 'Submit a Site' },
  ]

  // ── Loading ──────────────────────────────────────────

  if (checking || (user && !dev && loading)) {
    return (
      <div
        style={{
          background: bg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: text,
        }}
      >
        Loading developer dashboard…
      </div>
    )
  }

  if (user && !dev) {
    return (
      <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
        <div style={{ maxWidth: 440, textAlign: 'center' as const }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.75rem' }}>Setup not complete</h2>
          <p style={{ fontSize: '0.85rem', color: text2, marginBottom: '1.5rem', lineHeight: 1.65 }}>Your developer profile isn&apos;t set up yet.</p>
          <Link href="/developer/onboard" style={{ background: '#5B2EFF', color: '#fff', borderRadius: 8, padding: '0.65rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>
            Complete setup →
          </Link>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div
      style={{
        background: bg,
        minHeight: '100vh',
        color: text,
      }}
    >
      {/* Header */}

      <div
        style={{
          background: bg2,
          borderBottom: `1px solid ${border}`,
          padding: '0.875rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Link
            href="/"
            style={{ textDecoration: 'none' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <ManopLogoSVG height={80} dark={dark} showText={false} />

              <span
                style={{
                  fontSize: '0.72rem',
                  color: text2,
                  fontWeight: 600,
                }}
              >
                Developer Dashboard
              </span>
            </div>
          </Link>

          <div>
            <div
              style={{
                fontWeight: 700,
                color: text,
                fontSize: 14,
              }}
            >
              {dev?.company_name}
            </div>

            <div
              style={{
                fontSize: 11,
                color: text3,
              }}
            >
              Developer · {dev?.cities?.join(', ')}
            </div>
          </div>

          {dev?.verified && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#22C55E',
                background:
                  'rgba(34,197,94,0.1)',
                border:
                  '1px solid rgba(34,197,94,0.25)',
                borderRadius: 20,
                padding: '2px 8px',
              }}
            >
              ● Verified
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Link
            href="/developments"
            style={{
              fontSize: 12,
              color: text3,
              textDecoration: 'none',
              padding: '0.4rem 0.75rem',
              borderRadius: 7,
              border: `1px solid ${border}`,
            }}
          >
            View site
          </Link>

          <button
            onClick={handleSignOut}
            style={{
              fontSize: 12,
              color: text3,
              background: 'transparent',
              border: `1px solid ${border}`,
              borderRadius: 7,
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}

      <div
        style={{
          background: bg2,
          borderBottom: `1px solid ${border}`,
          padding: '0 1.5rem',
          display: 'flex',
          overflowX: 'auto',
        }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '0.75rem 1rem',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${
                tab === t.key
                  ? '#F59E0B'
                  : 'transparent'
              }`,
              color:
                tab === t.key ? text : text3,
              fontSize: '0.8rem',
              fontWeight:
                tab === t.key ? 700 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: border, margin: '0 6px', flexShrink: 0 }} />
        {EXTERNAL_NAV.map(n => (
          <Link
            key={n.href}
            href={n.href}
            target="_blank"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '0.75rem 1rem', color: text3, fontSize: '0.8rem',
              textDecoration: 'none', whiteSpace: 'nowrap', fontFamily: 'inherit',
            }}
          >
            {n.label} <ExternalLink size={12} />
          </Link>
        ))}
      </div>

      {/* Body */}

      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '1.5rem',
        }}
      >
        {/* OVERVIEW */}

        {tab === 'overview' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10,
                marginBottom: '1.5rem',
              }}
            >
              {[
                { label: 'Projects', value: String(projects.length) },
                { label: 'Total units', value: String(totalUnitsAll) },
                { label: 'Units sold', value: String(totalSold) },
                { label: 'Active leads', value: String(activeLeads) },
              ].map(s => (
                <div key={s.label} style={CARD}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: text }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: text3, marginTop: 4 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div style={STAG}>Your projects</div>

            {projects.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '0.9rem', color: text2, marginBottom: 12 }}>
                  No projects yet.
                </div>
                <button
                  onClick={() => setTab('addproject')}
                  style={{
                    background: '#F59E0B',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.6rem 1.25rem',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  + Create your first project
                </button>
              </div>
            )}

            {projects.map(p => (
              <div key={p.id} style={CARD}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: text, fontSize: '0.92rem' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: text3, marginTop: 2 }}>
                      {p.location} · {p.city}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: '#F59E0B',
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      borderRadius: 20,
                      padding: '2px 10px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.stage}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: '0.75rem', color: text2 }}>
                  {p.total_units} units · {p.completion_pct ?? 0}% complete
                  {p.handover_date ? ` · Handover ${p.handover_date}` : ''}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 6,
                    borderRadius: 4,
                    background: border,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, p.completion_pct ?? 0)}%`,
                      height: '100%',
                      background: '#F59E0B',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PROJECTS */}

        {tab === 'projects' && (
          <div>
            <div style={STAG}>Projects ({projects.length})</div>

            {projects.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', color: text2 }}>
                No projects yet. Use{' '}
                <button
                  onClick={() => setTab('addproject')}
                  style={{ background: 'none', border: 'none', color: '#F59E0B', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0 }}
                >
                  + New project
                </button>{' '}
                to add your first one.
              </div>
            )}

            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => {
                  setActiveProjectId(p.id)
                  setTab('units')
                }}
                style={{ ...CARD, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: text, fontSize: '0.92rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: text3, marginTop: 2 }}>{p.location} · {p.city}</div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: text2 }}>
                    {p.unit_types?.length || 0} unit type{(p.unit_types?.length || 0) === 1 ? '' : 's'} →
                  </div>
                </div>
                <div onClick={ev => ev.stopPropagation()}>
                  <details style={{ marginTop: 6 }}><summary style={{ fontSize: 11, cursor: 'pointer', color: text3 }}>Where this stands</summary>
                    <DevelopmentProgress projectId={p.id} dark={dark} onRequestAgreement={id => { setAgreementFor(id); setTab('agreement') }} onOpenAgreement={rid => { setAgreementOpen(rid); setTab('agreement') }} />
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* UNIT TRACKER */}

        {tab === 'units' && (
          <div>
            <div style={STAG}>Unit tracker</div>

            {projects.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', color: text2 }}>
                Add a project first to track units.
              </div>
            )}

            {projects.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProjectId(p.id)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: activeProjectId === p.id ? '#0F172A' : text2,
                      background: activeProjectId === p.id ? '#F59E0B' : 'transparent',
                      border: `1px solid ${activeProjectId === p.id ? '#F59E0B' : border}`,
                      borderRadius: 20,
                      padding: '0.4rem 0.9rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {activeProject && (!activeProject.unit_types || activeProject.unit_types.length === 0) && (
              <div style={{ ...CARD, textAlign: 'center', padding: '1.5rem 1rem', fontSize: '0.85rem', color: text2 }}>
                No unit types recorded for {activeProject.name} yet — add your first one below.
              </div>
            )}

            {activeProject?.unit_types?.map(u => {
              const soldPct = pct(u.sold_count, u.quantity || 0)
              const reservedPct = pct(u.reserved_count, u.quantity || 0)
              return (
                <div key={u.id} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, color: text, fontSize: '0.88rem' }}>{u.unit_type}</div>
                    <button onClick={() => deleteUnitType(u.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 15 }}>×</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: text3, marginBottom: 3 }}>Price (₦)</div>
                      <input
                        style={{ ...INP, padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}
                        type="number"
                        defaultValue={u.price_ngn ?? ''}
                        placeholder="Not set"
                        onBlur={e => updateUnitTypeField(u.id, 'price_ngn', e.target.value)}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: text3, marginBottom: 3 }}>Total units</div>
                      <input
                        style={{ ...INP, padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}
                        type="number"
                        defaultValue={u.quantity ?? ''}
                        placeholder="Not set"
                        onBlur={e => updateUnitTypeField(u.id, 'quantity', e.target.value)}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: text3, marginBottom: 3 }}>Size (sq.m)</div>
                      <input
                        style={{ ...INP, padding: '0.4rem 0.5rem', fontSize: '0.78rem' }}
                        type="number"
                        defaultValue={u.size_sqm ?? ''}
                        placeholder="Not set"
                        onBlur={e => updateUnitTypeField(u.id, 'size_sqm', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: text2, marginBottom: 6 }}>
                    {u.sold_count} sold · {u.reserved_count} reserved{u.quantity ? ` / ${u.quantity}` : ''}
                  </div>
                  {u.quantity ? (
                    <div style={{ height: 6, borderRadius: 4, background: border, overflow: 'hidden', display: 'flex' }}>
                      <div style={{ width: `${soldPct}%`, height: '100%', background: '#22C55E' }} />
                      <div style={{ width: `${reservedPct}%`, height: '100%', background: '#F59E0B' }} />
                    </div>
                  ) : null}
                </div>
              )
            })}

            {activeProject && (
              <div style={{ ...CARD, background: 'transparent', border: `1px dashed ${border}` }}>
                <div style={{ fontSize: '0.7rem', color: text3, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Add a unit type
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input style={{ ...INP, padding: '0.5rem' }} placeholder="e.g. 2 Bedroom" value={newUnit.unit_type} onChange={e => setNewUnit({ ...newUnit, unit_type: e.target.value })} />
                  <input style={{ ...INP, padding: '0.5rem' }} type="number" placeholder="Price (₦)" value={newUnit.price_ngn} onChange={e => setNewUnit({ ...newUnit, price_ngn: e.target.value })} />
                  <input style={{ ...INP, padding: '0.5rem' }} type="number" placeholder="Qty" value={newUnit.quantity} onChange={e => setNewUnit({ ...newUnit, quantity: e.target.value })} />
                  <input style={{ ...INP, padding: '0.5rem' }} type="number" placeholder="Size (sq.m)" value={newUnit.size_sqm} onChange={e => setNewUnit({ ...newUnit, size_sqm: e.target.value })} />
                </div>
                <button
                  onClick={addUnitType}
                  style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  + Add unit type
                </button>
                <div style={{ fontSize: '0.68rem', color: text3, marginTop: 6 }}>
                  Price and size can be left blank if not decided yet — you can fill them in once pricing is confirmed.
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONSTRUCTION */}

        {tab === 'construction' && (
          <div>
            <div style={STAG}>Construction updates</div>

            {!activeProject && (
              <div style={{ ...CARD, textAlign: 'center', padding: '1.5rem 1rem', fontSize: '0.85rem', color: text2 }}>
                Add a project first.
              </div>
            )}

            {activeProject && (
              <>
                {projects.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setActiveProjectId(p.id)}
                        style={{
                          fontSize: '0.75rem', fontWeight: 600,
                          color: activeProjectId === p.id ? '#0F172A' : text2,
                          background: activeProjectId === p.id ? '#F59E0B' : 'transparent',
                          border: `1px solid ${activeProjectId === p.id ? '#F59E0B' : border}`,
                          borderRadius: 20, padding: '0.4rem 0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <DevelopmentCompleteness projectId={activeProject.id} dark={dark} tier="submitter"
                    reloadToken={`${(activeProject.unit_types || []).length}-${activeProject.name}`} />
                </div>
                <DevelopmentUpdates
                  key={activeProject.id}
                  projectId={activeProject.id}
                  projectName={activeProject.name}
                  neighborhood={activeProject.neighborhood}
                  city={activeProject.city}
                  countryCode={activeProject.country_code}
                  role="developer"
                  dark={dark}
                  units={(activeProject.unit_types || []).map(u => ({ id: u.id, unit_type: u.unit_type, price_ngn: u.price_ngn, available_count: u.available_count ?? null }))}
                  onSaved={() => { if (user) loadData(user.id) }}
                />
              </>
            )}
          </div>
        )}

        {tab === 'agreement' && <AgreementRequestPanel role="developer" dark={dark} startForProject={agreementFor} openRequestId={agreementOpen} onHandled={() => { setAgreementFor(null); setAgreementOpen(null) }} />}
        {tab === 'agreement' && <PartnerFeesPanel dark={dark} />}

        {/* REVIEW STATUS */}

        {tab === 'review' && (
          <div>
            <div style={STAG}>Review status</div>
            <div style={{ fontSize: '0.78rem', color: text2, marginBottom: 14, lineHeight: 1.6 }}>
              What you've submitted, and where each one stands with MANOP. This is separate from the Projects tab
              so you can check status without editing anything.
            </div>

            {projects.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', color: text2 }}>
                Nothing submitted yet.
              </div>
            )}

            {projects.map(p => {
              const statusColor =
                p.publish_status === 'published' ? '#22C55E' :
                p.publish_status === 'rejected' ? '#EF4444' :
                p.publish_status === 'pending_review' ? '#F59E0B' : text3
              const statusLabel =
                p.publish_status === 'published' ? 'Published — live on MANOP' :
                p.publish_status === 'rejected' ? 'Not approved' :
                p.publish_status === 'pending_review' ? 'Pending MANOP review' : 'Draft — not yet submitted'
              return (
                <div key={p.id} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: text, fontSize: '0.9rem' }}>{p.name}</div>
                      <div style={{ fontSize: '0.72rem', color: text3, marginTop: 2 }}>{p.location} · {p.city}</div>
                    </div>
                    <div style={{
                      fontSize: '0.66rem', fontWeight: 700, color: statusColor,
                      background: `${statusColor}22`, borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
                    }}>
                      {statusLabel}
                    </div>
                  </div>
                  {p.reviewed_at && (
                    <div style={{ fontSize: '0.72rem', color: text3, marginTop: 8 }}>
                      Reviewed {new Date(p.reviewed_at).toLocaleDateString()}
                    </div>
                  )}
                  {p.manop_checked_note && (
                    <div style={{ fontSize: '0.75rem', color: text2, marginTop: 6, paddingTop: 8, borderTop: `1px solid ${border}` }}>
                      <strong style={{ color: text }}>MANOP note:</strong> {p.manop_checked_note}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* PIPELINE */}

        {tab === 'pipeline' && (
          <div>
            <div style={STAG}>Pipeline ({activeLeads} active)</div>

            {leads.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', color: text2 }}>
                No leads yet.
              </div>
            )}

            {leads.map(l => (
              <div key={l.id} style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: text, fontSize: '0.88rem' }}>{l.name}</div>
                    <div style={{ fontSize: '0.75rem', color: text3, marginTop: 2 }}>
                      {l.phone || 'No phone'}
                    </div>
                    <UnitRequestSummary lead={l as any} dark={dark} compact />
                    {l.note && (
                      <div style={{ fontSize: '0.75rem', color: text2, marginTop: 4 }}>{l.note}</div>
                    )}
                  </div>
                  <select
                    value={l.stage}
                    onChange={e => moveLead(l.id, e.target.value)}
                    style={{
                      ...INP,
                      width: 'auto',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    {LEAD_STAGES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setDealRoomLead(dealRoomLead === l.id ? null : l.id)}
                  style={{ ...INP, width: 'auto', marginTop: 10, padding: '0.35rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  {dealRoomLead === l.id ? 'Hide deal room' : 'Open deal room'}
                </button>
                {dealRoomLead === l.id && (
                  <div style={{ marginTop: 10 }}><DealRoomPanel leadId={l.id} dark={dark} /></div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* FINANCE — buyers who chose Developer Installment Plan in Get
             Financed, on any of this developer's projects. Reuses the
             same developer_leads pipeline and moveLead() as Pipeline —
             this is a filtered view, not a second lead system. */}
        {tab === 'finance' && (
          <div>
            <div style={STAG}>Finance ({financeLeads.length})</div>
            <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.6, marginBottom: 14, maxWidth: 640 }}>
              Buyers who asked about a developer installment plan when getting financed on one of your
              listings, rather than a bank mortgage. MANOP doesn't structure the plan — that conversation
              is between you and the buyer.
            </div>

            {financeLeads.length === 0 && (
              <div style={{ ...CARD, textAlign: 'center', padding: '2rem 1rem', fontSize: '0.85rem', color: text2 }}>
                No installment-plan enquiries yet.
              </div>
            )}

            {financeLeads.map(l => {
              const projectName = projects.find(p => p.id === l.project_id)?.name
              return (
                <div key={l.id} style={CARD}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: text, fontSize: '0.88rem' }}>{l.name}</div>
                      <div style={{ fontSize: '0.75rem', color: text3, marginTop: 2 }}>
                        {l.phone || 'No phone'}{projectName ? ` · ${projectName}` : ''}
                        {l.budget_usd ? ` · ~$${l.budget_usd.toLocaleString()} budget` : ''}
                      </div>
                      {l.note && (
                        <div style={{ fontSize: '0.75rem', color: text2, marginTop: 4 }}>{l.note}</div>
                      )}
                    </div>
                    <select
                      value={l.stage}
                      onChange={e => moveLead(l.id, e.target.value)}
                      style={{ ...INP, width: 'auto', padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    >
                      {LEAD_STAGES.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}

            <div style={{ ...CARD, marginTop: 18 }}>
              <div style={{ fontWeight: 700, color: text, fontSize: '0.85rem', marginBottom: 4 }}>Investment Intelligence</div>
              <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.6, marginBottom: 10 }}>
                See the yield, debt cover and cashflow picture for one of your units the way an investor
                buyer would — useful before a call where they'll ask exactly that.
              </div>
              <Link href="/calculator" target="_blank" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: '0.8rem', fontWeight: 700, color: '#5B2EFF', textDecoration: 'none',
              }}>
                Open Investment Intelligence <ExternalLink size={12} />
              </Link>
            </div>

            {/* PHASE 6: this is the developer's OWN saved analyses — e.g.
                an Investment Intelligence run they did on their own unit
                — distinct from financeLeads above, which are inbound
                buyer enquiries, not something this developer produced. */}
            {user && (
              <div style={{ marginTop: 18 }}>
                <div style={STAG}>My Finance</div>
                <MyFinancePanel userId={user.id} dark={dark} />
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}

        {tab === 'settings' && dev && (
          <div style={{ maxWidth: 560 }}>
            <div style={STAG}>Company profile</div>

            <div style={CARD}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: text3, marginBottom: 2 }}>Company name</div>
                  <div style={{ fontSize: '0.88rem', color: text, fontWeight: 600 }}>{dev.company_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: text3, marginBottom: 2 }}>Contact</div>
                  <div style={{ fontSize: '0.88rem', color: text }}>{dev.contact_name} · {dev.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: text3, marginBottom: 2 }}>Cities</div>
                  <div style={{ fontSize: '0.88rem', color: text }}>{dev.cities?.join(', ') || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: text3, marginBottom: 2 }}>Verification</div>
                  <div style={{ fontSize: '0.88rem', color: isVerified ? '#22C55E' : text2 }}>
                    {isVerified ? '● Verified' : 'Not verified'}
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/developer/onboard"
              style={{
                display: 'inline-block',
                marginTop: 12,
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#F59E0B',
                textDecoration: 'none',
              }}
            >
              Edit company profile →
            </Link>
          </div>
        )}

        {/* ADD PROJECT */}

        {tab === 'addproject' && (
          <div style={{ maxWidth: 560 }}>
            <div style={STAG}>New project</div>

            <div
                style={{
                  background: bg3,
                  border: `1px solid ${border}`,
                  borderRadius: 12,
                  padding: '1.5rem',
                }}
              >
                {/* FORM CONTENT */}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      gridColumn: '1/-1',
                    }}
                  >
                    <label
                      style={{
                        fontSize: 12,
                        color: text2,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      Project name *
                    </label>

                    <input
                      style={INP}
                      value={newProj.name}
                      onChange={e =>
                        setNewProj(p => ({
                          ...p,
                          name: e.target.value,
                        }))
                      }
                      placeholder="e.g. The Lekki Waterfront"
                    />
                  </div>
                </div>

                {addErr && (
                  <div
                    style={{
                      background:
                        'rgba(239,68,68,0.1)',
                      border:
                        '1px solid rgba(239,68,68,0.25)',
                      borderRadius: 8,
                      padding: '0.65rem',
                      fontSize: 13,
                      color: '#EF4444',
                      marginBottom: 10,
                    }}
                  >
                    {addErr}
                  </div>
                )}

                <button
                  onClick={handleAddProject}
                  disabled={adding}
                  style={{
                    width: '100%',
                    background: '#F59E0B',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 9,
                    padding: '0.8rem',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: adding ? 0.7 : 1,
                  }}
                >
                  {adding
                    ? 'Creating…'
                    : 'Create project →'}
                </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Modal */}

      {showTxPrompt && dev && (
        <TransactionPromptModal
          partnerId={dev.id}
          neighborhood={txProjectName}
          city={txCity}
          dark={dark}
          onClose={() =>
            setShowTxPrompt(false)
          }
        />
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg) }
        }
      `}</style>
    </div>
  )
}
