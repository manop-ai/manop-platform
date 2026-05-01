'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export default function RegisterContent() {
  const [dark, setDark]       = useState(true)
  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [role, setRole]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const router     = useRouter()
  const params     = useSearchParams()
  const redirectTo = params.get('redirect') || '/search'

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // If already registered, redirect — with better iOS Safari support
  useEffect(() => {
    try {
      const saved = localStorage.getItem('manop_user_email')
      if (saved) {
        // Use a small delay to ensure router is ready (important for iOS)
        const timer = setTimeout(() => {
          router.push(redirectTo)
        }, 100)
        return () => clearTimeout(timer)
      }
    } catch (e) {
      // localStorage might not be available in iOS private mode — just continue
      console.debug('localStorage unavailable, proceeding with registration')
    }
  }, [redirectTo, router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'

  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 10, color: text,
    fontSize: '0.95rem', padding: '0.75rem 1rem', outline: 'none',
    fontFamily: 'inherit', marginBottom: 4,
  }

  const LBL: React.CSSProperties = {
    fontSize: '0.72rem', color: text2, marginBottom: '0.35rem',
    display: 'block', fontWeight: 500,
  }

  const ROLES = [
    { val: 'investor',   label: '💰 Investor',         desc: 'Looking to buy or invest' },
    { val: 'diaspora',   label: '🌍 Diaspora buyer',    desc: 'Investing from abroad' },
    { val: 'agent',      label: '🏢 Agent / Agency',    desc: 'I list and sell properties' },
    { val: 'developer',  label: '🏗️ Developer',         desc: 'I build and develop' },
    { val: 'researcher', label: '📊 Researcher / Analyst', desc: 'Market research' },
    { val: 'other',      label: '👤 Other',             desc: 'Just exploring' },
  ]

  async function handleSubmit() {
    if (!name.trim())  { setError('Please enter your name'); return }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return }
    if (!role)         { setError('Please select what describes you best'); return }

    setLoading(true)
    setError('')

    try {
      // Save to Supabase user_profiles with timeout (5s)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const { error: dbErr } = await sb.from('user_profiles').upsert({
        email:      email.trim().toLowerCase(),
        full_name:  name.trim(),
        user_role:  role,
        source:     'web_registration',
        created_at: new Date().toISOString(),
      }, { onConflict: 'email' })
      
      clearTimeout(timeoutId)

      if (dbErr && dbErr.code !== '23505') {
        console.error('DB error:', dbErr)
        // Don't block on DB error — still save locally
      }

      // Log the registration signal with timeout
      try {
        const signalController = new AbortController()
        const signalTimeout = setTimeout(() => signalController.abort(), 3000)

        await fetch('/api/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signal_type: 'user_registration',
            metadata: {
              email:  email.trim().toLowerCase(),
              name:   name.trim(),
              role,
              source: 'register_page',
              redirect: redirectTo,
            },
          }),
          signal: signalController.signal,
        })
        clearTimeout(signalTimeout)
      } catch {
        // Never block on analytics — users should always be able to register
      }

      // Save session to localStorage with fallback
      try {
        localStorage.setItem('manop_user_email', email.trim().toLowerCase())
        localStorage.setItem('manop_user_name',  name.trim())
        localStorage.setItem('manop_user_role',  role)
      } catch (e) {
        // localStorage unavailable (iOS private mode) — still redirect
        console.debug('localStorage unavailable, proceeding anyway')
      }

      // Redirect with small delay for iOS Safari reliability
      setTimeout(() => {
        router.push(redirectTo)
      }, 50)

    } catch (e) {
      // If all else fails, still try to redirect
      console.error('Registration error:', e)
      try {
        localStorage.setItem('manop_user_email', email.trim().toLowerCase())
      } catch {}
      setTimeout(() => {
        router.push(redirectTo)
      }, 50)
      localStorage.setItem('manop_user_email', email.trim().toLowerCase())
      localStorage.setItem('manop_user_name',  name.trim())
      router.push(redirectTo)
    } finally {
      setLoading(false)
    }
  }

  const WHY = [
    { icon: '📊', text: 'Save properties and track deals you\'re watching' },
    { icon: '📄', text: 'Download full deal analysis reports' },
    { icon: '🔔', text: 'Get market intelligence for your target neighborhoods' },
    { icon: '🤝', text: 'Connect directly with verified agents' },
  ]

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s, color 0.3s' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1rem' }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', marginBottom: '2.5rem' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 800, color: '#fff' }}>M</div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: text, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Manop</div>
            <div style={{ fontSize: '0.48rem', fontWeight: 600, color: '#14B8A6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        {/* Heading */}
        <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>
          Join Manop — it's free
        </h1>
        <p style={{ fontSize: 14, color: text2, lineHeight: 1.65, marginBottom: '2rem' }}>
          Africa's first property intelligence platform. Save deals, download reports, and make better investment decisions.
        </p>

        {/* Why register */}
        <div style={{ background: dark ? 'rgba(91,46,255,0.08)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
          {WHY.map(w => (
            <div key={w.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', fontSize: 13, color: text2 }}>
              <span style={{ fontSize: 15, flexShrink: 0 }}>{w.icon}</span>
              <span>{w.text}</span>
            </div>
          ))}
        </div>

        {/* Form */}
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={LBL}>Your name</label>
            <input style={INP} type="text" placeholder="e.g. Joel Mensah" value={name}
              onChange={e => setName(e.target.value)} autoFocus />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={LBL}>Email address</label>
            <input style={INP} type="email" placeholder="e.g. joel@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={LBL}>What best describes you?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ROLES.map(r => (
                <button key={r.val} onClick={() => setRole(r.val)} style={{
                  padding: '0.65rem 0.75rem', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${role === r.val ? '#5B2EFF' : border}`,
                  background: role === r.val ? (dark ? 'rgba(91,46,255,0.15)' : 'rgba(91,46,255,0.07)') : 'transparent',
                  color: role === r.val ? '#7C5FFF' : text2,
                  textAlign: 'left' as const, fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 13, fontWeight: role === r.val ? 600 : 400 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem 0.875rem', marginBottom: '1rem', fontSize: 13, color: '#EF4444' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creating your account…' : 'Create free account →'}
          </button>
        </div>

        {/* Fine print */}
        <p style={{ fontSize: 12, color: text3, textAlign: 'center', lineHeight: 1.6 }}>
          No payment. No credit card. Manop is and will always be free for investors.
          <br />By joining you agree to receive market intelligence emails occasionally.
          <br />Unsubscribe anytime.
        </p>

        <p style={{ fontSize: 13, color: text2, textAlign: 'center', marginTop: '1.5rem' }}>
          Already have an account?{' '}
          <button
            onClick={() => {
              const email = prompt('Enter your email to continue:')
              if (email && email.includes('@')) {
                localStorage.setItem('manop_user_email', email.trim())
                router.push(redirectTo)
              }
            }}
            style={{ background: 'none', border: 'none', color: '#14B8A6', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            Continue with email →
          </button>
        </p>
      </div>
    </div>
  )
}
