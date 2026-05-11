'use client'
// app/profile/setup-investor/page.tsx
// Step 2 onboarding for Buyer / Investor accounts
// Collects: country, city, budget, property interest, local vs diaspora, preferred markets

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom', 'United States', 'Canada', 'UAE', 'Other']
const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Nigeria:          ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Other'],
  Ghana:            ['Accra', 'Kumasi', 'Tema', 'Other'],
  Kenya:            ['Nairobi', 'Mombasa', 'Kisumu', 'Other'],
  'South Africa':   ['Cape Town', 'Johannesburg', 'Durban', 'Other'],
  default:          ['Other'],
}
const MARKETS = ['Lagos', 'Abuja', 'Accra', 'Nairobi', 'Port Harcourt', 'Kumasi', 'Mombasa']
const PROPERTY_TYPES = ['Apartment', 'Detached House', 'Townhouse', 'Land / Plot', 'Commercial', 'Short-let / STR', 'Off-plan']
const GOALS = [
  { value: 'capital_growth', label: '📈 Capital growth', sub: 'Buy and hold for appreciation' },
  { value: 'rental_income',  label: '🏦 Rental income',  sub: 'Generate monthly/annual yield' },
  { value: 'own_use',        label: '🏡 Own use',         sub: 'Personal residence' },
  { value: 'mixed',          label: '⚡ Mixed strategy',  sub: 'Combination of the above' },
]
const TIMELINES = ['0–6 months', '6–12 months', '1–2 years', '2+ years']
const BUDGET_RANGES = [
  { label: '₦0 – ₦50M', min: 0, max: 50_000_000 },
  { label: '₦50M – ₦150M', min: 50_000_000, max: 150_000_000 },
  { label: '₦150M – ₦500M', min: 150_000_000, max: 500_000_000 },
  { label: '₦500M – ₦1B', min: 500_000_000, max: 1_000_000_000 },
  { label: '₦1B+', min: 1_000_000_000, max: null },
  { label: '$100K – $300K USD', min: null, max: null },
  { label: '$300K – $1M USD', min: null, max: null },
  { label: '$1M+ USD', min: null, max: null },
]

export default function SetupInvestorPage() {
  const [dark, setDark] = useState(true)
  const router = useRouter()

  const [country, setCountry]           = useState('')
  const [city, setCity]                 = useState('')
  const [budgetLabel, setBudgetLabel]   = useState('')
  const [interests, setInterests]       = useState<string[]>([])
  const [locationType, setLocationType] = useState<'local' | 'diaspora' | ''>('')
  const [markets, setMarkets]           = useState<string[]>([])
  const [goal, setGoal]                 = useState('')
  const [timeline, setTimeline]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Auth guard
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) router.push('/register')
    })
  }, [router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'

  const SEL: React.CSSProperties = {
    width: '100%', padding: '0.7rem 1rem',
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 10, color: text,
    fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit',
  }

  const LBL: React.CSSProperties = {
    fontSize: '0.72rem', color: text2, fontWeight: 600,
    display: 'block', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.04em',
  }

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  function chip(label: string, active: boolean, color = '#5B2EFF') {
    return {
      padding: '0.35rem 0.875rem',
      borderRadius: 20,
      fontSize: '0.78rem',
      cursor: 'pointer',
      fontFamily: 'inherit',
      fontWeight: active ? 600 : 400,
      border: `1.5px solid ${active ? color : border}`,
      background: active ? (dark ? `rgba(91,46,255,0.15)` : `rgba(91,46,255,0.07)`) : 'transparent',
      color: active ? color : text2,
    } as React.CSSProperties
  }

  async function handleSave() {
    if (!country) { setError('Please select your country'); return }
    if (!locationType) { setError('Are you a local or diaspora investor?'); return }
    if (!goal) { setError('Please select your investment goal'); return }

    setSaving(true); setError('')
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const budget = BUDGET_RANGES.find(b => b.label === budgetLabel)

      const { error: err } = await sb.from('investor_profiles').upsert({
        user_id:           user.id,
        country,
        city:              city || null,
        budget_min:        budget?.min ?? null,
        budget_max:        budget?.max ?? null,
        property_interest: interests,
        location_type:     locationType,
        preferred_markets: markets,
        investment_goal:   goal,
        timeline:          timeline || null,
        updated_at:        new Date().toISOString(),
      }, { onConflict: 'user_id' })

      if (err) throw new Error(err.message)

      // Log signal
      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'investor_profile_completed',
          metadata: { country, goal, markets, location_type: locationType },
        }),
      }).catch(() => {})

      router.push('/search')
    } catch (e: any) {
      setError(e.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const availableCities = country ? (CITIES_BY_COUNTRY[country] || CITIES_BY_COUNTRY.default) : []

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, padding: '2rem 1rem 4rem' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff' }}>✓</div>
          <div style={{ flex: 1, height: 2, background: '#22C55E', borderRadius: 2 }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: '#fff' }}>2</div>
          <div style={{ flex: 1, height: 2, background: border, borderRadius: 2 }} />
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, color: text3 }}>3</div>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.4rem' }}>
          Tell us about yourself
        </h1>
        <p style={{ fontSize: '0.875rem', color: text2, marginBottom: '1.75rem', lineHeight: 1.55 }}>
          This helps us show you the most relevant properties and market intelligence.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Location */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              📍 Your location
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LBL}>Country</label>
                <select style={SEL} value={country} onChange={e => { setCountry(e.target.value); setCity('') }}>
                  <option value="">Select country</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>City (optional)</label>
                <select style={SEL} value={city} onChange={e => setCity(e.target.value)} disabled={!country}>
                  <option value="">Select city</option>
                  {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Local vs Diaspora */}
            <div style={{ marginTop: '1rem' }}>
              <label style={LBL}>I am a…</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['local', 'diaspora'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setLocationType(t)}
                    style={chip(t, locationType === t, '#22C55E')}
                  >
                    {t === 'local' ? '🇳🇬 Local investor' : '✈️ Diaspora investor'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Investment goal */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              🎯 Investment goal
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  style={{
                    padding: '0.75rem',
                    background: goal === g.value ? (dark ? 'rgba(91,46,255,0.12)' : 'rgba(91,46,255,0.07)') : (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    border: `1.5px solid ${goal === g.value ? '#5B2EFF' : border}`,
                    borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: goal === g.value ? '#7C5FFF' : text, marginBottom: 2 }}>{g.label}</div>
                  <div style={{ fontSize: '0.62rem', color: text3 }}>{g.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              💰 Budget range
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {BUDGET_RANGES.map(b => (
                <button key={b.label} onClick={() => setBudgetLabel(b.label)} style={chip(b.label, budgetLabel === b.label)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Property types */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              🏠 Property interest
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {PROPERTY_TYPES.map(t => (
                <button key={t} onClick={() => setInterests(p => toggle(p, t))} style={chip(t, interests.includes(t), '#14B8A6')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Preferred markets */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              🗺️ Preferred markets
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {MARKETS.map(m => (
                <button key={m} onClick={() => setMarkets(p => toggle(p, m))} style={chip(m, markets.includes(m), '#F59E0B')}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#14B8A6', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
              ⏱ Buying timeline
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {TIMELINES.map(t => (
                <button key={t} onClick={() => setTimeline(t)} style={chip(t, timeline === t, '#22C55E')}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginTop: '1rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem' }}>
          <button
            onClick={() => router.push('/search')}
            style={{ flex: 1, background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 2, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Complete setup →'}
          </button>
        </div>
      </div>
    </div>
  )
}