'use client'
// app/login/page.tsx — REBUILT
// Uses Supabase Auth signInWithPassword — replaces custom email-lookup token system
// Reads user_role from user_profiles to route to correct dashboard

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const ROLE_ROUTES: Record<string, string> = {
  buyer:     '/search',
  investor:  '/search',
  agency:    '/agency/dashboard',
  developer: '/developer/dashboard',
  partner:   '/search',
  analyst:   '/search',
  admin:     '/admin',
}

export default function LoginPage() {
  const [dark, setDark]         = useState(true)
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Redirect if already logged in
  useEffect(() => {
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      const role = await getUserRole(data.session.user.id)
      router.push(ROLE_ROUTES[role] || '/search')
    })
  }, [router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.75rem 1rem',
    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 10, color: text,
    fontSize: '0.95rem', outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  async function getUserRole(userId: string): Promise<string> {
    const { data } = await sb
      .from('user_profiles')
      .select('user_role')
      .eq('id', userId)
      .single()
    return data?.user_role || 'buyer'
  }

  async function handleLogin() {
    const clean = email.trim().toLowerCase()
    if (!clean || !clean.includes('@')) { setError('Enter a valid email address'); return }
    if (!password) { setError('Enter your password'); return }

    setLoading(true); setError('')

    try {
      const { data, error: authError } = await sb.auth.signInWithPassword({
        email: clean,
        password,
      })

      if (authError) {
        // Improve on Supabase's generic error messages
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error('Email or password is incorrect. Check and try again.')
        }
        if (authError.message.includes('Email not confirmed')) {
          throw new Error('Please confirm your email before logging in. Check your inbox.')
        }
        throw new Error(authError.message)
      }

      if (!data.user) throw new Error('Login failed. Please try again.')

      // Get role and redirect
      const role = await getUserRole(data.user.id)
      router.push(ROLE_ROUTES[role] || '/search')

    } catch (e: any) {
      setError(e.message || 'Login failed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    const clean = email.trim().toLowerCase()
    if (!clean || !clean.includes('@')) {
      setError('Enter your email address first, then click Forgot password.')
      return
    }
    await sb.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setError('')
    alert(`Password reset email sent to ${clean}. Check your inbox.`)
  }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem', justifyContent: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 17, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Manop</div>
            <div style={{ fontSize: '0.48rem', fontWeight: 600, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.4rem' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '0.875rem', color: text2 }}>
            Sign in to your Manop account
          </p>
        </div>

        {/* Card */}
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem', boxShadow: dark ? '0 24px 48px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.08)' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.72rem', color: text2, fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>
                Email address
              </label>
              <input
                style={INP}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                autoComplete="email"
                autoFocus
              />
            </div>

            <div>
              <label style={{ fontSize: '0.72rem', color: text2, fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...INP, paddingRight: '3rem' }}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  autoComplete="current-password"
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <button
                  onClick={() => setShowPass(p => !p)}
                  style={{ position: 'absolute', right: '0.875rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: text3, fontSize: '0.75rem', fontFamily: 'inherit' }}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          </div>

          {/* Forgot password */}
          <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
            <button
              onClick={handleForgotPassword}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: text3, fontFamily: 'inherit' }}
            >
              Forgot password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginTop: '0.875rem' }}>
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%', background: '#5B2EFF', color: '#fff', border: 'none',
              borderRadius: 10, padding: '0.875rem', fontSize: '0.95rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', marginTop: '1.25rem',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: 1, background: border }} />
            <span style={{ fontSize: '0.7rem', color: text3 }}>New to Manop?</span>
            <div style={{ flex: 1, height: 1, background: border }} />
          </div>

          {/* Register options */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { href: '/register', icon: '💼', label: 'Buyer / Investor', color: '#22C55E' },
              { href: '/register', icon: '🏢', label: 'Agency',           color: '#14B8A6' },
              { href: '/register', icon: '🏗️', label: 'Developer',        color: '#5B2EFF' },
              { href: '/register', icon: '🤝', label: 'Partner',          color: '#F59E0B' },
            ].map(o => (
              <Link
                key={o.label}
                href={o.href}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 0.75rem', background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${border}`, borderRadius: 10, textDecoration: 'none' }}
              >
                <span style={{ fontSize: '1rem' }}>{o.icon}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: o.color }}>{o.label}</span>
              </Link>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '0.7rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Manop is in private beta. Issues? Email{' '}
          <span style={{ color: '#14B8A6' }}>support@manopintel.com</span>
        </p>
      </div>
    </div>
  )
}