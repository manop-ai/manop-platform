'use client'
// app/investor/dashboard/page.tsx — THE canonical investor dashboard.
//
// REBUILT to match the agency dashboard's actual style: raw, dense
// markup with real lists and real forms — not the abstracted Blocks/
// IntelligenceShell system from the previous version, which compressed
// everything into little summary cards and lost the density a real
// working dashboard needs. "Own world" means the real platform shown
// in-frame wherever that's achievable — not a stylized shell around it.
// Where a tab genuinely can't be embedded (the Deal Analyzer, its own
// tool), a visible "Open ↗" link is the honest answer, not a fake
// embedded version.
//
// Data logic carried over unchanged from the previous version — it was
// already correct:
//   - investor_profiles.user_id is a FK to user_profiles(id), NOT to
//     auth.users(id) directly. user_profiles has its own generated id
//     plus a separate auth_user_id column. Every investor_profiles
//     lookup resolves user_profiles.id first via auth_user_id.
//   - manop_recommendation is gone everywhere — MANOP does not issue
//     recommendations. A development is either MANOP Review'd or not,
//     shown as one flat tag sourced from reviewed_at.
//   - Loading state is ManopLoader (logo + rolling circle).
//
// DB tables: investor_watchlist, investor_alerts, investor_profiles,
// user_profiles, developer_projects, properties, neighborhood_intelligence.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase as sb } from '../../../lib/supabase'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import { ManopLogoSVG } from '../../../components/ManopLogo'
import ManopLoader from '../../../components/ManopLoader'
import MediaLightbox, { MediaItem } from '../../../components/MediaLightbox'
import {
  Search, Building2, Bell, ExternalLink,
  Plus, Trash2, CheckCircle2,
} from 'lucide-react'

type Tab = 'overview' | 'properties' | 'developments' | 'alerts' | 'profile'

interface InvestorProfile {
  budget_min: number | null; budget_max: number | null
  preferred_markets: string[] | null; investment_goals: string[] | null
  is_diaspora: boolean | null; country_of_residence: string | null
  preferred_currency: string | null
}
interface Alert {
  id: string; alert_type: string; neighborhood: string | null; city: string | null
  max_price_ngn: number | null; active: boolean; last_triggered: string | null; created_at: string
}

const GOAL_LABELS: Record<string, string> = {
  capital_growth: 'Capital Growth', rental_income: 'Rental Income',
  own_use: 'Own Use', mixed: 'Mixed Strategy',
}

function fmtNGN(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1000)}K`
}
function fmtDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export default function InvestorDashboard() {
  const { user, checking } = useAuth('investor')
  const router = useRouter()
  const [dark, setDark]       = useState(getInitialDark)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<Tab>('overview')

  const [userName, setUserName]         = useState('')
  const [profile, setProfile]           = useState<InvestorProfile | null>(null)
  const [savedProperties, setSavedProperties] = useState<any[]>([])
  const [savedDevelopments, setSavedDevelopments] = useState<any[]>([])
  const [alerts, setAlerts]             = useState<Alert[]>([])

  useEffect(() => { return listenTheme(setDark) }, [])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setUserName(user.email?.split('@')[0] || 'Investor')

    // user_profiles.id is a separate, table-owned id — NOT the auth id.
    // Every lookup that joins through user_profiles needs THIS id.
    const { data: up } = await sb.from('user_profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
    const upId = up?.id || null

    const [{ data: ip }, { data: props }, { data: devs }, { data: al }] = await Promise.all([
      upId ? sb.from('investor_profiles').select('*').eq('user_id', upId).maybeSingle() : Promise.resolve({ data: null }),
      sb.from('investor_watchlist')
        .select('id, properties(id, neighborhood, city, bedrooms, price_local, property_type)')
        .eq('user_id', user.id).not('property_id', 'is', null).limit(12),
      sb.from('investor_watchlist')
        .select('id, developer_projects(id, name, neighborhood, city, reviewed_at, images)')
        .eq('user_id', user.id).not('project_id', 'is', null).limit(12),
      sb.from('investor_alerts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    setProfile(ip || null)
    setSavedProperties(props || [])
    setSavedDevelopments(devs || [])
    setAlerts(al || [])
    setLoading(false)
  }, [user])

  useEffect(() => { if (user) loadAll() }, [user, loadAll])

  async function signOut() { await sb.auth.signOut(); router.push('/login') }

  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const bg2    = dark ? '#111827' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3  = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.58)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.16)'
  const cardShadow = dark ? 'none' : '0 1px 2px rgba(15,23,42,0.08)'
  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.85rem', outline: 'none', padding: '0.65rem 0.875rem',
    fontFamily: 'inherit', width: '100%',
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'properties',   label: `Properties (${savedProperties.length})` },
    { key: 'developments', label: `Developments (${savedDevelopments.length})` },
    { key: 'alerts',       label: `Alerts (${alerts.length})` },
    { key: 'profile',      label: 'Profile' },
  ]

  const EXTERNAL_NAV: { href: string; label: string }[] = [
    { href: '/calculator', label: 'Investment Intelligence' },
    { href: '/site-intelligence', label: 'Site Intelligence' },
  ]

  if (checking || (user && loading)) return <ManopLoader dark={dark} label="Loading your dashboard…" />

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* ── Top bar ── */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
            <ManopLogoSVG height={80} dark={dark} showText={false} />
          </Link>
          <div style={{ width: 1, height: 20, background: border }} />
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{userName}</div>
            <div style={{ fontSize: 11, color: text3 }}>{profile?.is_diaspora ? `Diaspora investor${profile.country_of_residence ? ' · ' + profile.country_of_residence : ''}` : 'Investor'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/developments" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View public site</Link>
          <button onClick={signOut} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const, alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#5B2EFF' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: border, margin: '0 6px', flexShrink: 0 }} />
        {EXTERNAL_NAV.map(n => (
          <Link key={n.href} href={n.href} target="_blank"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.75rem 1rem', color: text3, fontSize: '0.8rem', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
            {n.label} <ExternalLink size={12} />
          </Link>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              {[
                { label: 'Saved properties',   value: savedProperties.length,   color: '#7C5FFF' },
                { label: 'Saved developments', value: savedDevelopments.length, color: '#0D9488' },
                { label: 'Active alerts',      value: alerts.filter(a => a.active).length, color: '#5B2EFF' },
              ].map(s => (
                <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Recent developments</div>
            {savedDevelopments.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 16 }}>
                <Building2 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div style={{ fontSize: 13, marginBottom: 10 }}>Nothing saved yet.</div>
                <button onClick={() => setTab('developments')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Browse reviewed developments →
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {savedDevelopments.slice(0, 5).map(item => {
                  const d = Array.isArray(item.developer_projects) ? item.developer_projects[0] : item.developer_projects
                  if (!d) return null
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6, boxShadow: cardShadow }}>
                      <div style={{ width: 56, height: 44, borderRadius: 6, flexShrink: 0, background: d.images?.[0] ? `url(${d.images[0]}) center/cover` : bg2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                        <div style={{ fontSize: 11.5, color: text3 }}>{d.neighborhood}, {d.city}</div>
                      </div>
                      {d.reviewed_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
                          <CheckCircle2 size={11} /> MANOP Review
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Recent properties</div>
            {savedProperties.length === 0 ? (
              <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '1.5rem' }}>No properties saved yet.</div>
            ) : (
              savedProperties.slice(0, 5).map(item => {
                const p = Array.isArray(item.properties) ? item.properties[0] : item.properties
                if (!p) return null
                return (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6, boxShadow: cardShadow }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' as const }}>{p.property_type} · {p.bedrooms} bed</div>
                      <div style={{ fontSize: 11, color: text3 }}>{p.neighborhood}, {p.city}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.price_local ? fmtNGN(p.price_local) : '—'}</div>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ── Properties — real search, real results ── */}
        {tab === 'properties' && <PropertiesTab dark={dark} bg2={bg2} bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} INP={INP} />}

        {/* ── Developments — real search, real detail view ── */}
        {tab === 'developments' && <DevelopmentsTab dark={dark} bg2={bg2} bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} INP={INP} />}

        {/* ── Alerts ── */}
        {tab === 'alerts' && <AlertsTab dark={dark} bg2={bg2} bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} INP={INP} alerts={alerts} setAlerts={setAlerts} />}

        {/* ── Profile ── */}
        {tab === 'profile' && <ProfileTab bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} profile={profile} />}

      </div>
    </div>
  )
}

// ── Properties tab ──────────────────────────────────────────────
function PropertiesTab({ dark, bg2, bg3, border, text, text2, text3, cardShadow, INP }: any) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    const { data } = await sb.from('properties').select('*')
      .or(`neighborhood.ilike.%${query}%,city.ilike.%${query}%`).limit(24)
    setResults(data || [])
  }

  return (
    <>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Search properties</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input style={INP} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="e.g. Lekki Phase 1, Ikoyi, East Legon…" />
        <button onClick={handleSearch} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0 1.5rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} /> Search
        </button>
      </div>

      {results === null && <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '2rem 0' }}>Search an area above to see properties there.</div>}
      {results !== null && results.length === 0 && <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '2rem 0' }}>No properties in that area yet.</div>}
      {results !== null && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {results.map(p => (
            <div key={p.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
              <div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' as const }}>{p.property_type} · {p.bedrooms} bed</div>
              <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>{p.neighborhood}, {p.city}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{p.price_local ? fmtNGN(p.price_local) : '—'}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Developments tab — search, then a real profile with the MANOP
// Review tag (never a recommendation) ──────────────────────────
function DevelopmentsTab({ dark, bg2, bg3, border, text, text2, text3, cardShadow, INP }: any) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [selected, setSelected] = useState<any | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    const { data } = await sb.from('developer_projects')
      .select('*, developer_accounts(company_name)')
      .eq('publish_status', 'published')
      .or(`neighborhood.ilike.%${query}%,city.ilike.%${query}%`)
    setResults(data || [])
  }

  if (selected) {
    const media: MediaItem[] = [
      ...(selected.images || []).map((url: string) => ({ url, type: 'image' as const })),
      ...(selected.video_urls || []).map((url: string) => ({ url, type: 'video' as const })),
    ]
    return (
      <>
        <button onClick={() => setSelected(null)} style={{ fontSize: 13, color: '#5B2EFF', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: 12, fontWeight: 700 }}>← Back to results</button>
        <MediaLightbox dark={dark} media={media} alt={selected.name} height={340} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{selected.name}</h2>
            <div style={{ fontSize: 13, color: text3 }}>{selected.developer_accounts?.company_name} · {selected.neighborhood}, {selected.city}</div>
          </div>
          {selected.reviewed_at && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '4px 10px' }}>
              <CheckCircle2 size={12} /> MANOP Review
            </span>
          )}
        </div>
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', boxShadow: cardShadow }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 10 }}>MANOP Review</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}><strong>What we checked:</strong> {selected.manop_checked_note || 'Not yet documented.'}</div>
          <div style={{ fontSize: 13 }}><strong>Identified considerations:</strong> {selected.manop_flag_note || 'No specific considerations recorded.'}</div>
        </div>
      </>
    )
  }

  return (
    <>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Search reviewed developments</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input style={INP} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="e.g. Lekki Phase 1, Ikoyi, East Legon…" />
        <button onClick={handleSearch} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0 1.5rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} /> Search
        </button>
      </div>

      {results === null && <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '2rem 0' }}>Search an area above to see reviewed developments there.</div>}
      {results !== null && results.length === 0 && <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '2rem 0' }}>No reviewed developments in that area yet.</div>}
      {results !== null && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {results.map(d => (
            <div key={d.id} onClick={() => setSelected(d)} style={{ cursor: 'pointer', background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
              <div style={{ height: 120, borderRadius: 8, background: d.images?.[0] ? `url(${d.images[0]}) center/cover` : bg2, marginBottom: 10 }} />
              {d.reviewed_at && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '3px 8px', marginBottom: 8 }}>
                  <CheckCircle2 size={10} /> MANOP Review
                </span>
              )}
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.name}</div>
              <div style={{ fontSize: 12, color: text3 }}>{d.neighborhood}, {d.city}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Alerts tab ──────────────────────────────────────────────────
function AlertsTab({ dark, bg2, bg3, border, text, text2, text3, cardShadow, INP, alerts, setAlerts }: any) {
  const [newAlert, setNewAlert] = useState({ neighborhood: '', city: '', alert_type: 'new_listing', max_price_ngn: '' })
  const [adding, setAdding] = useState(false)

  async function addAlert() {
    if (!newAlert.neighborhood) return
    setAdding(true)
    const { data: { session } } = await sb.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setAdding(false); return }

    const { data, error } = await sb.from('investor_alerts').insert({
      user_id: uid, alert_type: newAlert.alert_type, neighborhood: newAlert.neighborhood,
      city: newAlert.city || null,
      max_price_ngn: newAlert.max_price_ngn ? parseFloat(newAlert.max_price_ngn) : null,
      active: true,
    }).select().maybeSingle()

    if (!error && data) setAlerts((a: Alert[]) => [data as Alert, ...a])
    setNewAlert({ neighborhood: '', city: '', alert_type: 'new_listing', max_price_ngn: '' })
    setAdding(false)
  }

  async function removeAlert(id: string) {
    await sb.from('investor_alerts').delete().eq('id', id)
    setAlerts((a: Alert[]) => a.filter(al => al.id !== id))
  }
  async function toggleAlert(id: string, active: boolean) {
    await sb.from('investor_alerts').update({ active }).eq('id', id)
    setAlerts((a: Alert[]) => a.map(al => al.id === id ? { ...al, active } : al))
  }

  return (
    <>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>New alert</div>
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', marginBottom: 16, boxShadow: cardShadow }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>Neighborhood</div>
            <input style={INP} value={newAlert.neighborhood} onChange={e => setNewAlert({ ...newAlert, neighborhood: e.target.value })} placeholder="e.g. Lekki Phase 1" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>City</div>
            <input style={INP} value={newAlert.city} onChange={e => setNewAlert({ ...newAlert, city: e.target.value })} placeholder="Lagos" />
          </div>
          <div>
            <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>Type</div>
            <select style={INP} value={newAlert.alert_type} onChange={e => setNewAlert({ ...newAlert, alert_type: e.target.value })}>
              <option value="new_listing">New listing</option>
              <option value="price_drop">Price drop</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>Max price (₦)</div>
            <input type="number" style={INP} value={newAlert.max_price_ngn} onChange={e => setNewAlert({ ...newAlert, max_price_ngn: e.target.value })} placeholder="Optional" />
          </div>
          <button onClick={addAlert} disabled={adding || !newAlert.neighborhood}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1.1rem', fontWeight: 700, fontSize: 13, cursor: adding || !newAlert.neighborhood ? 'default' : 'pointer', opacity: !newAlert.neighborhood ? 0.5 : 1 }}>
            <Plus size={14} /> {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10 }}>
          <Bell size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div style={{ fontSize: 13 }}>No alerts set. Add one above to get notified of new listings and price changes.</div>
        </div>
      ) : (
        alerts.map((al: Alert) => (
          <div key={al.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 8, boxShadow: cardShadow }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {al.neighborhood}{al.city ? `, ${al.city}` : ''} — {al.alert_type.replace(/_/g, ' ')}
                {al.max_price_ngn ? ` (≤${fmtNGN(al.max_price_ngn)})` : ''}
              </div>
              <div style={{ fontSize: 11, color: text3 }}>
                Created {fmtDate(al.created_at)}{al.last_triggered ? ` · Last triggered ${fmtDate(al.last_triggered)}` : ' · Never triggered'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => toggleAlert(al.id, !al.active)}
                style={{ width: 36, height: 20, borderRadius: 100, background: al.active ? '#0D9488' : border, border: 'none', cursor: 'pointer', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 2, left: al.active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </button>
              <button onClick={() => removeAlert(al.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))
      )}
    </>
  )
}

// ── Profile tab ─────────────────────────────────────────────────
function ProfileTab({ bg3, border, text, text2, text3, cardShadow, profile }: any) {
  const goals = profile?.investment_goals || []
  const markets = profile?.preferred_markets || []

  return (
    <>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Investor profile</div>
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', boxShadow: cardShadow }}>
        <p style={{ fontSize: 13, color: text2, lineHeight: 1.65, marginBottom: 20 }}>
          Your profile is private. It's used to personalise your MANOP experience — alert defaults and what's surfaced to you.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Budget range', value: profile?.budget_min && profile?.budget_max ? `${fmtNGN(profile.budget_min)} — ${fmtNGN(profile.budget_max)}` : profile?.budget_min ? `From ${fmtNGN(profile.budget_min)}` : '—' },
            { label: 'Currency preference', value: profile?.preferred_currency || '—' },
            { label: 'Diaspora status', value: profile?.is_diaspora ? `Yes — ${profile.country_of_residence || 'location not set'}` : 'No' },
          ].map(s => (
            <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem' }}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: text3, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 700 }}>Investment goals</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {goals.length > 0 ? goals.map((g: string) => (
              <span key={g} style={{ fontSize: 12, fontWeight: 600, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '4px 10px' }}>{GOAL_LABELS[g] || g}</span>
            )) : <span style={{ fontSize: 13, color: text3 }}>—</span>}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: text3, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 700 }}>Preferred markets</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {markets.length > 0 ? markets.map((m: string) => (
              <span key={m} style={{ fontSize: 12, fontWeight: 600, color: text2, background: border, borderRadius: 20, padding: '4px 10px' }}>{m}</span>
            )) : <span style={{ fontSize: 13, color: text3 }}>—</span>}
          </div>
        </div>

        <Link href="/profile/setup-investor" style={{ display: 'inline-block', background: '#5B2EFF', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
          Edit profile →
        </Link>
      </div>
    </>
  )
}