'use client'
// app/agency/onboard/page.tsx — REBUILT
// Logic is identical to original (same Supabase inserts, same token flow)
// What changed: tone, copy, visual hierarchy, success screen

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const CITIES    = ['Lagos', 'Abuja', 'Port Harcourt', 'Accra', 'Kumasi', 'Nairobi', 'Kano', 'Ibadan', 'Other']
const PROP_TYPES = ['Residential', 'Commercial', 'Mixed-use', 'Land', 'Industrial']

export default function AgencyOnboard() {
  const [dark, setDark]           = useState(true)
  const router                    = useRouter()
  const [agencyName,  setAgencyName]  = useState('')
  const [contactName, setContactName] = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [website,     setWebsite]     = useState('')
  const [cities,      setCities]      = useState<string[]>([])
  const [propTypes,   setPropTypes]   = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [agree,       setAgree]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)
  const [agencyId,    setAgencyId]    = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Pre-fill from register flow if available
  useEffect(() => {
    if (typeof window === 'undefined') return
    const name  = localStorage.getItem('manop_reg_name')
    const email = localStorage.getItem('manop_reg_email')
    if (name)  setContactName(name)
    if (email) setEmail(email)
  }, [])

  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const card   = dark ? '#111827' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.62)' : 'rgba(15,23,42,0.62)'
  const text3  = dark ? 'rgba(248,250,252,0.3)'  : 'rgba(15,23,42,0.3)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.75rem 0.9rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${border}`, borderRadius: 9,
    color: text, fontSize: '0.9rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }
  const LBL: React.CSSProperties = {
    fontSize: '0.7rem', color: text2, fontWeight: 500,
    display: 'block', marginBottom: '0.35rem',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  function toggleCity(c: string)  { setCities(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]) }
  function toggleType(t: string)  { setPropTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]) }

  async function handleSubmit() {
    if (!agencyName.trim())  { setError('Agency name is required'); return }
    if (!contactName.trim()) { setError('Contact name is required'); return }
    if (!email.trim() || !email.includes('@')) { setError('Valid email is required'); return }
    if (cities.length === 0) { setError('Select at least one city'); return }
    if (!agree)              { setError('Please accept the data accuracy commitment'); return }

    setSaving(true); setError('')
    try {
      const { data: existing } = await sb
        .from('data_partners')
        .select('id, name, contact_email')
        .eq('contact_email', email.trim().toLowerCase())
        .single()

      let partnerId: string

      if (existing) {
        partnerId = existing.id
      } else {
        let ngnRate = 1570
        try {
          const ctrl = new AbortController()
          const tid  = setTimeout(() => ctrl.abort(), 5000)
          const fx   = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal })
          clearTimeout(tid)
          const d = await fx.json()
          if (d?.rates?.NGN) ngnRate = d.rates.NGN
        } catch { /* use fallback */ }

        const { data: partner, error: partnerErr } = await sb.from('data_partners').insert({
          name:          agencyName.trim(),
          contact_email: email.trim().toLowerCase(),
          partner_type:  'agency',
          trust_level:   'agency',
          active:        true,
          cities,
          notes: JSON.stringify({
            contact_name: contactName.trim(),
            phone:        phone.trim() || null,
            website:      website.trim() || null,
            prop_types:   propTypes,
            description:  description.trim() || null,
            fx_at_signup: ngnRate,
            source:       'web_onboard',
          }),
        }).select('id').single()

        if (partnerErr) throw new Error(partnerErr.message)
        partnerId = partner!.id
      }

      const token = generateToken()
      await sb.from('partner_sessions').insert({
        partner_type: 'agency',
        partner_id:   partnerId,
        token,
        email:        email.trim().toLowerCase(),
      })

      localStorage.setItem('manop_agency_token', token)
      localStorage.setItem('manop_agency_id',    partnerId)
      localStorage.setItem('manop_agency_email',  email.trim().toLowerCase())
      localStorage.setItem('manop_agency_name',   agencyName.trim())
      localStorage.removeItem('manop_reg_name')
      localStorage.removeItem('manop_reg_email')
      localStorage.removeItem('manop_reg_type')

      await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'agency_onboarded',
          partner_id:  partnerId,
          metadata: { agency: agencyName.trim(), email: email.trim(), cities },
        }),
      }).catch(() => {})

      setAgencyId(partnerId)
      setSuccess(true)
      setTimeout(() => router.push('/agency/dashboard'), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed. Email partners@manopintel.com')
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ────────────────────────────────────────
  if (success) return (
    <div style={{
      background: bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: text, padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        {/* Badge animation */}
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(91,46,255,0.15) 0%, rgba(20,184,166,0.1) 100%)',
          border: '1px solid rgba(91,46,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem',
          fontSize: '2rem',
        }}>
          ○
        </div>
        <div style={{
          fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6',
          textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem',
        }}>
          Agency registered · Listed badge
        </div>
        <h2 style={{
          fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.04em',
          color: text, marginBottom: '0.75rem', lineHeight: 1.15,
        }}>
          {agencyName || 'Your agency'} is on Manop.
        </h2>
        <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          You've started at <strong style={{ color: text }}>Listed</strong>.
          Add listings, respond to leads, and submit verified sales
          to climb toward Verified, Trust, and Elite.
        </p>

        {/* Badge progress preview */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'center',
          marginBottom: '1.75rem',
        }}>
          {[
            { icon: '○', label: 'Listed',   color: '#5B2EFF', active: true  },
            { icon: '◇', label: 'Verified', color: '#64748B', active: false },
            { icon: '◈', label: 'Trust',    color: '#64748B', active: false },
            { icon: '◆', label: 'Elite',    color: '#64748B', active: false },
          ].map(b => (
            <div key={b.label} style={{ textAlign: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: b.active ? 'rgba(91,46,255,0.12)' : dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${b.active ? 'rgba(91,46,255,0.35)' : border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: b.active ? '#7C5FFF' : text3,
                fontSize: '1rem', margin: '0 auto 4px',
              }}>
                {b.icon}
              </div>
              <div style={{ fontSize: '0.55rem', color: b.active ? '#7C5FFF' : text3, fontWeight: b.active ? 700 : 400 }}>
                {b.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: '0.82rem', color: text2,
        }}>
          <div style={{
            width: 16, height: 16,
            border: '2px solid rgba(91,46,255,0.3)',
            borderTopColor: '#5B2EFF',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          Taking you to your dashboard…
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  // ── Onboard form ─────────────────────────────────────────
  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '2rem 1rem 5rem' }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 15, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Manop</div>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(91,46,255,0.08)', border: '1px solid rgba(91,46,255,0.2)',
            borderRadius: 20, padding: '3px 12px', marginBottom: '1rem',
          }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Agency partner setup
            </span>
          </div>
          <h1 style={{
            fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 800,
            letterSpacing: '-0.04em', color: text,
            lineHeight: 1.1, marginBottom: '0.75rem',
          }}>
            Set up your agency on Manop.
          </h1>
          <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.7, maxWidth: 480 }}>
            Your profile is the foundation of your MAPE score.
            Buyers see your badge before they see your listings.
            Start strong.
          </p>
        </div>

        {/* What you're getting — no pricing language */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          marginBottom: '1.75rem',
        }}>
          {[
            { icon: '◈', label: 'MAPE score from day one' },
            { icon: '◎', label: 'Yield computed on every listing' },
            { icon: '✦', label: 'Verified leads, not tyre-kickers' },
            { icon: '↗', label: 'Rise from Listed to Elite' },
          ].map(w => (
            <div key={w.label} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '0.65rem 0.875rem',
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 9,
            }}>
              <span style={{ fontSize: '0.85rem', color: '#5B2EFF', flexShrink: 0, fontWeight: 700 }}>{w.icon}</span>
              <span style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.4 }}>{w.label}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Agency name *</label>
              <input
                style={INP} placeholder="Your agency's registered name"
                value={agencyName} onChange={e => setAgencyName(e.target.value)}
                autoFocus
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
            <div>
              <label style={LBL}>Your name *</label>
              <input
                style={INP} placeholder="Full name"
                value={contactName} onChange={e => setContactName(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
            <div>
              <label style={LBL}>Work email *</label>
              <input
                style={INP} type="email" placeholder="you@agency.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
            <div>
              <label style={LBL}>WhatsApp / phone</label>
              <input
                style={INP} type="tel" placeholder="+234 800 000 0000"
                value={phone} onChange={e => setPhone(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Website (optional)</label>
              <input
                style={INP} placeholder="https://youragency.com"
                value={website} onChange={e => setWebsite(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>About your agency (optional)</label>
            <textarea
              style={{ ...INP, minHeight: 64, resize: 'vertical' as const }}
              placeholder="Markets you specialise in, years of operation, what sets you apart…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
              onBlur={e => (e.target.style.borderColor = border)}
            />
          </div>

          {/* Cities */}
          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>Cities you operate in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => {
                const on = cities.includes(c)
                return (
                  <button key={c} onClick={() => toggleCity(c)} style={{
                    padding: '0.38rem 0.875rem', borderRadius: 20,
                    fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${on ? '#5B2EFF' : border}`,
                    background: on ? (dark ? 'rgba(91,46,255,0.14)' : 'rgba(91,46,255,0.07)') : 'transparent',
                    color: on ? '#7C5FFF' : text2,
                    fontWeight: on ? 600 : 400,
                    transition: 'all 0.12s',
                  }}>{c}</button>
                )
              })}
            </div>
          </div>

          {/* Property types */}
          <div style={{ marginBottom: 18 }}>
            <label style={LBL}>Property types</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {PROP_TYPES.map(t => {
                const on = propTypes.includes(t)
                return (
                  <button key={t} onClick={() => toggleType(t)} style={{
                    padding: '0.38rem 0.875rem', borderRadius: 20,
                    fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${on ? '#14B8A6' : border}`,
                    background: on ? (dark ? 'rgba(20,184,166,0.12)' : 'rgba(20,184,166,0.07)') : 'transparent',
                    color: on ? '#14B8A6' : text2,
                    fontWeight: on ? 600 : 400,
                    transition: 'all 0.12s',
                  }}>{t}</button>
                )
              })}
            </div>
          </div>

          {/* Data accuracy commitment */}
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 9, border: `1px solid ${border}`, marginBottom: 18,
            cursor: 'pointer',
          }}
            onClick={() => setAgree(a => !a)}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
              border: `1.5px solid ${agree ? '#5B2EFF' : border}`,
              background: agree ? '#5B2EFF' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              {agree && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, userSelect: 'none' }}>
              I commit to listing only real properties with accurate prices.
              I understand that inaccurate or misleading listings affect my MAPE score
              and may result in removal from the platform.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, padding: '0.7rem 0.875rem',
              fontSize: '0.8rem', color: '#EF4444', marginBottom: 14, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: '100%', height: 50,
              background: '#5B2EFF', color: '#fff', border: 'none',
              borderRadius: 10, fontSize: '0.95rem', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit',
              opacity: saving ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.2s',
            }}
          >
            {saving ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                Setting up your profile…
              </>
            ) : (
              'Complete setup →'
            )}
          </button>
        </div>

        <p style={{ fontSize: '0.72rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Already registered?{' '}
          <Link href="/agency/dashboard" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>
            Go to dashboard →
          </Link>
          {' · '}
          Questions? <span style={{ color: '#14B8A6' }}>partners@manopintel.com</span>
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}