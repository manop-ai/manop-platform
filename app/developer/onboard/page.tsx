'use client'
// app/developer/onboard/page.tsx — REBUILT FOR SPRINT 1
// Mirrors agency/onboard. Uses useAuth(). No PIN. No custom tokens.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import { ManopLogoSVG } from '@/components/ManopLogo'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Accra', 'Nairobi', 'Kano', 'Ibadan', 'Other']
const PROJECT_SCALES = ['1–5 units', '6–20 units', '21–100 units', '100+ units']

const LBL: React.CSSProperties = {
  fontSize: '0.73rem', fontWeight: 600,
  color: 'rgba(248,250,252,0.65)',
  display: 'block', marginBottom: 5,
}

export default function DeveloperOnboardPage() {
  const router = useRouter()
  const { user, checking } = useAuth('developer')
  const [dark, setDark] = useState(true)

  const [companyName,   setCompanyName]   = useState('')
  const [contactName,   setContactName]   = useState('')
  const [email,         setEmail]         = useState('')
  const [phone,         setPhone]         = useState('')
  const [website,       setWebsite]       = useState('')
  const [description,   setDescription]   = useState('')
  const [cities,        setCities]        = useState<string[]>([])
  const [projectScale,  setProjectScale]  = useState('')
  const [agree,         setAgree]         = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => {
    if (user) {
      setContactName(user.user_metadata?.full_name || '')
      setEmail(user.email || '')
    }
  }, [user])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const card   = dark ? '#162032' : '#FFFFFF'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.875rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`, borderRadius: 8,
    color: text, fontSize: '0.875rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  }

  function toggleCity(c: string) {
    setCities(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  async function handleSubmit() {
    setError('')
    if (!companyName.trim()) { setError('Company name is required.'); return }
    if (!contactName.trim()) { setError('Your name is required.'); return }
    if (cities.length === 0) { setError('Select at least one city.'); return }
    if (!agree) { setError('Please agree to the data commitment.'); return }
    if (!user) { setError('Session expired. Please sign in again.'); return }

    setSaving(true)
    try {
      const { data: updated, error: updateErr } = await sb.from('developer_accounts')
        .update({
          company_name:   companyName.trim(),
          contact_name:   contactName.trim(),
          email:          email.trim().toLowerCase(),
          phone:          phone.trim() || null,
          website:        website.trim() || null,
          description:    description.trim() || null,
          cities,
          project_scale:  projectScale || null,
          active:         true,
          updated_at:     new Date().toISOString(),
        })
        .eq('auth_user_id', user.id)
        .select('id')
        .maybeSingle()

      if (updateErr) {
        throw new Error(updateErr.message)
      }

      if (!updated) {
        const { error: insertErr } = await sb.from('developer_accounts').insert({
          auth_user_id:   user.id,
          company_name:   companyName.trim(),
          contact_name:   contactName.trim(),
          email:          email.trim().toLowerCase(),
          phone:          phone.trim() || null,
          website:        website.trim() || null,
          description:    description.trim() || null,
          cities,
          project_scale:  projectScale || null,
          active:         true,
          verified:       false,
          created_at:     new Date().toISOString(),
        })
        if (insertErr) throw new Error(insertErr.message)
      }

      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'developer_onboarded',
          metadata: { company: companyName.trim() },
        }),
      }).catch(() => {})

      router.replace('/developer/dashboard')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(245,158,11,0.2)', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '2rem 1rem 5rem' }}>

        {/* LOGO — real SVG, not the purple M square */}
        <Link href="/" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: '2.5rem' }}>
          <ManopLogoSVG height={80} dark={dark} showText />
        </Link>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '3px 12px', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Developer setup</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.75rem' }}>
            Set up your developer profile.
          </h1>
          <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.7 }}>
            Showcase your projects, track unit sales, and earn MAPE points for data transparency.
          </p>
        </div>

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>Company / development name *</label>
              <input style={INP} placeholder="e.g. Greenfield Developments Ltd" value={companyName}
                onChange={e => setCompanyName(e.target.value)} autoFocus
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Your name *</label>
              <input style={INP} placeholder="Full name" value={contactName}
                onChange={e => setContactName(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Work email *</label>
              <input style={INP} type="email" placeholder="you@company.com" value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Phone / sales contact</label>
              <input style={INP} type="tel" placeholder="+234 800 000 0000" value={phone}
                onChange={e => setPhone(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>Website (optional)</label>
              <input style={INP} placeholder="https://yourdevelopment.com" value={website}
                onChange={e => setWebsite(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>About your company (optional)</label>
              <textarea
                style={{ ...INP, minHeight: 64, resize: 'vertical' as const }}
                placeholder="Track record, specialties, key projects…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>Cities you develop in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => {
                const on = cities.includes(c)
                return (
                  <button key={c} onClick={() => toggleCity(c)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#F59E0B' : border}`, background: on ? 'rgba(245,158,11,0.12)' : 'transparent', color: on ? '#F59E0B' : text2, fontWeight: on ? 600 : 400, transition: 'all 0.12s' }}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={LBL}>Typical project scale (optional)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {PROJECT_SCALES.map(s => {
                const on = projectScale === s
                return (
                  <button key={s} onClick={() => setProjectScale(on ? '' : s)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#5B2EFF' : border}`, background: on ? 'rgba(91,46,255,0.12)' : 'transparent', color: on ? '#7C5FFF' : text2, fontWeight: on ? 600 : 400, transition: 'all 0.12s' }}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div onClick={() => setAgree(a => !a)}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 9, border: `1px solid ${border}`, marginBottom: 18, cursor: 'pointer' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1.5px solid ${agree ? '#F59E0B' : border}`, background: agree ? '#F59E0B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {agree && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, userSelect: 'none' as const }}>
              I commit to keeping project and unit data accurate. Sale data I submit contributes to Manop's market intelligence — individual buyer details are never shown publicly.
            </span>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginBottom: 14, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', height: 50, background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? (
              <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Setting up…</>
            ) : 'Complete setup →'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}