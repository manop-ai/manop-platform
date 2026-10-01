'use client'
// app/profile/setup-diaspora/page.tsx — SPRINT 1
// Post-verification setup for Diaspora Investor accounts.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const MARKETS    = ['Lagos', 'Abuja', 'Accra', 'Nairobi', 'Port Harcourt']
const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD']
const GOALS      = ['Capital appreciation', 'Rental income', 'Short-let yield', 'Family home', 'Retirement home']
const BUDGETS    = ['Under $50K', '$50K–$100K', '$100K–$250K', '$250K–$500K', '$500K+']
const TIMELINES  = ['Ready now', '1–3 months', '3–6 months', '6–12 months', 'Just researching']

function chip(val: string, active: boolean, color = '#14B8A6'): React.CSSProperties {
  return {
    padding: '0.38rem 0.875rem', borderRadius: 20,
    fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : 'rgba(248,250,252,0.55)',
    fontWeight: active ? 600 : 400, transition: 'all 0.12s',
  }
}

export default function SetupDiasporaPage() {
  const router = useRouter()
  const { user, checking } = useAuth()
  const [dark, setDark] = useState(getInitialDark)

  const [residence,  setResidence]  = useState('')
  const [currency,   setCurrency]   = useState('USD')
  const [markets,    setMarkets]    = useState<string[]>([])
  const [goals,      setGoals]      = useState<string[]>([])
  const [budget,     setBudget]     = useState('')
  const [timeline,   setTimeline]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  function toggleMarket(m: string) {
    setMarkets(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])
  }
  function toggleGoal(g: string) {
    setGoals(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])
  }

  async function handleSave() {
    setError('')
    if (!user) return
    setSaving(true)
    try {
      await sb.from('user_profiles').upsert({
        id:                  user.id,
        full_name:           user.user_metadata?.full_name || '',
        email:               user.email || '',
        user_role:           'diaspora',
        country_of_residence: residence,
        preferred_currency:  currency,
        preferred_markets:   markets,
        investment_goals:    goals,
        budget_range_usd:    budget,
        timeline,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'id' })
      router.replace('/search')
    } catch {
      setError('Failed to save. You can update preferences later.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(20,184,166,0.2)', borderTopColor: '#14B8A6', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: 540, width: '100%' }}>

        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#14B8A6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 15, letterSpacing: '-0.03em' }}>Manop</div>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>Email verified ✓ · Diaspora investor</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,4vw,1.9rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
            Set up your investor profile
          </h1>
          <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.6 }}>
            We'll show you USD pricing by default and filter intelligence relevant to your markets.
          </p>
        </div>

        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>🌍 Country of residence</div>
            <input
              style={{ width: '100%', padding: '0.65rem 0.875rem', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1.5px solid ${border}`, borderRadius: 9, color: text, fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
              placeholder="e.g. United Kingdom, United States, Canada…"
              value={residence}
              onChange={e => setResidence(e.target.value)}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>💱 Preferred currency</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CURRENCIES.map(c => <button key={c} onClick={() => setCurrency(c)} style={chip(c, currency === c)}>{c}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>📍 African markets of interest</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {MARKETS.map(m => <button key={m} onClick={() => toggleMarket(m)} style={chip(m, markets.includes(m))}>{m}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>🎯 Investment goals (pick all that apply)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {GOALS.map(g => <button key={g} onClick={() => toggleGoal(g)} style={chip(g, goals.includes(g), '#5B2EFF')}>{g}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>💰 Budget (USD)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {BUDGETS.map(b => <button key={b} onClick={() => setBudget(b)} style={chip(b, budget === b, '#F59E0B')}>{b}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>⏱ Timeline</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {TIMELINES.map(t => <button key={t} onClick={() => setTimeline(t)} style={chip(t, timeline === t, '#22C55E')}>{t}</button>)}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: '0.8rem', color: '#EF4444' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => router.replace('/search')} style={{ flex: 1, background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Skip for now
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: '#14B8A6', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Start exploring →'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}