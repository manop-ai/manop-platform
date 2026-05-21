'use client'
// app/reset-password/page.tsx — SPRINT 1
// User lands here from the reset email link.
// Supabase has already exchanged the token when the page loads.
// We just show a new password form and call sb.auth.updateUser().

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export default function ResetPasswordPage() {
  const router = useRouter()
  const [dark, setDark] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // Wait for Supabase to process the reset token from URL
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data: { session } } = await sb.auth.getSession()
      setHasSession(!!session)
      setChecking(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [])

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

  async function handleReset() {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setSaving(true)
    try {
      const { error: updateErr } = await sb.auth.updateUser({ password })
      if (updateErr) {
        setError(updateErr.message)
        setSaving(false)
        return
      }
      setDone(true)
      setTimeout(() => router.replace('/login'), 2500)
    } catch {
      setError('Failed to update password. Please try again.')
      setSaving(false)
    }
  }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!hasSession) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: text, marginBottom: '0.75rem' }}>Reset link expired</h2>
        <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.7, marginBottom: '1.5rem' }}>
          This reset link has expired or already been used. Request a new one from the login page.
        </p>
        <Link href="/login" style={{ background: '#5B2EFF', color: '#fff', borderRadius: 8, padding: '0.65rem 1.5rem', fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>
          Back to sign in →
        </Link>
      </div>
    </div>
  )

  if (done) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '1.75rem' }}>✓</div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: text, marginBottom: '0.75rem' }}>Password updated</h2>
        <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.7 }}>Redirecting to sign in…</p>
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
            Set new password
          </h1>
          <p style={{ fontSize: '0.82rem', color: text2, marginBottom: '1.5rem', lineHeight: 1.5 }}>
            Choose a strong password for your Manop account.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>
                New password <span style={{ color: text3, fontWeight: 400 }}>(min 8 characters)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...INP, paddingRight: '3.5rem' }}
                  type={showPass ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
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

            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Confirm password</label>
              <input
                style={INP}
                type={showPass ? 'text' : 'password'}
                placeholder="Same password again"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()}
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
              />
            </div>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginTop: 12, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleReset}
            disabled={saving}
            style={{
              width: '100%', marginTop: 16, height: 48,
              background: '#5B2EFF', color: '#fff',
              border: 'none', borderRadius: 10,
              fontSize: '0.9rem', fontWeight: 700,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.75 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
                Updating…
              </>
            ) : 'Update password →'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}