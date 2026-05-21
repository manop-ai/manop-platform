'use client'
// app/login/page.tsx — REBUILT FOR SPRINT 1
//
// ROOT CAUSE OF OLD SYSTEM:
// /login called signInWithPassword but no user had ever set a password.
// Agencies used custom partner_sessions tokens. Buyers had no password.
// This page always failed for everyone.
//
// NEW SYSTEM:
// - All users sign in here with email + password
// - On success: read user_role from metadata → route to correct dashboard
// - Forgot password → sb.auth.resetPasswordForEmail

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

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
  const [dark, setDark]     = useState(true)
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Check if already logged in
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
    fontFamily: 'inherit', boxSizing: 'border-box',
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
        if (authErr.message.includes('Email not confirmed')) {
          setError('Please verify your email first. Check your inbox for the verification link.')
        } else if (authErr.message.includes('Invalid login credentials')) {
          setError('Incorrect email or password. Try again, or reset your password below.')
        } else {
          setError(authErr.message)
        }
        setLoading(false)
        return
      }

      if (!data.user) {
        setError('Login failed. Please try again.')
        setLoading(false)
        return
      }

      // Route by user_role from metadata
      const role = data.user.user_metadata?.user_role || 'buyer'
      router.replace(ROLE_REDIRECTS[role] || '/search')

    } catch (e: unknown) {
      setError('Login failed. Please try again.')
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
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
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(91,46,255,0.1)', border: '1.5px solid rgba(91,46,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.75rem' }}>📬</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.75rem' }}>Reset link sent</h2>
        <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Check <strong style={{ color: text }}>{email}</strong> for a password reset link. Click it to set a new password.
        </p>
        <button onClick={() => { setResetMode(false); setResetSent(false) }} style={{ fontSize: '0.82rem', color: '#14B8A6', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Back to sign in
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 420, width: '100%' }}>

        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 15, letterSpacing: '-0.03em', lineHeight: 1.1 }}>Manop</div>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.35rem' }}>
            {resetMode ? 'Reset your password' : 'Sign in'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {resetMode
              ? 'Enter your email and we\'ll send a reset link.'
              : 'Welcome back. One platform for all user types.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Email address</label>
              <input
                style={INP}
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>

            {!resetMode && (
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...INP, paddingRight: '3.5rem' }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                    onBlur={e => (e.target.style.borderColor = border)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: text3, fontSize: '0.73rem', padding: 0, fontFamily: 'inherit' }}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginTop: 12, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            onClick={resetMode ? handleForgotPassword : handleLogin}
            disabled={loading}
            style={{
              width: '100%', marginTop: 16, height: 48,
              background: '#5B2EFF', color: '#fff',
              border: 'none', borderRadius: 10,
              fontSize: '0.9rem', fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: loading ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                {resetMode ? 'Sending…' : 'Signing in…'}
              </>
            ) : (
              resetMode ? 'Send reset link →' : 'Sign in →'
            )}
          </button>

          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={() => { setResetMode(v => !v); setError('') }}
              style={{ fontSize: '0.78rem', color: text3, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            >
              {resetMode ? '← Back to sign in' : 'Forgot password?'}
            </button>
            <Link href="/register" style={{ fontSize: '0.78rem', color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>
              Create account →
            </Link>
          </div>
        </div>

        <p style={{ fontSize: '0.7rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Agencies, developers, buyers, and diaspora investors all sign in here.
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}