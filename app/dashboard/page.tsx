'use client'
// app/dashboard/page.tsx
//
// THE canonical workspace for buyer and diaspora accounts — built
// because, per the investor/buyer/diaspora audit, ROLE_ROUTES sent both
// roles to /developments (the plain public listing, identical to what a
// logged-out visitor sees). Real preference/data capture already existed
// for both roles (app/profile/setup-buyer, setup-diaspora) and was
// simply thrown away on redirect. This is the smallest shell that
// actually surfaces it, built on the exact same architecture as
// app/investor/dashboard/page.tsx (same tables, same MyFinancePanel,
// same watchlist) rather than a parallel system — per the standing rule
// not to create a second dashboard architecture.
//
// One workspace, two contexts:
//   - buyer:    user_profiles.user_role = 'buyer'    (set by setup-buyer)
//   - diaspora: user_profiles.user_role = 'diaspora'  (set by setup-diaspora)
// Both read/write the SAME tables an investor does — investor_watchlist
// (watchlist has no role constraint; it is keyed on user_id, full stop)
// and finance_analyses via MyFinancePanel — plus the new
// developer_leads.user_id column (sql/phase9_user_workspace.sql) for
// "My Enquiries", which genuinely did not exist before this.
//
// DB tables read: user_profiles, investor_watchlist, developer_leads.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { useAuth } from '../../lib/useAuth'
import { ManopLogoSVG } from '../../components/ManopLogo'
import ManopLoader from '../../components/ManopLoader'
import MyFinancePanel from '../../components/MyFinancePanel'
import MyBuyerPacksPanel from '../../components/MyBuyerPacksPanel'
import DealRoomPanel from '../../components/DealRoomPanel'
import BuyerPackButton from '../../components/BuyerPackButton'
import { Building2, Mail, Wallet, User as UserIcon, CheckCircle2, ExternalLink, Globe2 } from 'lucide-react'

type Tab = 'overview' | 'developments' | 'enquiries' | 'packs' | 'myfinance' | 'profile'

interface WorkspaceProfile {
  user_role: string | null
  city: string | null
  budget_range: string | null
  property_type: string | null
  timeline: string | null
  country_of_residence: string | null
  preferred_currency: string | null
  preferred_markets: string[] | null
  budget_range_usd: string | null
}

function fmtDate(d: string): string {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export default function UserWorkspace() {
  // No requiredRole here on purpose — this single page serves both
  // buyer and diaspora, unlike /investor/dashboard which enforces one
  // role. useAuth() without an argument just confirms a session exists.
  const { user, checking } = useAuth()
  const router = useRouter()
  const [dark, setDark] = useState(getInitialDark)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')

  const [profile, setProfile] = useState<WorkspaceProfile | null>(null)
  const [saved, setSaved] = useState<any[]>([])
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [openRoom, setOpenRoom] = useState<string | null>(null)

  useEffect(() => { return listenTheme(setDark) }, [])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [{ data: p }, { data: devs }, { data: leads }] = await Promise.all([
      sb.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
      sb.from('investor_watchlist')
        .select('id, developer_projects(id, name, neighborhood, city, reviewed_at, images)')
        .eq('user_id', user.id).not('project_id', 'is', null).limit(20),
      // my_introductions (sql/phase10_deal_room.sql) is the buyer-safe view of
      // their own developer_leads rows — it omits MANOP's fee columns.
      sb.from('my_introductions')
        .select('id, project_id, manop_lead_id, stage, created_at, acknowledged_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setProfile((p as WorkspaceProfile) || null)
    setSaved(devs || [])
    // The view cannot embed related tables, so look the project names up separately.
    const ids = Array.from(new Set((leads || []).map((l: any) => l.project_id).filter(Boolean)))
    let names: Record<string, any> = {}
    if (ids.length) {
      const { data: projs } = await sb.from('developer_projects').select('id, name, neighborhood, city').in('id', ids)
      names = Object.fromEntries((projs || []).map((x: any) => [x.id, x]))
    }
    setEnquiries((leads || []).map((l: any) => ({ ...l, developer_projects: names[l.project_id] || null })))
    setLoading(false)
  }, [user])

  useEffect(() => { if (user) loadAll() }, [user, loadAll])

  async function signOut() { await sb.auth.signOut(); router.push('/login') }

  const isDiaspora = profile?.user_role === 'diaspora'

  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const bg2    = dark ? '#111827' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3  = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.58)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.16)'
  const cardShadow = dark ? 'none' : '0 1px 2px rgba(15,23,42,0.08)'
  const card: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', boxShadow: cardShadow, marginBottom: 12 }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'developments', label: `My developments (${saved.length})` },
    { key: 'enquiries',    label: `My enquiries (${enquiries.length})` },
    { key: 'packs',        label: 'Buyer Packs' },
    { key: 'myfinance',    label: 'My Finance' },
    { key: 'profile',      label: 'Profile' },
  ]

  if (checking || (user && loading)) return <ManopLoader dark={dark} label="Loading your workspace…" />

  function Field({ label, value }: { label: string; value: string | null | undefined }) {
    return (
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{value || '—'}</div>
      </div>
    )
  }

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
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{user?.email?.split('@')[0] || 'Your workspace'}</div>
            <div style={{ fontSize: 11, color: text3, display: 'flex', alignItems: 'center', gap: 4 }}>
              {isDiaspora && <Globe2 size={11} />}
              {isDiaspora ? `Diaspora buyer${profile?.country_of_residence ? ' · ' + profile.country_of_residence : ''}` : 'Buyer'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/developments" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>Browse developments</Link>
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
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>

        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: '1.25rem' }}>
              {[
                { label: 'Saved developments', value: saved.length },
                { label: 'Enquiries sent', value: enquiries.length },
              ].map(s => (
                <div key={s.label} style={{ ...card, marginBottom: 0 }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0D9488', letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {isDiaspora && (
              <div style={{ ...card, borderColor: 'rgba(91,46,255,0.35)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8 }}>For diaspora buyers</div>
                <p style={{ fontSize: 13, color: text2, lineHeight: 1.6, margin: 0 }}>
                  Every development page shows a reference currency conversion, virtual viewing, remote purchase
                  and Power of Attorney support where the developer has confirmed them. MANOP does not remove the
                  need for your own independent verification before you commit.
                </p>
              </div>
            )}

            {saved.length === 0 && enquiries.length === 0 && (
              <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10 }}>
                <Building2 size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
                <div style={{ fontSize: 13, marginBottom: 10 }}>Nothing saved or enquired about yet.</div>
                <Link href="/developments" style={{ background: '#5B2EFF', color: '#fff', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  Browse reviewed developments →
                </Link>
              </div>
            )}
          </>
        )}

        {tab === 'developments' && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Saved developments</div>
            {saved.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10 }}>Nothing saved yet.</div>
            ) : saved.map(item => {
              const d = Array.isArray(item.developer_projects) ? item.developer_projects[0] : item.developer_projects
              if (!d) return null
              return (
                <div key={item.id} style={{ marginBottom: 10 }}>
                  <Link href={`/development/${d.id}`} style={{ textDecoration: 'none', color: text }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.75rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6, boxShadow: cardShadow }}>
                      <div style={{ width: 56, height: 44, borderRadius: 6, flexShrink: 0, background: d.images?.[0] ? `url(${d.images[0]}) center/cover` : bg2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d.name}</div>
                        <div style={{ fontSize: 11.5, color: text3 }}>{d.neighborhood}, {d.city}</div>
                      </div>
                      {d.reviewed_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
                          <CheckCircle2 size={11} /> MANOP Review
                        </span>
                      )}
                    </div>
                  </Link>
                  <div style={{ marginTop: 2 }}><BuyerPackButton projectId={d.id} dark={dark} compact /></div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'enquiries' && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>My enquiries</div>
            {enquiries.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, background: bg3, border: `1px solid ${border}`, borderRadius: 10 }}>
                No enquiries yet. Enquiries you send from a development page will appear here.
              </div>
            ) : enquiries.map(e => {
              const d = Array.isArray(e.developer_projects) ? e.developer_projects[0] : e.developer_projects
              return (
                <div key={e.id} style={{ ...card, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{d?.name || 'Development'}</div>
                      <div style={{ fontSize: 11.5, color: text3 }}>{d ? `${d.neighborhood}, ${d.city} · ` : ''}{fmtDate(e.created_at)}</div>
                    </div>
                    <button onClick={() => setOpenRoom(openRoom === e.id ? null : e.id)} style={{ fontSize: 11, background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 8, padding: '3px 9px', cursor: 'pointer' }}>{openRoom === e.id ? 'Hide progress' : 'Progress'}</button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#5B2EFF', background: 'rgba(91,46,255,0.1)', borderRadius: 20, padding: '3px 10px', textTransform: 'capitalize' as const, flexShrink: 0 }}>{e.stage || 'enquiry'}</span>
                  </div>
                  {openRoom === e.id && <div style={{ marginTop: 10 }}><DealRoomPanel leadId={e.id} dark={dark} /></div>}
                </div>
              )
            })}
          </>
        )}

        {tab === 'packs' && <MyBuyerPacksPanel dark={dark} />}
        {tab === 'myfinance' && user && <MyFinancePanel userId={user.id} dark={dark} />}

        {tab === 'profile' && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Your profile</div>
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
                {isDiaspora ? (
                  <>
                    <Field label="Based in" value={profile?.country_of_residence} />
                    <Field label="Preferred currency" value={profile?.preferred_currency} />
                    <Field label="Preferred markets" value={profile?.preferred_markets?.join(', ') || null} />
                    <Field label="Budget" value={profile?.budget_range_usd} />
                  </>
                ) : (
                  <>
                    <Field label="City" value={profile?.city} />
                    <Field label="Budget" value={profile?.budget_range} />
                    <Field label="Property type" value={profile?.property_type} />
                    <Field label="Timeline" value={profile?.timeline} />
                  </>
                )}
              </div>
              <Link href={isDiaspora ? '/profile/setup-diaspora' : '/profile/setup-buyer'} style={{ display: 'inline-block', background: '#5B2EFF', color: '#fff', padding: '0.65rem 1.5rem', borderRadius: 8, fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
                Edit profile →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}