'use client'
// app/register/RegisterContent.tsx — REBUILT FROM SCRATCH
//
// THREE PROBLEMS SOLVED PERMANENTLY:
//
// PROBLEM 1 — "Redirects to search/dashboard immediately on load"
// Every version had a useEffect that checked localStorage on mount.
// If manop_user_email, manop_agency_id, or manop_dev_id existed from
// any previous session or test, it fired router.push() before the user
// could see the form. This is REMOVED ENTIRELY. Register is a public
// page. We never auto-redirect away from a page the user chose to visit.
//
// PROBLEM 2 — "Shaking / flickering on click"
// The previous CTA button was disabled={loading || success} but the
// label was changing on every state change causing layout shift.
// Also, the form was re-rendering on every keystroke because all state
// lived in one component and the account type grid re-rendered with it.
// Fixed by stable button sizing and removing unnecessary re-renders.
//
// PROBLEM 3 — "Should go to setup page per type"
// Agency   → /agency/onboard    (EXISTS in codebase ✓)
// Developer → /developer/onboard (EXISTS in codebase ✓)
// Buyer    → /search             (investor setup page not built yet)
// Diaspora → /search             (investor setup page not built yet)
// When investor/diaspora setup pages are built, just update the
// POST_REGISTER_ROUTES map below — nothing else changes.
//
// DESIGN CHANGE: Account type is now a clean LIST not a button grid.
// User clicks once to select type, form adjusts, they fill name/email,
// submit. One flow. No confusion.

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ── Account types (clean, no research/partner clutter) ────────
type AccountType = 'buyer' | 'diaspora' | 'agency' | 'developer' | ''

interface AccountOption {
  value:    AccountType
  icon:     string
  label:    string
  sub:      string
  color:    string
  redirect: string
}

const ACCOUNT_OPTIONS: AccountOption[] = [
  {
    value:    'buyer',
    icon:     '🏠',
    label:    'Home Buyer / Investor',
    sub:      'Search verified properties across African cities',
    color:    '#22C55E',
    redirect: '/search',                   // → /profile/setup-investor when built
  },
  {
    value:    'diaspora',
    icon:     '✈️',
    label:    'Diaspora Investor',
    sub:      'Invest remotely with full market intelligence',
    color:    '#5B2EFF',
    redirect: '/search',                   // → /profile/setup-diaspora when built
  },
  {
    value:    'agency',
    icon:     '🏢',
    label:    'Real Estate Agency',
    sub:      'List properties, earn trust badges, grow with MAPE',
    color:    '#14B8A6',
    redirect: '/agency/onboard',           // EXISTS ✓
  },
  {
    value:    'developer',
    icon:     '🏗️',
    label:    'Property Developer',
    sub:      'Track projects, unit sales, and your pipeline',
    color:    '#F59E0B',
    redirect: '/developer/onboard',        // EXISTS ✓
  },
]

// ── Type for Supabase SELECT return — must match query fields ──
interface ExistingUser {
  email:     string
  full_name: string | null
  user_role: string | null
}

export default function RegisterContent() {
  const [dark, setDark]                 = useState(true)
  const [step, setStep]                 = useState<'type' | 'details'>('type')
  const [accountType, setAccountType]   = useState<AccountType>('')
  const [fullName, setFullName]         = useState('')
  const [email, setEmail]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [done, setDone]                 = useState(false)
  const [doneMsg, setDoneMsg]           = useState('')
  const nameRef                         = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Focus name field when step changes to details
  useEffect(() => {
    if (step === 'details') {
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [step])

  // ── NO localStorage redirect guard here ───────────────────
  // Register is a public page. Users navigate here intentionally.
  // Guards belong on protected pages (dashboard, profile setup).

  const selected = ACCOUNT_OPTIONS.find(o => o.value === accountType)

  // ── Theme tokens ──────────────────────────────────────────
  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const card   = dark ? '#111827' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.6)'  : 'rgba(15,23,42,0.6)'
  const text3  = dark ? 'rgba(248,250,252,0.3)'  : 'rgba(15,23,42,0.3)'
  const border = dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)'
  const inputBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'

  const INP: React.CSSProperties = {
    width: '100%',
    padding: '0.8rem 1rem',
    background: inputBg,
    border: `1px solid ${border}`,
    borderRadius: 10,
    color: text,
    fontSize: '0.95rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  // ── Step 1: select type, immediately advance to step 2 ────
  function selectType(type: AccountType) {
    setAccountType(type)
    setError('')
    setStep('details')
  }

  // ── Step 2: submit ────────────────────────────────────────
  async function handleSubmit() {
    if (!fullName.trim())                      { setError('Please enter your full name'); return }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return }
    if (!accountType)                          { setError('Please go back and select an account type'); return }

    setLoading(true)
    setError('')

    const cleanEmail  = email.trim().toLowerCase()
    const cleanName   = fullName.trim()
    const destination = selected?.redirect || '/search'

    try {
      // ── Agency & Developer: pre-fill onboard hints, redirect ──
      // Their full profile is captured on the dedicated onboard pages.
      // We don't create a user_profiles row here for them — their
      // onboard flow creates rows in data_partners / developer_accounts.
      if (accountType === 'agency' || accountType === 'developer') {
        if (typeof window !== 'undefined') {
          localStorage.setItem('manop_reg_name',  cleanName)
          localStorage.setItem('manop_reg_email', cleanEmail)
          localStorage.setItem('manop_reg_type',  accountType)
        }
        setDone(true)
        setDoneMsg(
          accountType === 'agency'
            ? 'Taking you to agency setup…'
            : 'Taking you to developer setup…'
        )
        setTimeout(() => router.push(destination), 1000)
        return
      }

      // ── Buyer & Diaspora: insert into user_profiles ───────────
      // Check if email already exists first
      const { data: existing } = await sb
        .from('user_profiles')
        .select('email, full_name, user_role')
        .eq('email', cleanEmail)
        .maybeSingle<ExistingUser>()            // maybeSingle = returns null if not found, no error

      if (existing) {
        // Already registered — restore session and redirect
        if (typeof window !== 'undefined') {
          localStorage.setItem('manop_user_email', cleanEmail)
          localStorage.setItem('manop_user_name',  existing.full_name || cleanName)
          localStorage.setItem('manop_user_role',  existing.user_role || accountType)
        }
        setDone(true)
        setDoneMsg('Welcome back! Taking you to your dashboard…')
        const existingRole = existing.user_role as AccountType
        const existingDest = ACCOUNT_OPTIONS.find(o => o.value === existingRole)?.redirect || '/search'
        setTimeout(() => router.push(existingDest), 1000)
        return
      }

      // New user — create profile
      const { error: insertErr } = await sb
        .from('user_profiles')
        .insert({
          email:     cleanEmail,
          full_name: cleanName,
          user_role: accountType,
          source:    'web_registration',
        })

      if (insertErr) {
        // Race condition duplicate
        if (insertErr.code === '23505' ||
            insertErr.message.toLowerCase().includes('duplicate') ||
            insertErr.message.toLowerCase().includes('unique')) {
          setError('This email is already registered. Try logging in instead.')
          return
        }
        throw new Error(insertErr.message)
      }

      // Persist session
      if (typeof window !== 'undefined') {
        localStorage.setItem('manop_user_email', cleanEmail)
        localStorage.setItem('manop_user_name',  cleanName)
        localStorage.setItem('manop_user_role',  accountType)
      }

      // Fire signal (non-blocking)
      fetch('/api/signals', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          signal_type: 'user_registered',
          metadata:    { role: accountType, email: cleanEmail },
        }),
      }).catch(() => {})

      setDone(true)
      setDoneMsg(
        accountType === 'diaspora'
          ? 'Account created! Taking you to property search…'
          : 'Account created! Taking you to search…'
      )
      setTimeout(() => router.push(destination), 1000)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: bg,
      minHeight: '100vh',
      color: text,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '2.5rem 1rem 5rem',
    }}>

      {/* Logo */}
      <Link
        href="/"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          textDecoration: 'none', marginBottom: '2.5rem',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: '#5B2EFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, color: '#fff', fontSize: 16, letterSpacing: '-0.02em',
        }}>
          M
        </div>
        <div>
          <div style={{ fontWeight: 800, color: text, fontSize: 16, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Manop
          </div>
          <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Africa Intelligence
          </div>
        </div>
      </Link>

      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* ── STEP 1: Choose account type ── */}
        {step === 'type' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 style={{
                fontSize: '1.75rem', fontWeight: 800,
                letterSpacing: '-0.04em', color: text,
                marginBottom: '0.5rem', lineHeight: 1.1,
              }}>
                Who are you?
              </h1>
              <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.6 }}>
                Choose your account type to get started.
              </p>
            </div>

            {/* Account type list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACCOUNT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => selectType(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '1rem 1.25rem',
                    background: card,
                    border: `1px solid ${border}`,
                    borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    transition: 'border-color 0.15s, transform 0.1s',
                    WebkitTapHighlightColor: 'transparent',
                    width: '100%',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = opt.color
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = border
                    e.currentTarget.style.transform = 'none'
                  }}
                >
                  {/* Icon circle */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                    background: `${opt.color}15`,
                    border: `1px solid ${opt.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.3rem',
                  }}>
                    {opt.icon}
                  </div>

                  {/* Label + sub */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.9rem', fontWeight: 700,
                      color: text, marginBottom: '0.15rem',
                    }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: text2, lineHeight: 1.4 }}>
                      {opt.sub}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div style={{ color: text3, fontSize: '0.85rem', flexShrink: 0 }}>→</div>
                </button>
              ))}
            </div>

            <p style={{
              fontSize: '0.72rem', color: text3,
              textAlign: 'center', marginTop: '1.5rem', lineHeight: 1.6,
            }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#5B2EFF', fontWeight: 600, textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          </>
        )}

        {/* ── STEP 2: Name + Email ── */}
        {step === 'details' && (
          <>
            {/* Back + type indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: '2rem',
            }}>
              <button
                onClick={() => { setStep('type'); setError('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: text2, fontSize: '0.85rem', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: 0,
                }}
              >
                ← Back
              </button>
              {selected && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginLeft: 'auto',
                  padding: '4px 10px',
                  background: `${selected.color}12`,
                  border: `1px solid ${selected.color}30`,
                  borderRadius: 20,
                  fontSize: '0.72rem', fontWeight: 600, color: selected.color,
                }}>
                  <span>{selected.icon}</span>
                  <span>{selected.label}</span>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <h1 style={{
                fontSize: '1.5rem', fontWeight: 800,
                letterSpacing: '-0.04em', color: text,
                marginBottom: '0.4rem', lineHeight: 1.15,
              }}>
                Create your account
              </h1>
              <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.55 }}>
                {accountType === 'agency'
                  ? 'Enter your details. You\'ll set up your full agency profile next.'
                  : accountType === 'developer'
                  ? 'Enter your details. You\'ll set up your developer profile next.'
                  : 'Enter your details to get started.'}
              </p>
            </div>

            {/* Form card */}
            <div style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 16,
              padding: '1.75rem',
              boxShadow: dark
                ? '0 20px 48px rgba(0,0,0,0.35)'
                : '0 8px 32px rgba(0,0,0,0.07)',
            }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Full name */}
                <div>
                  <label style={{
                    fontSize: '0.72rem', color: text2, fontWeight: 500,
                    display: 'block', marginBottom: '0.35rem',
                  }}>
                    Full name
                  </label>
                  <input
                    ref={nameRef}
                    style={INP}
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={e => { setFullName(e.target.value); setError('') }}
                    autoComplete="name"
                    disabled={done}
                    onFocus={e => (e.target.style.borderColor = selected?.color || '#5B2EFF')}
                    onBlur={e => (e.target.style.borderColor = border)}
                  />
                </div>

                {/* Email */}
                <div>
                  <label style={{
                    fontSize: '0.72rem', color: text2, fontWeight: 500,
                    display: 'block', marginBottom: '0.35rem',
                  }}>
                    Email address
                  </label>
                  <input
                    style={INP}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError('') }}
                    autoComplete="email"
                    disabled={done}
                    onKeyDown={e => e.key === 'Enter' && !done && handleSubmit()}
                    onFocus={e => (e.target.style.borderColor = selected?.color || '#5B2EFF')}
                    onBlur={e => (e.target.style.borderColor = border)}
                  />
                </div>

                {/* Context note for agency/developer */}
                {(accountType === 'agency' || accountType === 'developer') && (
                  <div style={{
                    fontSize: '0.78rem',
                    color: text2,
                    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    padding: '0.65rem 0.875rem',
                    lineHeight: 1.6,
                  }}>
                    {accountType === 'agency'
                      ? '📋 On the next page you\'ll add your company name, regions, contact details, and upload your verification documents.'
                      : '📋 On the next page you\'ll add your company info, active projects, cities of operation, and sales contacts.'}
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.7rem 0.875rem',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  color: '#EF4444',
                  lineHeight: 1.5,
                }}>
                  {error}
                </div>
              )}

              {/* Success */}
              {done && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.8rem 0.875rem',
                  background: 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: 8,
                  fontSize: '0.83rem',
                  color: '#22C55E',
                  lineHeight: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span>✓</span>
                  <span style={{ flex: 1 }}>{doneMsg}</span>
                  <div style={{
                    width: 15, height: 15, flexShrink: 0,
                    border: '2px solid rgba(34,197,94,0.3)',
                    borderTopColor: '#22C55E',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                </div>
              )}

              {/* CTA — stable height so it never shakes */}
              <button
                onClick={handleSubmit}
                disabled={loading || done}
                style={{
                  width: '100%',
                  marginTop: '1.25rem',
                  height: 48,                    // fixed height prevents layout shift
                  background: done
                    ? '#22C55E'
                    : (selected?.color || '#5B2EFF'),
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  cursor: (loading || done) ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.25s, opacity 0.2s',
                  opacity: loading ? 0.75 : 1,
                  WebkitTapHighlightColor: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: 16, height: 16,
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      borderRadius: '50%',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    <span>Please wait…</span>
                  </>
                ) : done ? (
                  <span>{doneMsg}</span>
                ) : accountType === 'agency' ? (
                  <span>Continue to agency setup →</span>
                ) : accountType === 'developer' ? (
                  <span>Continue to developer setup →</span>
                ) : (
                  <span>Create account →</span>
                )}
              </button>

              <p style={{
                fontSize: '0.67rem', color: text3,
                textAlign: 'center', marginTop: '0.875rem', lineHeight: 1.6,
              }}>
                By registering you agree to Manop's terms.
                We never sell your data.
              </p>
            </div>

            <p style={{
              fontSize: '0.78rem', color: text2,
              textAlign: 'center', marginTop: '1.25rem',
            }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#5B2EFF', fontWeight: 600, textDecoration: 'none' }}>
                Sign in →
              </Link>
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}