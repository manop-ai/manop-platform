'use client'
// app/profile/setup-buyer/page.tsx — SPRINT 1
// Post-verification setup for Buyer / Home Buyer accounts.
// Gated by useAuth — must be logged in with user_role = buyer.

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

const CITIES   = ['Lagos', 'Abuja', 'Accra', 'Nairobi', 'Port Harcourt', 'Other']
const BUDGETS  = ['Under ₦50M', '₦50M–100M', '₦100M–200M', '₦200M–500M', '₦500M+']
const TYPES    = ['Apartment', 'Duplex', 'Bungalow', 'Land', 'Any']
const TIMELINES = ['Ready now', '1–3 months', '3–6 months', '6–12 months', 'Just exploring']

function chip(val: string, active: boolean, color = '#5B2EFF'): React.CSSProperties {
  return {
    padding: '0.38rem 0.875rem', borderRadius: 20,
    fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
    background: active ? `${color}18` : 'transparent',
    color: active ? color : 'rgba(248,250,252,0.55)',
    fontWeight: active ? 600 : 400, transition: 'all 0.12s',
  }
}

export default function SetupBuyerPage() {
  const router = useRouter()
  const { user, checking } = useAuth()
  const [dark, setDark] = useState(getInitialDark)

  const [city,     setCity]     = useState('')
  const [budget,   setBudget]   = useState('')
  const [propType, setPropType] = useState('')
  const [timeline, setTimeline] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  async function handleSave() {
    setError('')
    if (!user) return
    setSaving(true)
    try {
      await sb.from('user_profiles').upsert({
        id:            user.id,
        full_name:     user.user_metadata?.full_name || '',
        email:         user.email || '',
        user_role:     'buyer',
        city,
        budget_range:  budget,
        property_type: propType,
        timeline,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'id' })
      router.replace('/search')
    } catch (e: unknown) {
      setError('Failed to save preferences. You can update these later.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 15, letterSpacing: '-0.03em' }}>Manop</div>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>Email verified ✓</div>
          <h1 style={{ fontSize: 'clamp(1.4rem,4vw,1.9rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
            Tell us what you're looking for
          </h1>
          <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.6 }}>
            This helps us show you the most relevant properties and market intelligence.
          </p>
        </div>

        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>📍 Which city?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => <button key={c} onClick={() => setCity(c)} style={chip(c, city === c)}>{c}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>💰 Budget range</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {BUDGETS.map(b => <button key={b} onClick={() => setBudget(b)} style={chip(b, budget === b, '#14B8A6')}>{b}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>🏠 Property type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {TYPES.map(t => <button key={t} onClick={() => setPropType(t)} style={chip(t, propType === t)}>{t}</button>)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: text2, marginBottom: 8 }}>⏱ Buying timeline</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {TIMELINES.map(t => <button key={t} onClick={() => setTimeline(t)} style={chip(t, timeline === t, '#22C55E')}>{t}</button>)}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: '0.8rem', color: '#EF4444' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: '0.5rem' }}>
            <button onClick={() => router.replace('/search')} style={{ flex: 1, background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Skip for now
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Start searching →'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}