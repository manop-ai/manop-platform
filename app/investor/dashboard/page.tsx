'use client'
// app/investor/dashboard/page.tsx
//
// INVESTOR DASHBOARD — first build
//
// DB tables already exist (from SQL migrations):
//   investor_watchlist    — saved properties
//   investor_alerts       — neighborhood price/activity alerts
//   investor_profiles     — preferences (budget, goals, markets)
//   user_profiles         — auth + role
//
// WHAT THIS BUILDS:
//   Tab 1 — Overview      : portfolio summary, MAPE of watched agencies, quick stats
//   Tab 2 — Watchlist     : saved properties with price-at-save, current price, deal status
//   Tab 3 — Markets       : neighborhood benchmarks, yield data, demand scores
//   Tab 4 — Alerts        : set price drop + new listing alerts per neighborhood
//   Tab 5 — Profile       : budget, goals, diaspora settings
//
// AUTH: Supabase Auth. Redirects to /login if not authenticated.
// ROLE: buyer | investor | diaspora — all land here after setup.
//
// LIGHT MODE: every color value reads from the `dark` state prop.
// This is the fix for the light mode rendering bug reported.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { ManopLogoSVG } from '../../../components/ManopLogo'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────
// Supabase returns joined rows as arrays even for single-object joins.
// The property field comes back as an array, not a single object.
// We normalise it with a helper below.
interface PropertyJoin {
  id:            string
  neighborhood:  string | null
  city:          string | null
  property_type: string | null
  bedrooms:      number | null
  price_local:   number | null
  listing_type:  string | null
  raw_data:      Record<string, unknown> | null
}

interface WatchlistItem {
  id:            string
  property_id:   string | null
  status:        string
  price_at_save: number | null
  notes:         string | null
  saved_at:      string
  // Supabase join returns array — we pick [0] when rendering
  property:      PropertyJoin[] | PropertyJoin | null | undefined
}

// Normalise: whether Supabase returns array or object, get the single property
function getProperty(item: WatchlistItem): PropertyJoin | null {
  if (!item.property) return null
  if (Array.isArray(item.property)) return item.property[0] || null
  return item.property
}

interface Alert {
  id:             string
  alert_type:     string
  neighborhood:   string | null
  city:           string | null
  threshold_value: number | null
  active:         boolean
  last_triggered: string | null
  created_at:     string
}

interface InvestorProfile {
  budget_min:            number | null
  budget_max:            number | null
  preferred_cities:      string[] | null
  preferred_neighborhoods: string[] | null
  property_types:        string[] | null
  investment_goals:      string[] | null
  is_diaspora:           boolean | null
  country_of_residence:  string | null
  currency_preference:   string | null
}

interface MarketRow {
  neighborhood:     string
  city:             string
  listing_count:    number
  median_price:     number | null
  data_quality:     string
  last_updated:     string | null
}

interface UserInfo {
  id:        string
  full_name: string | null
  user_role: string | null
  email:     string | null
}

type Tab = 'overview' | 'watchlist' | 'markets' | 'alerts' | 'profile'

// ─── Helpers ─────────────────────────────────────────────────
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

function priceDelta(current: number | null | undefined, atSave: number | null | undefined): string | null {
  if (!current || !atSave) return null
  const delta = ((current - atSave) / atSave) * 100
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  watching:        { label: 'Watching',        color: '#94A3B8' },
  inquired:        { label: 'Inquired',         color: '#60A5FA' },
  viewing_booked:  { label: 'Viewing Booked',   color: '#F59E0B' },
  offer_made:      { label: 'Offer Made',        color: '#A78BFA' },
  closed:          { label: 'Closed',            color: '#22C55E' },
  passed:          { label: 'Passed',            color: '#EF4444' },
}

const GOAL_LABELS: Record<string, string> = {
  capital_growth:  'Capital Growth',
  rental_income:   'Rental Income',
  own_use:         'Own Use',
  mixed:           'Mixed Strategy',
}

// ─── MAIN COMPONENT ──────────────────────────────────────────
export default function InvestorDashboard() {
  const router = useRouter()

  const [dark,      setDark]      = useState(true)
  const [tab,       setTab]       = useState<Tab>('overview')
  const [user,      setUser]      = useState<UserInfo | null>(null)
  const [profile,   setProfile]   = useState<InvestorProfile | null>(null)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [alerts,    setAlerts]    = useState<Alert[]>([])
  const [markets,   setMarkets]   = useState<MarketRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  // Alert form
  const [newAlert, setNewAlert] = useState({ neighborhood: '', city: '', alert_type: 'new_listing', threshold_value: '' })
  const [addingAlert, setAddingAlert] = useState(false)

  // ── Theme ───────────────────────────────────────────────────
  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const bg      = dark ? '#0F172A' : '#F8FAFC'
  const bg2     = dark ? '#1E293B' : '#F1F5F9'
  const bg3     = dark ? '#162032' : '#FFFFFF'
  const text    = dark ? '#F8FAFC' : '#0F172A'
  const text2   = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3   = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border  = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.08)'
  const purple  = '#5B2EFF'
  const teal    = '#14B8A6'
  const green   = '#22C55E'
  const amber   = '#F59E0B'
  const red     = '#EF4444'

  const card: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`,
    borderRadius: 14, padding: '1.25rem 1.5rem',
  }

  const sLabel: React.CSSProperties = {
    fontSize: '0.58rem', fontWeight: 700, color: teal,
    textTransform: 'uppercase' as const, letterSpacing: '0.14em', marginBottom: '0.35rem',
  }

  // ── Load data ───────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.user) { router.push('/login'); return }

      const userId = session.user.id

      // User profile
      const { data: up } = await sb
        .from('user_profiles')
        .select('full_name, user_role, email, auth_user_id')
        .eq('auth_user_id', userId)
        .maybeSingle()

      setUser({
        id:        userId,
        full_name: up?.full_name || session.user.user_metadata?.full_name || null,
        user_role: up?.user_role || session.user.user_metadata?.user_role || 'buyer',
        email:     up?.email || session.user.email || null,
      })

      // Investor profile
      const { data: ip } = await sb
        .from('investor_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      setProfile(ip || null)

      // Watchlist with property join
      const { data: wl } = await sb
        .from('investor_watchlist')
        .select(`
          id, property_id, status, price_at_save, notes, saved_at,
          property:properties(id, neighborhood, city, property_type, bedrooms, price_local, listing_type, raw_data)
        `)
        .eq('user_id', userId)
        .order('saved_at', { ascending: false })
        .limit(50)

      setWatchlist((wl || []) as unknown as WatchlistItem[])

      // Alerts
      const { data: al } = await sb
        .from('investor_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      setAlerts(al || [])

      // Markets — load neighborhood benchmarks for preferred markets
      const cities = ip?.preferred_cities?.length
        ? ip.preferred_cities
        : ['Lagos', 'Accra', 'Nairobi', 'Abuja']

      const { data: mkt } = await sb
        .from('neighborhood_benchmarks')
        .select('neighborhood, city, listing_count, median_price, data_quality, last_updated')
        .in('city', cities)
        .gte('listing_count', 1)
        .order('listing_count', { ascending: false })
        .limit(30)

      setMarkets(mkt || [])

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { loadData() }, [loadData])

  // ── Update watchlist item status ────────────────────────────
  async function updateWatchlistStatus(itemId: string, status: string) {
    try {
      await sb
        .from('investor_watchlist')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', itemId)
      setWatchlist(w => w.map(i => i.id === itemId ? { ...i, status } : i))
    } catch (err) {
      console.error('[Watchlist] status update:', err)
    }
  }

  // ── Remove from watchlist ───────────────────────────────────
  async function removeFromWatchlist(itemId: string) {
    try {
      await sb.from('investor_watchlist').delete().eq('id', itemId)
      setWatchlist(w => w.filter(i => i.id !== itemId))
    } catch (err) {
      console.error('[Watchlist] remove:', err)
    }
  }

  // ── Add alert ───────────────────────────────────────────────
  async function addAlert() {
    if (!newAlert.neighborhood || !user) return
    setAddingAlert(true)
    try {
      const { data, error: dbErr } = await sb
        .from('investor_alerts')
        .insert({
          user_id:         user.id,
          alert_type:      newAlert.alert_type,
          neighborhood:    newAlert.neighborhood,
          city:            newAlert.city || null,
          threshold_value: newAlert.threshold_value ? parseFloat(newAlert.threshold_value) : null,
          active:          true,
        })
        .select()
        .maybeSingle()

      if (dbErr) throw new Error(dbErr.message)
      if (data) setAlerts(a => [data as Alert, ...a])
      setNewAlert({ neighborhood: '', city: '', alert_type: 'new_listing', threshold_value: '' })
    } catch (err) {
      console.error('[Alert] add:', err)
    } finally {
      setAddingAlert(false)
    }
  }

  // ── Toggle alert active ─────────────────────────────────────
  async function toggleAlert(id: string, active: boolean) {
    await sb.from('investor_alerts').update({ active }).eq('id', id)
    setAlerts(a => a.map(al => al.id === id ? { ...al, active } : al))
  }

  // ── Loading state ───────────────────────────────────────────
  if (loading) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text }}>
      <div style={{ textAlign: 'center' as const }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${border}`, borderTopColor: purple, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
        <div style={{ fontSize: '0.82rem', color: text3 }}>Loading your dashboard…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text }}>
      <div style={{ textAlign: 'center' as const, maxWidth: 360, padding: '2rem' }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠</div>
        <div style={{ fontSize: '0.875rem', color: red, marginBottom: '1rem' }}>{error}</div>
        <button onClick={loadData} style={{ background: purple, color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.5rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          Retry
        </button>
      </div>
    </div>
  )

  const displayName = user?.full_name?.split(' ')[0] || 'Investor'
  const isDiaspora  = profile?.is_diaspora || user?.user_role === 'diaspora'

  // ── TAB CONTENT ─────────────────────────────────────────────

  function OverviewTab() {
    const activeWatchlist = watchlist.filter(w => !['closed', 'passed'].includes(w.status))
    const closedDeals     = watchlist.filter(w => w.status === 'closed')
    const goals           = profile?.investment_goals || []

    return (
      <div>
        {/* Welcome */}
        <div style={{ ...card, marginBottom: '1rem', background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={sLabel}>{isDiaspora ? 'Diaspora investor' : 'Investor'}</div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: text, letterSpacing: '-0.03em', marginBottom: '0.35rem' }}>
                Welcome back, {displayName}
              </h1>
              {goals.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: text2 }}>
                  Strategy: {goals.map(g => GOAL_LABELS[g] || g).join(' · ')}
                </div>
              )}
            </div>
            {isDiaspora && profile?.country_of_residence && (
              <div style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 8, padding: '0.4rem 0.875rem', fontSize: '0.72rem', fontWeight: 700, color: teal }}>
                🌍 {profile.country_of_residence}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { label: 'Watching',       value: activeWatchlist.length, color: purple },
            { label: 'Active alerts',  value: alerts.filter(a => a.active).length, color: teal },
            { label: 'Deals closed',   value: closedDeals.length, color: green },
            { label: 'Markets tracked', value: (profile?.preferred_cities || []).length || '—', color: amber },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center' as const }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 800, color: s.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.68rem', color: text3, marginTop: '0.3rem', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent watchlist */}
        <div style={{ ...card, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
            <div style={sLabel}>Recent watchlist activity</div>
            <button onClick={() => setTab('watchlist')} style={{ background: 'none', border: 'none', color: purple, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              View all →
            </button>
          </div>
          {activeWatchlist.slice(0, 4).length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '1.5rem', color: text3, fontSize: '0.82rem' }}>
              No properties in your watchlist yet.{' '}
              <Link href="/search" style={{ color: purple, textDecoration: 'none' }}>Browse properties →</Link>
            </div>
          ) : (
            activeWatchlist.slice(0, 4).map(item => {
              const p = getProperty(item)
              const delta = priceDelta(p?.price_local, item.price_at_save)
              const st = STATUS_LABELS[item.status] || { label: item.status, color: text3 }
              return (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderBottom: `1px solid ${border}` }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: text, marginBottom: 2 }}>
                      {p?.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p?.property_type || 'Property'} — {p?.neighborhood || '—'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: text3 }}>Saved {fmtDate(item.saved_at)} · {fmtNGN(item.price_at_save)} at save</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {delta && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: delta.startsWith('+') ? red : green }}>
                        {delta}
                      </span>
                    )}
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}30`, borderRadius: 20, padding: '2px 8px' }}>
                      {st.label}
                    </span>
                    <Link href={`/property/${p?.id}`} style={{ fontSize: '0.7rem', color: purple, textDecoration: 'none' }}>View →</Link>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Setup prompts if profile incomplete */}
        {!profile && (
          <div style={{ ...card, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: amber, marginBottom: '0.5rem' }}>Complete your investor profile</div>
            <div style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.6, marginBottom: '0.875rem' }}>
              Set your budget, target markets, and investment goals so MANOP can personalise your experience.
            </div>
            <button onClick={() => setTab('profile')} style={{ background: amber, color: '#0F172A', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Set up profile →
            </button>
          </div>
        )}
      </div>
    )
  }

  function WatchlistTab() {
    const [filter, setFilter] = useState<string>('all')
    const filtered = filter === 'all' ? watchlist : watchlist.filter(w => w.status === filter)

    return (
      <div>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' as const }}>
          {['all', 'watching', 'inquired', 'viewing_booked', 'offer_made', 'closed', 'passed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ padding: '0.3rem 0.8rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: filter === s ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${filter === s ? purple : border}`, background: filter === s ? 'rgba(91,46,255,0.12)' : 'transparent', color: filter === s ? '#A78BFA' : text3, transition: 'all 0.12s' }}>
              {s === 'all' ? `All (${watchlist.length})` : (STATUS_LABELS[s]?.label || s)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div style={{ ...card, textAlign: 'center' as const, padding: '3rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔖</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: text, marginBottom: '0.5rem' }}>No properties saved yet</div>
            <div style={{ fontSize: '0.78rem', color: text2, marginBottom: '1.25rem' }}>
              Save properties from the search page or from any property listing to track them here.
            </div>
            <Link href="/search" style={{ display: 'inline-block', background: purple, color: '#fff', padding: '0.65rem 1.5rem', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
              Browse properties →
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
            {filtered.map(item => {
              const p = getProperty(item)
              const delta = priceDelta(p?.price_local, item.price_at_save)
              const st = STATUS_LABELS[item.status] || { label: item.status, color: text3 }
              const imgs = Array.isArray(p?.raw_data?.images) ? p.raw_data.images as string[] : []

              return (
                <div key={item.id} style={{ ...card, display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {/* Thumbnail */}
                  <div style={{ width: 80, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: bg2 }}>
                    {imgs[0] ? (
                      <img src={imgs[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', opacity: 0.3 }}>🏠</div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: text, lineHeight: 1.3 }}>
                          {p?.bedrooms ? `${p.bedrooms}-Bed ` : ''}{p?.property_type || 'Property'}
                          {p?.neighborhood ? ` — ${p.neighborhood}` : ''}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: text3 }}>
                          {p?.city} · Saved {fmtDate(item.saved_at)}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}30`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
                        {st.label}
                      </span>
                    </div>

                    {/* Prices */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: purple }}>{fmtNGN(p?.price_local)}</div>
                      {item.price_at_save && item.price_at_save !== p?.price_local && (
                        <div style={{ fontSize: '0.72rem', color: text3 }}>at save: {fmtNGN(item.price_at_save)}</div>
                      )}
                      {delta && (
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: delta.startsWith('+') ? red : green }}>
                          {delta} since saved
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                      <Link href={`/property/${p?.id}`}
                        style={{ fontSize: '0.72rem', fontWeight: 600, color: purple, background: 'rgba(91,46,255,0.1)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 6, padding: '0.3rem 0.7rem', textDecoration: 'none' }}>
                        View →
                      </Link>

                      {/* Status progression */}
                      {item.status === 'watching' && (
                        <button onClick={() => updateWatchlistStatus(item.id, 'inquired')}
                          style={{ fontSize: '0.72rem', fontWeight: 600, color: '#60A5FA', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Mark inquired
                        </button>
                      )}
                      {item.status === 'inquired' && (
                        <button onClick={() => updateWatchlistStatus(item.id, 'viewing_booked')}
                          style={{ fontSize: '0.72rem', fontWeight: 600, color: amber, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Viewing booked
                        </button>
                      )}
                      {item.status === 'viewing_booked' && (
                        <button onClick={() => updateWatchlistStatus(item.id, 'offer_made')}
                          style={{ fontSize: '0.72rem', fontWeight: 600, color: '#A78BFA', background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Offer made
                        </button>
                      )}
                      {['offer_made', 'viewing_booked'].includes(item.status) && (
                        <button onClick={() => updateWatchlistStatus(item.id, 'closed')}
                          style={{ fontSize: '0.72rem', fontWeight: 600, color: green, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Closed ✓
                        </button>
                      )}
                      {!['closed', 'passed'].includes(item.status) && (
                        <button onClick={() => updateWatchlistStatus(item.id, 'passed')}
                          style={{ fontSize: '0.72rem', fontWeight: 500, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, padding: '0.3rem 0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Pass
                        </button>
                      )}
                      <button onClick={() => removeFromWatchlist(item.id)}
                        style={{ fontSize: '0.72rem', fontWeight: 500, color: text3, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.3rem 0.4rem' }}>
                        ✕ Remove
                      </button>
                    </div>

                    {item.notes && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: text2, fontStyle: 'italic' }}>
                        "{item.notes}"
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  function MarketsTab() {
    return (
      <div>
        <div style={{ ...card, marginBottom: '1rem', background: dark ? 'rgba(20,184,166,0.05)' : 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.15)' }}>
          <div style={sLabel}>About neighborhood benchmarks</div>
          <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65 }}>
            Medians are computed from verified listing data. As more agencies onboard and submit transaction data, these benchmarks become more precise. Data quality: High (20+ listings), Medium (5+), Low (&lt;5).
          </div>
        </div>

        {markets.length === 0 ? (
          <div style={{ ...card, textAlign: 'center' as const, padding: '2.5rem' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
            <div style={{ fontSize: '0.875rem', color: text2 }}>No benchmark data yet for your preferred markets.</div>
            <div style={{ fontSize: '0.75rem', color: text3, marginTop: '0.4rem' }}>Set your preferred cities in your profile to see relevant benchmarks.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  {['Neighborhood', 'City', 'Listings', 'Median Price', 'Data Quality', 'Last Updated'].map(h => (
                    <th key={h} style={{ textAlign: 'left' as const, fontSize: '0.6rem', fontWeight: 700, color: text3, textTransform: 'uppercase' as const, letterSpacing: '0.1em', padding: '0.6rem 0.75rem', background: bg3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {markets.map((m, i) => {
                  const qc = m.data_quality === 'high' ? green : m.data_quality === 'medium' ? amber : text3
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${border}` }}
                      onMouseEnter={e => (e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: text }}>{m.neighborhood}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: text2 }}>{m.city}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.78rem', color: text2 }}>{m.listing_count}</td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.875rem', fontWeight: 700, color: purple }}>{fmtNGN(m.median_price)}</td>
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: qc, background: `${qc}18`, border: `1px solid ${qc}30`, borderRadius: 20, padding: '2px 8px' }}>
                          {m.data_quality}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.72rem', color: text3 }}>{fmtDate(m.last_updated)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  function AlertsTab() {
    const INP: React.CSSProperties = {
      padding: '0.6rem 0.8rem', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
      border: `1.5px solid ${border}`, borderRadius: 8, color: text,
      fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit',
      boxSizing: 'border-box' as const, width: '100%',
    }

    return (
      <div>
        {/* Add alert */}
        <div style={{ ...card, marginBottom: '1rem' }}>
          <div style={sLabel}>Set a new alert</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: text2, display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Neighborhood *</label>
              <input style={INP} placeholder="e.g. Lekki Phase 1"
                value={newAlert.neighborhood}
                onChange={e => setNewAlert(a => ({ ...a, neighborhood: e.target.value }))}
                onFocus={e => (e.target.style.borderColor = purple)}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: text2, display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>City</label>
              <input style={INP} placeholder="e.g. Lagos"
                value={newAlert.city}
                onChange={e => setNewAlert(a => ({ ...a, city: e.target.value }))}
                onFocus={e => (e.target.style.borderColor = purple)}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.875rem' }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: text2, display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Alert type</label>
              <select style={{ ...INP, cursor: 'pointer', appearance: 'none' as const }}
                value={newAlert.alert_type}
                onChange={e => setNewAlert(a => ({ ...a, alert_type: e.target.value }))}>
                <option value="new_listing">New listing</option>
                <option value="price_drop">Price drop</option>
                <option value="yield_change">Yield change</option>
                <option value="market_update">Market update</option>
              </select>
            </div>
            {newAlert.alert_type === 'price_drop' && (
              <div>
                <label style={{ fontSize: '0.68rem', color: text2, display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Drop threshold (%)</label>
                <input style={INP} type="number" placeholder="e.g. 5"
                  value={newAlert.threshold_value}
                  onChange={e => setNewAlert(a => ({ ...a, threshold_value: e.target.value }))}
                  onFocus={e => (e.target.style.borderColor = purple)}
                  onBlur={e => (e.target.style.borderColor = border)}
                />
              </div>
            )}
          </div>
          <button
            onClick={addAlert}
            disabled={addingAlert || !newAlert.neighborhood}
            style={{ background: purple, color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1.5rem', fontWeight: 700, fontSize: '0.82rem', cursor: addingAlert || !newAlert.neighborhood ? 'default' : 'pointer', fontFamily: 'inherit', opacity: !newAlert.neighborhood ? 0.5 : 1 }}>
            {addingAlert ? 'Adding…' : '+ Add alert'}
          </button>
        </div>

        {/* Alert list */}
        {alerts.length === 0 ? (
          <div style={{ ...card, textAlign: 'center' as const, padding: '2.5rem', color: text3, fontSize: '0.82rem' }}>
            No alerts set. Add one above to get notified of new listings and price changes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.6rem' }}>
            {alerts.map(al => (
              <div key={al.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: text, marginBottom: 3 }}>
                    {al.neighborhood}{al.city ? `, ${al.city}` : ''} — {al.alert_type.replace(/_/g, ' ')}
                    {al.threshold_value ? ` (≥${al.threshold_value}%)` : ''}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: text3 }}>
                    Created {fmtDate(al.created_at)}
                    {al.last_triggered ? ` · Last triggered ${fmtDate(al.last_triggered)}` : ' · Never triggered'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={() => toggleAlert(al.id, !al.active)}
                    style={{ width: 36, height: 20, borderRadius: 100, background: al.active ? teal : border, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ position: 'absolute', top: 2, left: al.active ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </button>
                  <span style={{ fontSize: '0.65rem', color: al.active ? teal : text3, fontWeight: 600 }}>
                    {al.active ? 'On' : 'Off'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function ProfileTab() {
    const goals    = profile?.investment_goals || []
    const types    = profile?.property_types   || []
    const cities   = profile?.preferred_cities || []

    return (
      <div style={{ ...card }}>
        <div style={sLabel}>Investor profile</div>
        <p style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, marginBottom: '1.25rem' }}>
          Your profile is private. It is used to personalise your MANOP experience — market recommendations, alert defaults, and property scoring.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Budget range</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: text }}>
              {profile?.budget_min && profile?.budget_max
                ? `${fmtNGN(profile.budget_min)} — ${fmtNGN(profile.budget_max)}`
                : profile?.budget_min ? `From ${fmtNGN(profile.budget_min)}`
                : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Currency preference</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: text }}>{profile?.currency_preference || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Preferred cities</div>
            <div style={{ fontSize: '0.82rem', color: text }}>{cities.length > 0 ? cities.join(', ') : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.4rem' }}>Diaspora</div>
            <div style={{ fontSize: '0.82rem', color: text }}>{profile?.is_diaspora ? `Yes — ${profile.country_of_residence || 'location not set'}` : 'No'}</div>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Investment goals</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {goals.length > 0 ? goals.map(g => (
              <span key={g} style={{ fontSize: '0.72rem', fontWeight: 600, color: teal, background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 20, padding: '2px 10px' }}>
                {GOAL_LABELS[g] || g}
              </span>
            )) : <span style={{ fontSize: '0.78rem', color: text3 }}>—</span>}
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.6rem', color: text3, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Property types</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {types.length > 0 ? types.map(t => (
              <span key={t} style={{ fontSize: '0.72rem', fontWeight: 600, color: text2, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 20, padding: '2px 10px' }}>{t}</span>
            )) : <span style={{ fontSize: '0.78rem', color: text3 }}>—</span>}
          </div>
        </div>

        <Link href="/profile/setup-buyer" style={{ display: 'inline-block', background: purple, color: '#fff', padding: '0.65rem 1.5rem', borderRadius: 10, fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none' }}>
          Edit profile →
        </Link>
      </div>
    )
  }

  // ─── RENDER ─────────────────────────────────────────────────
  const TABS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'overview',  label: 'Overview',  icon: '⬡' },
    { id: 'watchlist', label: 'Watchlist', icon: '🔖' },
    { id: 'markets',   label: 'Markets',   icon: '📊' },
    { id: 'alerts',    label: 'Alerts',    icon: '🔔' },
    { id: 'profile',   label: 'Profile',   icon: '◎'  },
  ]

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header */}
      <div style={{ background: bg3, borderBottom: `1px solid ${border}`, padding: '0 2rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <ManopLogoSVG height={80} dark={dark} showText={false} />
            </Link>
            <div style={{ width: 1, height: 20, background: border }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: text2 }}>Investor Dashboard</span>
          </div>
          <Link href="/search" style={{ fontSize: '0.78rem', color: purple, textDecoration: 'none', fontWeight: 600 }}>
            Browse properties →
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 2rem 4rem' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: 4 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '0.55rem 0.5rem', borderRadius: 9,
                background: tab === t.id ? (dark ? '#1E293B' : '#F1F5F9') : 'transparent',
                border: `1px solid ${tab === t.id ? border : 'transparent'}`,
                color: tab === t.id ? text : text3,
                fontSize: '0.72rem', fontWeight: tab === t.id ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.15s',
              }}>
              <span style={{ fontSize: '0.85rem' }}>{t.icon}</span>
              <span className="manop-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview'  && <OverviewTab />}
        {tab === 'watchlist' && <WatchlistTab />}
        {tab === 'markets'   && <MarketsTab />}
        {tab === 'alerts'    && <AlertsTab />}
        {tab === 'profile'   && <ProfileTab />}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 600px) {
          .manop-tab-label { display: none; }
        }
      `}</style>
    </div>
  )
}