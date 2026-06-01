'use client'

// app/developer/dashboard/page.tsx
// AUTH + PROJECT CAP + TRANSACTION MODAL PATCHED

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

import { ManopLogoSVG } from '../../../components/ManopLogo'
import TransactionPromptModal from '../../../components/TransactionPromptModal'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────

interface DevAccount {
  id: string
  company_name: string
  contact_name: string
  email: string
  cities: string[]
  verified: boolean
  mape_score: number | null
}

interface Project {
  id: string
  name: string
  location: string
  city: string
  stage: string
  total_units: number
  handover_date: string | null
  completion_pct: number | null
  unit_types?: UnitType[]
}

interface UnitType {
  id: string
  unit_type: string
  price_ngn: number
  quantity: number
  sold_count: number
  reserved_count: number
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
}

type Tab =
  | 'overview'
  | 'projects'
  | 'units'
  | 'pipeline'
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

  const [dark, setDark] = useState(true)

  const [dev, setDev] = useState<DevAccount | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [leads, setLeads] = useState<Lead[]>([])

  const [tab, setTab] = useState<Tab>('overview')

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
    setDark(getInitialDark())
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
            'id,company_name,contact_name,email,cities,verified,mape_score',
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
    await sb
      .from('developer_leads')
      .update({
        stage: newStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    setLeads(prev =>
      prev.map(l =>
        l.id === leadId
          ? { ...l, stage: newStage }
          : l,
      ),
    )
  }

  // ── Sign out ─────────────────────────────────────────

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
    l => l.stage !== 'sold',
  ).length

  // ── Project cap ──────────────────────────────────────

  const isVerified = dev?.verified || false
  const atProjectCap =
    !isVerified && projects.length >= 1

  // ── Tabs ─────────────────────────────────────────────

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    {
      key: 'projects',
      label: `Projects (${projects.length})`,
    },
    { key: 'units', label: 'Unit tracker' },
    {
      key: 'pipeline',
      label: `Pipeline (${activeLeads})`,
    },
    { key: 'addproject', label: '+ New project' },
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
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            border:
              '3px solid rgba(245,158,11,0.2)',
            borderTopColor: '#F59E0B',
            borderRadius: '50%',
            animation: 'spin 0.75s linear infinite',
          }}
        />

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg) }
          }
        `}</style>
      </div>
    )
  }

  // ── Missing setup ────────────────────────────────────

  if (user && !dev) {
    return (
      <div
        style={{
          background: bg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          color: text,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: '1.2rem',
              fontWeight: 800,
              marginBottom: '0.75rem',
            }}
          >
            Setup not complete
          </h2>

          <Link
            href="/developer/onboard"
            style={{
              background: '#F59E0B',
              color: '#fff',
              borderRadius: 8,
              padding: '0.65rem 1.5rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
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
            href="/search"
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
      </div>

      {/* Body */}

      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '1.5rem',
        }}
      >
        {/* ADD PROJECT */}

        {tab === 'addproject' && (
          <div style={{ maxWidth: 560 }}>
            <div style={STAG}>New project</div>

            {atProjectCap && (
              <div
                style={{
                  background:
                    'rgba(245,158,11,0.07)',
                  border:
                    '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 12,
                  padding: '1.25rem 1.5rem',
                  marginBottom: '1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#F59E0B',
                    marginBottom: '0.5rem',
                  }}
                >
                  Project limit reached
                </div>

                <div
                  style={{
                    fontSize: '0.8rem',
                    color: text2,
                    lineHeight: 1.65,
                    marginBottom: '0.875rem',
                  }}
                >
                  Unverified developers can
                  list{' '}
                  <strong
                    style={{ color: text }}
                  >
                    1 active project
                  </strong>
                  . Verify your company identity
                  to list multiple projects and
                  build your MAPE score.
                </div>

                <button
                  onClick={() =>
                    setTab('settings')
                  }
                  style={{
                    background: '#F59E0B',
                    color: '#0F172A',
                    border: 'none',
                    borderRadius: 8,
                    padding: '0.55rem 1.25rem',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Verify company →
                </button>
              </div>
            )}

            {!atProjectCap && (
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
            )}
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