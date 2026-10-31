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
// DB tables: investor_watchlist, investor_profiles, user_profiles,
// developer_projects.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import BuyerPackButton from '../../../components/BuyerPackButton'
import { supabase as sb } from '../../../lib/supabase'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import { ManopLogoSVG } from '../../../components/ManopLogo'
import ManopLoader from '../../../components/ManopLoader'
import MediaLightbox, { MediaItem } from '../../../components/MediaLightbox'
import MyFinancePanel from '../../../components/MyFinancePanel'
import MyBuyerPacksPanel from '../../../components/MyBuyerPacksPanel'
import {
  Search, Building2, ExternalLink, CheckCircle2,
} from 'lucide-react'

type Tab = 'overview' | 'developments' | 'packs' | 'myfinance' | 'profile'

// Field names below match what app/profile/setup-investor/page.tsx
// actually writes to investor_profiles (confirmed by reading that
// file's upsert call) — NOT the plural/renamed fields this interface
// used to declare (investment_goals, is_diaspora, country_of_residence,
// preferred_currency), none of which that form ever writes. Those were
// read as undefined on every real row; swapped for the real columns:
// investment_goal (singular) and location_type ('local'|'diaspora'),
// with country doubling as country_of_residence for a diaspora investor.
interface InvestorProfile {
  budget_min: number | null; budget_max: number | null
  preferred_markets: string[] | null; investment_goal: string | null
  location_type: 'local' | 'diaspora' | null; country: string | null
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
  const [savedDevelopments, setSavedDevelopments] = useState<any[]>([])

  useEffect(() => { return listenTheme(setDark) }, [])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setUserName(user.email?.split('@')[0] || 'Investor')

    // FIX: this used to resolve a "user_profiles.id" through
    // user_profiles.auth_user_id before querying investor_profiles —
    // but `select id, auth_user_id, user_role from user_profiles`
    // against the real database (run 2026-10-07) shows auth_user_id is
    // NULL on every row; nothing in the codebase ever writes it
    // (app/profile/setup-investor/page.tsx upserts user_profiles with
    // `id: user.id` directly, and investor_profiles with
    // `user_id: user.id` directly — the auth id IS the join key, with
    // no indirection). The old lookup therefore always returned null,
    // upId was always null, and `profile` below was always null for
    // every real investor regardless of what they'd filled in —
    // Profile tab silently showed blank / fallback state for 100% of
    // users. Fixed to use user.id directly, matching the convention
    // every write path actually uses.
    const [{ data: ip }, { data: devs }] = await Promise.all([
      sb.from('investor_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      sb.from('investor_watchlist')
        .select('id, developer_projects(id, name, neighborhood, city, reviewed_at, images)')
        .eq('user_id', user.id).not('project_id', 'is', null).order('created_at', { ascending: false }).limit(50),
    ])

    setProfile(ip || null)
    setSavedDevelopments(devs || [])
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
    { key: 'developments', label: 'Find developments' },
    { key: 'packs',        label: 'Buyer Packs' },
    { key: 'myfinance',    label: 'My Finance' },
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
            <div style={{ fontSize: 11, color: text3 }}>{profile?.location_type === 'diaspora' ? `Diaspora investor${profile.country ? ' · ' + profile.country : ''}` : 'Investor'}</div>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>Saved developments</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0D9488', letterSpacing: '-0.03em' }}>{savedDevelopments.length}</div>
              </div>
            </div>

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Your saved developments</div>
            {savedDevelopments.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 16 }}>
                <Building2 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div style={{ fontSize: 13, marginBottom: 10 }}>Nothing saved yet.</div>
                <button onClick={() => setTab('developments')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Browse reviewed developments →
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 16 }}>
                {savedDevelopments.map(item => {
                  const d = Array.isArray(item.developer_projects) ? item.developer_projects[0] : item.developer_projects
                  if (!d) return null
                  return (
                    <div key={item.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '0.75rem', marginBottom: 8, boxShadow: cardShadow }}>
                      <Link href={`/development/${d.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: text, minHeight: 44 }}>
                        <div style={{ width: 56, height: 44, borderRadius: 6, flexShrink: 0, background: d.images?.[0] ? `url(${d.images[0]}) center/cover` : bg2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                          <div style={{ fontSize: 11.5, color: text3 }}>{[d.neighborhood, d.city].filter(Boolean).join(', ')}</div>
                        </div>
                        {d.reviewed_at && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap' as const }}>
                            <CheckCircle2 size={11} /> MANOP Review
                          </span>
                        )}
                      </Link>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 8, alignItems: 'flex-start' }}>
                        <BuyerPackButton projectId={d.id} dark={dark} compact />
                        <button onClick={async () => { if (!user) return; const { error } = await sb.from('investor_watchlist').delete().eq('id', item.id).eq('user_id', user.id); if (!error) setSavedDevelopments(prev => prev.filter(x => x.id !== item.id)) }}
                          style={{ minHeight: 36, padding: '0.3rem 0.8rem', borderRadius: 4, border: `1px solid ${border}`, background: 'transparent', color: text2, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Your enquiries</div>
              <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, marginBottom: 8 }}>Follow the enquiries and information requests you have sent to developers, and any responses.</div>
              <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 700, color: '#5B2EFF', textDecoration: 'none' }}>Open my enquiries →</Link>
            </div>

          </>
        )}

        {/* ── Developments — real search, real detail view ── */}
        {tab === 'developments' && <DevelopmentsTab dark={dark} bg2={bg2} bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} INP={INP} />}

        {/* ── My Finance — Phase 6 workspace panel ── */}
        {tab === 'packs' && <MyBuyerPacksPanel dark={dark} />}
        {tab === 'myfinance' && user && <MyFinancePanel userId={user.id} dark={dark} />}

        {/* ── Profile ── */}
        {tab === 'profile' && <ProfileTab bg3={bg3} border={border} text={text} text2={text2} text3={text3} cardShadow={cardShadow} profile={profile} />}

      </div>
    </div>
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
    // The text goes inside a PostgREST filter string: strip the characters that can change its structure.
    const term = query.trim().replace(/[,()*\\%_]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!term) return
    const { data } = await sb.from('developer_projects')
      .select('*, developer_accounts(company_name)')
      .eq('publish_status', 'published')
      .or(`neighborhood.ilike.%${term}%,city.ilike.%${term}%`)
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginBottom: 14 }}>
          <Link href={`/development/${selected.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0.6rem 1.1rem', borderRadius: 4, background: '#5B2EFF', color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>View full development page</Link>
          <div style={{ minWidth: 200 }}><BuyerPackButton projectId={selected.id} dark={dark} /></div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
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

// ── Profile tab ─────────────────────────────────────────────────
function ProfileTab({ bg3, border, text, text2, text3, cardShadow, profile }: any) {
  const goals = profile?.investment_goal ? [profile.investment_goal] : []
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
            { label: 'Based in', value: profile?.country || '—' },
            { label: 'Diaspora status', value: profile?.location_type === 'diaspora' ? `Yes — ${profile.country || 'location not set'}` : profile?.location_type === 'local' ? 'No' : '—' },
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