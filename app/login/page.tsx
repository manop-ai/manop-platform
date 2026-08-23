'use client'
// app/login/page.tsx — UPDATED
//
// CHANGE FROM PREVIOUS VERSION:
// Added association role check after login.
// After signInWithPassword, if user has an association role in
// association_user_roles, they are redirected to /association/dashboard.
// All other logic is identical to the original.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { ManopLogoSVG } from '../../components/ManopLogo'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// Role → dashboard URL map
// Association roles are resolved dynamically (DB check), not from metadata
const ROLE_REDIRECTS: Record<string, string> = {
  buyer:                       '/search',
  diaspora:                    '/search',
  investor:                    '/investor/dashboard',
  agency:                      '/agency/dashboard',
  developer:                   '/developer/dashboard',
  admin:                       '/admin',
  // Association roles — handled by DB check below
  association_national_admin:  '/association/dashboard',
  chapter_admin:               '/association/dashboard',
  super_admin:                 '/admin',
  country_admin:               '/association/dashboard',
  analyst:                     '/association/dashboard',
}

// After login, check if this user has an association role in the DB.
// This is the source of truth — not user_metadata.
async function resolveRedirect(userId: string, metaRole: string): Promise<string> {
  // Check association_user_roles first — this takes priority
  const { data: assocRole } = await sb
    .from('association_user_roles')
    .select('role, association_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', [
      'super_admin',
      'country_admin',
      'association_national_admin',
      'chapter_admin',
      'analyst',
    ])
    .maybeSingle()

  if (assocRole) {
    return '/association/dashboard'
  }

  // Fall back to metadata role
  return ROLE_REDIRECTS[metaRole] || '/search'
}

export default function LoginPage() {
  const router = useRouter()
  const [dark,      setDark]      = useState(true)
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // If already logged in, redirect immediately
  useEffect(() => {
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const metaRole = session.user.user_metadata?.user_role || 'buyer'
        const dest = await resolveRedirect(session.user.id, metaRole)
        router.replace(dest)
      }
    })
  }, [router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.75rem 0.875rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`, borderRadius: 9,
    color: text, fontSize: '0.9rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  }

  async function handleLogin() {
    setError('')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) { setError('Enter a valid email address.'); return }
    if (!password) { setError('Enter your password.'); return }

    setLoading(true)
    try {
      const { data, error: authErr } = await sb.auth.signInWithPassword({
        email:    cleanEmail,
        password,
      })

      if (authErr) {
        if (authErr.message.includes('Invalid login credentials')) {
          setError('Incorrect email or password. Check your details or reset your password.')
        } else if (authErr.message.includes('Email not confirmed')) {
          setError('Please verify your email first. Check your inbox for the verification link.')
        } else {
          setError(authErr.message)
        }
        return
      }

      if (!data.user) { setError('Sign in failed. Please try again.'); return }

      // Resolve the correct dashboard — checks association roles in DB
      const metaRole = data.user.user_metadata?.user_role || 'buyer'
      const dest = await resolveRedirect(data.user.id, metaRole)
      router.replace(dest)

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter your email address above first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: resetErr } = await sb.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (resetErr) { setError(resetErr.message) } else { setResetSent(true) }
    } finally {
      setLoading(false)
    }
  }

  if (resetSent) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' as const }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(91,46,255,0.1)', border: '1.5px solid rgba(91,46,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.75rem' }}>📬</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: text, marginBottom: '0.75rem' }}>Reset link sent</h2>
        <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Check <strong style={{ color: text }}>{email}</strong> for a password reset link.
        </p>
        <button onClick={() => { setResetMode(false); setResetSent(false) }}
          style={{ fontSize: '0.82rem', color: '#14B8A6', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Back to sign in
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 420, width: '100%' }}>

        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', marginBottom: '2rem' }}>
          <ManopLogoSVG height={80} dark={dark} showText />
        </Link>

        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: text, marginBottom: '0.35rem' }}>
            {resetMode ? 'Reset your password' : 'Sign in'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: text2, marginBottom: '1.5rem' }}>
            {resetMode
              ? 'Enter your email and we\'ll send a reset link.'
              : 'Sign in to your MANOP account.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: text2, marginBottom: '0.35rem' }}>
                Email address
              </label>
              <input
                style={INP}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !resetMode && handleLogin()}
                autoComplete="email"
              />
            </div>

            {!resetMode && (
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: text2, marginBottom: '0.35rem' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...INP, paddingRight: '2.75rem' }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    autoComplete="current-password"
                  />
                  <button
                    onClick={() => setShowPass(p => !p)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: text2, fontSize: '0.8rem' }}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: '0.82rem', color: '#FCA5A5', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              onClick={resetMode ? handleReset : handleLogin}
              disabled={loading}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: 9,
                background: loading ? 'rgba(91,46,255,0.5)' : '#5B2EFF',
                color: '#fff', border: 'none', fontSize: '0.9rem',
                fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
                marginTop: '0.25rem',
              }}
            >
              {loading
                ? (resetMode ? 'Sending…' : 'Signing in…')
                : (resetMode ? 'Send Reset Link' : 'Sign In')}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
              <button
                onClick={() => { setResetMode(r => !r); setError('') }}
                style={{ fontSize: '0.8rem', color: '#14B8A6', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {resetMode ? '← Back to sign in' : 'Forgot password?'}
              </button>
              {!resetMode && (
                <Link href="/register" style={{ fontSize: '0.8rem', color: '#14B8A6', textDecoration: 'none' }}>
                  Create account
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}