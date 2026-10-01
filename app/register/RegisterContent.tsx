'use client'
// app/register/RegisterContent.tsx — REBUILT FOR SPRINT 1
//
// ROOT CAUSE OF OLD SYSTEM:
// Registration collected name + email only — no password.
// This made it impossible for /login (signInWithPassword) to ever work.
//
// NEW ARCHITECTURE:
// Step 1: Select account type
// Step 2: Name + email + password → sb.auth.signUp() → profile insert → "Check your email"
// Step 3: User verifies email → /verify → routed to correct setup page
//
// ONE system. No custom tokens. No localStorage auth hacks.

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../lib/theme'
import ManopLogo from '../../components/ManopLogo'

type AccountType = 'buyer' | 'diaspora' | 'agency' | 'developer'

const ACCOUNT_TYPES: { key: AccountType; label: string; sub: string; icon: string; color: string }[] = [
  { key: 'buyer',     label: 'Home Buyer',       sub: 'Find and evaluate properties',        icon: '🏠', color: '#5B2EFF' },
  { key: 'diaspora',  label: 'Diaspora Investor', sub: 'Invest from abroad — USD pricing',    icon: '🌍', color: '#14B8A6' },
  { key: 'agency',    label: 'Agency',            sub: 'List properties, track leads, earn MAPE', icon: '🏢', color: '#7C5FFF' },
  { key: 'developer', label: 'Developer',         sub: 'Showcase projects, track unit sales', icon: '🏗️', color: '#F59E0B' },
]

export default function RegisterContent() {
  const router       = useRouter()
  const params       = useSearchParams()
  const [dark, setDark] = useState(getInitialDark)
  const [step, setStep] = useState<1 | 2>(1)
  const [type, setType] = useState<AccountType | null>(
    (params.get('type') as AccountType | null) || null
  )

  // Form fields
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  // State
  const [saving, setSaving]   = useState(false)
  const [error,  setError]    = useState('')
  const [done,   setDone]     = useState(false)

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  // Auto-advance to step 2 if type passed in URL
  useEffect(() => {
    if (params.get('type') && ACCOUNT_TYPES.find(t => t.key === params.get('type'))) {
      setStep(2)
    }
  }, [params])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.75rem 0.875rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`, borderRadius: 9,
    color: text, fontSize: '0.9rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  const selectedType = ACCOUNT_TYPES.find(t => t.key === type)

  async function handleRegister() {
    setError('')
    const cleanName  = name.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanName)  { setError('Please enter your full name.'); return }
    if (!cleanEmail || !cleanEmail.includes('@')) { setError('Enter a valid email address.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (!type) { setError('Please select an account type.'); return }

    setSaving(true)
    try {
      // Step 1: Create Supabase Auth user with role in metadata
      const redirectUrl = `${window.location.origin}/verify`
      const { data: authData, error: authErr } = await sb.auth.signUp({
        email:    cleanEmail,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name:  cleanName,
            user_role:  type,
          },
        },
      })

      if (authErr) {
        if (authErr.message.includes('already registered')) {
          setError('An account with this email already exists. Sign in at /login or reset your password.')
        } else {
          setError(authErr.message)
        }
        setSaving(false)
        return
      }

      if (!authData.user) {
        setError('Something went wrong. Please try again.')
        setSaving(false)
        return
      }

      const userId = authData.user.id

      // Step 2: Insert into the correct profile table
      // Use the anon key here — RLS allows user to insert their own row
      if (type === 'buyer' || type === 'diaspora') {
        await sb.from('user_profiles').insert({
          id:         userId,
          full_name:  cleanName,
          email:      cleanEmail,
          user_role:  type,
          created_at: new Date().toISOString(),
        })
        // Ignore error — profile can be created later in setup flow
      }

      // Agency and developer profile rows are created later during onboarding,
      // after the user verifies their email and signs in.

      // Log the registration signal
      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'user_registered',
          metadata: { type, email: cleanEmail },
        }),
      }).catch(() => {})

      setDone(true)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Done state — "Check your email" ──────────────────────────
  if (done) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'rgba(91,46,255,0.1)', border: '1.5px solid rgba(91,46,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2rem' }}>
          📬
        </div>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem' }}>
          Account created
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.04em', color: text, marginBottom: '0.875rem', lineHeight: 1.1 }}>
          Check your email
        </h1>
        <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.7, marginBottom: '2rem' }}>
          We sent a verification link to <strong style={{ color: text }}>{email}</strong>.
          Click the link in that email to activate your account and set up your profile.
        </p>
        <div style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', fontSize: '0.8rem', color: text2, lineHeight: 1.6, marginBottom: '1.5rem' }}>
          <strong style={{ color: text }}>Didn't get it?</strong> Check your spam folder. The email comes from Supabase on behalf of Manop.
        </div>
        <Link href="/login" style={{ fontSize: '0.82rem', color: text3, textDecoration: 'none' }}>
          Already verified? Sign in →
        </Link>
      </div>
    </div>
  )

  // ── Step 1: Account type selector ────────────────────────────
  if (step === 1) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <Link href="/" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: '2.5rem' }}>
          <ManopLogo height={80} dark={dark} />
        </Link>

        <h1 style={{ fontSize: 'clamp(1.5rem,4vw,2rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
          Create your account
        </h1>
        <p style={{ fontSize: '0.88rem', color: text2, lineHeight: 1.6, marginBottom: '2rem' }}>
          What brings you to Manop?
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
          {ACCOUNT_TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => { setType(t.key); setStep(2) }}
              style={{
                background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1.5px solid ${border}`,
                borderRadius: 12, padding: '1.25rem',
                cursor: 'pointer', textAlign: 'left',
                fontFamily: 'inherit', color: text,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = t.color
                e.currentTarget.style.background = `${t.color}10`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = border
                e.currentTarget.style.background = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ fontSize: '1.4rem', marginBottom: '0.6rem' }}>{t.icon}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: text, marginBottom: '0.3rem' }}>{t.label}</div>
              <div style={{ fontSize: '0.72rem', color: text3, lineHeight: 1.4 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        <p style={{ fontSize: '0.78rem', color: text3, textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Sign in →</Link>
        </p>
      </div>
    </div>
  )

  // ── Step 2: Registration form ─────────────────────────────────
  return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 440, width: '100%' }}>

        <Link href="/" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: '2.5rem' }}>
          <ManopLogo height={80} dark={dark} />
        </Link>

        {/* Type badge */}
        {selectedType && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.5rem' }}>
            <button
              onClick={() => setStep(1)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: `${selectedType.color}12`,
                border: `1px solid ${selectedType.color}30`,
                borderRadius: 20, padding: '4px 12px',
                cursor: 'pointer', color: selectedType.color,
                fontSize: '0.72rem', fontWeight: 700,
                fontFamily: 'inherit',
              }}
            >
              {selectedType.icon} {selectedType.label} · Change ↗
            </button>
          </div>
        )}

        <h1 style={{ fontSize: 'clamp(1.4rem,3.5vw,1.8rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
          Create your account
        </h1>
        <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          You'll verify your email before accessing your dashboard.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: text2, marginBottom: 5 }}>
              Full name *
            </label>
            <input
              style={INP}
              placeholder="Your full name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              onFocus={e => (e.target.style.borderColor = selectedType?.color || '#5B2EFF')}
              onBlur={e => (e.target.style.borderColor = border)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: text2, marginBottom: 5 }}>
              Email address *
            </label>
            <input
              style={INP}
              type="email"
              placeholder={type === 'agency' || type === 'developer' ? 'you@company.com' : 'you@email.com'}
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={e => (e.target.style.borderColor = selectedType?.color || '#5B2EFF')}
              onBlur={e => (e.target.style.borderColor = border)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: text2, marginBottom: 5 }}>
              Password * <span style={{ color: text3, fontWeight: 400 }}>(min 8 characters)</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...INP, paddingRight: '3rem' }}
                type={showPass ? 'text' : 'password'}
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                onFocus={e => (e.target.style.borderColor = selectedType?.color || '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: text3, fontSize: '0.75rem', padding: 0, fontFamily: 'inherit' }}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginTop: 14, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleRegister}
          disabled={saving}
          style={{
            width: '100%', marginTop: 16, height: 50,
            background: selectedType?.color || '#5B2EFF',
            color: '#fff', border: 'none', borderRadius: 10,
            fontSize: '0.95rem', fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
            opacity: saving ? 0.75 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? (
            <>
              <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
              Creating account…
            </>
          ) : 'Create account →'}
        </button>

        <p style={{ fontSize: '0.72rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Sign in →</Link>
        </p>

        <p style={{ fontSize: '0.68rem', color: text3, textAlign: 'center', marginTop: '0.75rem', lineHeight: 1.6 }}>
          By registering you agree to our data commitment: accurate listings only, no fake properties.
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}