'use client'
// app/verify/page.tsx — SPRINT 1
//
// This is the emailRedirectTo landing page.
// Supabase redirects here after the user clicks the verification link.
// We read the session, get the user_role from metadata, and route accordingly.
//
// Route map:
//   buyer     → /profile/setup-buyer
//   diaspora  → /profile/setup-diaspora
//   agency    → /agency/onboard
//   developer → /developer/onboard

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../lib/theme'
import { ManopLogoSVG } from '../../components/ManopLogo'


const SETUP_ROUTES: Record<string, string> = {
  buyer:     '/profile/setup-buyer',
  diaspora:  '/profile/setup-diaspora',
  agency:    '/agency/onboard',
  developer: '/developer/onboard',
}

export default function VerifyPage() {
  const router = useRouter()
  const [dark, setDark] = useState(getInitialDark)
  const [status, setStatus] = useState<'checking' | 'routing' | 'error'>('checking')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => {
    // Supabase handles the token exchange automatically on this page load.
    // We just need to wait briefly then call getSession().
    const timer = setTimeout(async () => {
      try {
        const { data: { session }, error } = await sb.auth.getSession()

        if (error || !session?.user) {
          // Try once more after a brief wait — Supabase may still be exchanging the token
          await new Promise(r => setTimeout(r, 1500))
          const { data: { session: session2 } } = await sb.auth.getSession()

          if (!session2?.user) {
            setErrorMsg('Could not verify your email. The link may have expired. Please register again or contact support.')
            setStatus('error')
            return
          }

          const role = session2.user.user_metadata?.user_role || 'buyer'
          setStatus('routing')
          router.replace(SETUP_ROUTES[role] || '/search')
          return
        }

        const role = session.user.user_metadata?.user_role || 'buyer'
        setStatus('routing')
        router.replace(SETUP_ROUTES[role] || '/search')

      } catch (e) {
        setErrorMsg('Verification failed. Please try again.')
        setStatus('error')
      }
    }, 800) // brief wait for Supabase token exchange

    return () => clearTimeout(timer)
  }, [router])

  const bg   = dark ? '#0F172A' : '#F8FAFC'
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'

  if (status === 'error') return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.03em', color: text, marginBottom: '0.75rem' }}>Verification failed</h2>
        <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>{errorMsg}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" style={{ background: '#5B2EFF', color: '#fff', borderRadius: 8, padding: '0.65rem 1.25rem', fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none' }}>
            Register again →
          </Link>
          <Link href="/login" style={{ color: '#14B8A6', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Sign in →
          </Link>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ textAlign: 'center' }}>
        <Link href="/"style={{ display: 'inline-flex',textDecoration: 'none',marginBottom: '2rem',}}>         
        <ManopLogoSVG height={84} dark={dark} showText />
        </Link>
        <div style={{ width: 48, height: 48, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite', margin: '0 auto 1.25rem' }} />
        <div style={{ fontSize: '0.85rem', color: text3 }}>
          {status === 'routing' ? 'Email verified. Taking you to setup…' : 'Verifying your email…'}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}