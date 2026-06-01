'use client'
// app/login/page.tsx
//
// CHANGE FROM ORIGINAL: logo replaced.
// Was: purple square with "M" + hardcoded text
// Now: ManopLogoSVG — the real logo, scales correctly, dark/light aware
//
// All auth logic (signInWithPassword, resetPasswordForEmail,
// role-based routing) is IDENTICAL to the original. Zero functional change.

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

const ROLE_REDIRECTS: Record<string, string> = {
  buyer:     '/search',
  diaspora:  '/search',
  agency:    '/agency/dashboard',
  developer: '/developer/dashboard',
  admin:     '/admin',
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

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const role = session.user.user_metadata?.user_role || 'buyer'
        router.replace(ROLE_REDIRECTS[role] || '/search')
      }
    })
  }, [router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
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

      const role = data.user.user_metadata?.user_role || 'buyer'
      router.replace(ROLE_REDIRECTS[role] || '/search')

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
      if (resetErr) {
        setError(resetErr.message)
      } else {
        setResetSent(true)
      }
    } finally {
      setLoading(false)
    }
  }

  if (resetSent) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' as const }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(91,46,255,0.1)', border: '1.5px solid rgba(91,46,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.75rem' }}>📬</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.75rem' }}>Reset link sent</h2>
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

        {/* ── LOGO — real ManopLogoSVG, not the M square ── */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', marginBottom: '2rem' }}>
            <ManopLogoSVG height={80} dark={dark} showText />
        </Link>

        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.35rem' }}>
            {resetMode ? 'Reset your password' : 'Sign in'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {resetMode
              ? "Enter your email and we'll send a reset link."
              : 'Welcome back. One platform for all user types.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Email address</label>
              <input
                style={INP}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
                onKeyDown={e => e.key === 'Enter' && !resetMode && handleLogin()}
                autoComplete="email"
              />
            </div>

            {!resetMode && (
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...INP, paddingRight: '3rem' }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                    onBlur={e => (e.target.style.borderColor = border)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: text3, fontFamily: 'inherit', fontSize: '0.72rem', padding: '2px 6px' }}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button
              onClick={resetMode ? handleReset : handleLogin}
              disabled={loading}
              style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 9, padding: '0.8rem', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.15s' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#6E44FF' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#5B2EFF' }}
            >
              {loading
                ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Processing…</>
                : resetMode ? 'Send reset link →' : 'Sign in →'}
            </button>

            <button
              onClick={() => { setResetMode(m => !m); setError('') }}
              style={{ background: 'none', border: 'none', color: text3, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textAlign: 'center' as const }}
            >
              {resetMode ? '← Back to sign in' : 'Forgot your password?'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' as const, fontSize: '0.82rem', color: text3 }}>
          Don't have an account?{' '}
          <Link href="/register" style={{ color: '#5B2EFF', textDecoration: 'none', fontWeight: 600 }}>Register →</Link>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}