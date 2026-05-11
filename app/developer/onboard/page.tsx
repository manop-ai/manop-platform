'use client'
// app/developer/onboard/page.tsx — REBUILT
// Logic identical to original (same Supabase inserts, same token flow)
// Changed: tone, copy, visual hierarchy, success screen
// "Free forever" removed. Developer value framed around pipeline intelligence + MAPE.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

const CITIES = [
  'Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan',
  'Accra', 'Kumasi', 'Nairobi', 'Mombasa', 'Other',
]

const PROJECT_SCALES = [
  'Under 20 units',
  '20–50 units',
  '50–150 units',
  '150–500 units',
  '500+ units',
]

export default function DeveloperOnboard() {
  const [dark, setDark]               = useState(true)
  const router                        = useRouter()
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [website,     setWebsite]     = useState('')
  const [cities,      setCities]      = useState<string[]>([])
  const [projectScale, setProjectScale] = useState('')
  const [agree,       setAgree]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)
  const [devCompany,  setDevCompany]  = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Pre-fill from register flow if user came via /register
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

  function toggleCity(c: string) {
    setCities(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  async function handleSubmit() {
    if (!companyName.trim()) { setError('Company name is required'); return }
    if (!contactName.trim()) { setError('Contact name is required'); return }
    if (!email.trim() || !email.includes('@')) { setError('Valid email is required'); return }
    if (cities.length === 0) { setError('Select at least one city of operation'); return }
    if (!agree)              { setError('Please accept the data commitment'); return }

    setSaving(true); setError('')

    try {
      // Check if already registered
      const { data: existing } = await sb
        .from('developer_accounts')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .single()

      if (existing) {
        // Already exists — create new session and go to dashboard
        const token = generateToken()
        await sb.from('partner_sessions').insert({
          partner_type: 'developer',
          partner_id:   existing.id,
          token,
          email:        email.trim().toLowerCase(),
        })
        localStorage.setItem('manop_dev_token', token)
        localStorage.setItem('manop_dev_id',    existing.id)
        localStorage.setItem('manop_dev_email', email.trim().toLowerCase())
        localStorage.removeItem('manop_reg_name')
        localStorage.removeItem('manop_reg_email')
        localStorage.removeItem('manop_reg_type')
        router.push('/developer/dashboard')
        return
      }

      // Create new developer account
      const { data: account, error: accErr } = await sb
        .from('developer_accounts')
        .insert({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          email:        email.trim().toLowerCase(),
          phone:        phone.trim() || null,
          website:      website.trim() || null,
          cities,
          active:       true,
          verified:     false,
          raw_data: {
            project_scale: projectScale || null,
            source:        'web_onboard',
          },
        })
        .select('id')
        .single()

      if (accErr) throw new Error(accErr.message)

      // Session token
      const token = generateToken()
      await sb.from('partner_sessions').insert({
        partner_type: 'developer',
        partner_id:   account!.id,
        token,
        email:        email.trim().toLowerCase(),
      })

      // Signal (non-blocking)
      fetch('/api/signals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'developer_registered',
          metadata: {
            company: companyName.trim(),
            email:   email.trim(),
            cities,
            project_scale: projectScale || null,
          },
        }),
      }).catch(() => {})

      // Persist session
      localStorage.setItem('manop_dev_token',   token)
      localStorage.setItem('manop_dev_id',       account!.id)
      localStorage.setItem('manop_dev_email',    email.trim().toLowerCase())
      localStorage.setItem('manop_dev_company',  companyName.trim())
      localStorage.removeItem('manop_reg_name')
      localStorage.removeItem('manop_reg_email')
      localStorage.removeItem('manop_reg_type')

      setDevCompany(companyName.trim())
      setSuccess(true)
      setTimeout(() => router.push('/developer/dashboard'), 2500)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────
  if (success) return (
    <div style={{
      background: bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: text, padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>

        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(91,46,255,0.08) 100%)',
          border: '1px solid rgba(245,158,11,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1.5rem',
          fontSize: '2rem',
        }}>
          🏗️
        </div>

        <div style={{
          fontSize: '0.6rem', fontWeight: 700, color: '#F59E0B',
          textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem',
        }}>
          Developer registered · Listed badge
        </div>

        <h2 style={{
          fontSize: '1.6rem', fontWeight: 800,
          letterSpacing: '-0.04em', color: text,
          marginBottom: '0.75rem', lineHeight: 1.15,
        }}>
          {devCompany || 'Your company'} is on Manop.
        </h2>

        <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Add your projects, track your unit sales, and submit completed sale data
          to earn your MAPE score. Buyers on Manop see your badge before your brochure.
        </p>

        {/* Badge ladder — developer starts at Listed */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: '1.75rem' }}>
          {[
            { icon: '○', label: 'Listed',   color: '#F59E0B', active: true  },
            { icon: '◇', label: 'Verified', color: '#64748B', active: false },
            { icon: '◈', label: 'Trust',    color: '#64748B', active: false },
            { icon: '◆', label: 'Elite',    color: '#64748B', active: false },
          ].map(b => (
            <div key={b.label} style={{ textAlign: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: b.active
                  ? 'rgba(245,158,11,0.12)'
                  : dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                border: `1px solid ${b.active ? 'rgba(245,158,11,0.35)' : border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: b.active ? '#F59E0B' : text3,
                fontSize: '1rem', margin: '0 auto 4px',
              }}>
                {b.icon}
              </div>
              <div style={{
                fontSize: '0.55rem',
                color: b.active ? '#F59E0B' : text3,
                fontWeight: b.active ? 700 : 400,
              }}>
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
            width: 16, height: 16, flexShrink: 0,
            border: '2px solid rgba(245,158,11,0.3)',
            borderTopColor: '#F59E0B',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          Taking you to your dashboard…
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  // ── Onboard form ────────────────────────────────────────────
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
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 20, padding: '3px 12px', marginBottom: '1rem',
          }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Developer partner setup
            </span>
          </div>
          <h1 style={{
            fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 800,
            letterSpacing: '-0.04em', color: text,
            lineHeight: 1.1, marginBottom: '0.75rem',
          }}>
            Set up your developer profile on Manop.
          </h1>
          <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.7, maxWidth: 480 }}>
            Your profile anchors your MAPE score. Buyers see your badge, your completion record,
            and your verified sales before they request a brochure.
            Start with the details. Build from there.
          </p>
        </div>

        {/* What you're getting */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: '1.75rem' }}>
          {[
            { icon: '◈', label: 'MAPE score tracked from day one'          },
            { icon: '◎', label: 'Unit tracker — available, reserved, sold' },
            { icon: '↗', label: 'Pipeline from inquiry to closed deal'     },
            { icon: '◆', label: 'Submit sales data, earn Elite badge'      },
          ].map(w => (
            <div key={w.label} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '0.65rem 0.875rem',
              background: card, border: `1px solid ${border}`, borderRadius: 9,
            }}>
              <span style={{ fontSize: '0.85rem', color: '#F59E0B', flexShrink: 0, fontWeight: 700 }}>{w.icon}</span>
              <span style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.4 }}>{w.label}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Company / development firm *</label>
              <input
                style={INP}
                placeholder="Your registered company name"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                autoFocus
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            <div>
              <label style={LBL}>Your name *</label>
              <input
                style={INP}
                placeholder="Full name"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            <div>
              <label style={LBL}>Work email *</label>
              <input
                style={INP}
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            <div>
              <label style={LBL}>Phone / WhatsApp</label>
              <input
                style={INP}
                type="tel"
                placeholder="+234 800 000 0000"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Website (optional)</label>
              <input
                style={INP}
                placeholder="https://yourcompany.com"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#F59E0B')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
          </div>

          {/* Cities */}
          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>Cities you develop in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => {
                const on = cities.includes(c)
                return (
                  <button
                    key={c}
                    onClick={() => toggleCity(c)}
                    style={{
                      padding: '0.38rem 0.875rem', borderRadius: 20,
                      fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${on ? '#F59E0B' : border}`,
                      background: on
                        ? (dark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.07)')
                        : 'transparent',
                      color: on ? '#F59E0B' : text2,
                      fontWeight: on ? 600 : 400,
                      transition: 'all 0.12s',
                    }}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Typical project scale */}
          <div style={{ marginBottom: 18 }}>
            <label style={LBL}>Typical project scale (optional)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {PROJECT_SCALES.map(s => {
                const on = projectScale === s
                return (
                  <button
                    key={s}
                    onClick={() => setProjectScale(on ? '' : s)}
                    style={{
                      padding: '0.38rem 0.875rem', borderRadius: 20,
                      fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${on ? '#5B2EFF' : border}`,
                      background: on
                        ? (dark ? 'rgba(91,46,255,0.12)' : 'rgba(91,46,255,0.07)')
                        : 'transparent',
                      color: on ? '#7C5FFF' : text2,
                      fontWeight: on ? 600 : 400,
                      transition: 'all 0.12s',
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Data commitment */}
          <div
            style={{
              display: 'flex', gap: 10, alignItems: 'flex-start',
              padding: '0.875rem',
              background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 9, border: `1px solid ${border}`,
              marginBottom: 18, cursor: 'pointer',
            }}
            onClick={() => setAgree(a => !a)}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
              border: `1.5px solid ${agree ? '#F59E0B' : border}`,
              background: agree ? '#F59E0B' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              {agree && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, userSelect: 'none' as const }}>
              I commit to keeping project and unit data accurate.
              I understand that sale data I submit contributes to Manop's market intelligence
              and is used to compute neighbourhood benchmarks — individual buyer details are never shown publicly.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, padding: '0.7rem 0.875rem',
              fontSize: '0.8rem', color: '#EF4444',
              marginBottom: 14, lineHeight: 1.5,
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
              background: '#F59E0B', color: '#fff', border: 'none',
              borderRadius: 10, fontSize: '0.95rem', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'opacity 0.2s',
            }}
          >
            {saving ? (
              <>
                <div style={{
                  width: 16, height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Setting up your profile…
              </>
            ) : (
              'Complete setup →'
            )}
          </button>
        </div>

        <p style={{ fontSize: '0.72rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Already registered?{' '}
          <Link href="/developer/dashboard" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>
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