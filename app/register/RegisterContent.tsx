'use client'
// app/register/RegisterContent.tsx
//
// One screen: who you are → account details → acknowledgement → create account.
// Account types are the ones the product already routes (/verify → setup pages):
// buyer, diaspora, agency, developer. No new roles are introduced.
//   Sign up → verify email → /verify routes to the matching workspace setup.
// The acknowledgement is required before signUp() is called and is recorded in
// user_metadata.consent (see lib/consent.ts).

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../lib/theme'
import ManopLogo from '../../components/ManopLogo'
import { CONSENT_VERSION, EVIDENCE_NOTICE, PRIVACY_URL, TERMS_URL, consentRecord, hasLegalLinks } from '../../lib/consent'

type AccountType = 'buyer' | 'diaspora' | 'agency' | 'developer'

const ACCOUNT_TYPES: { key: AccountType; label: string; sub: string; color: string }[] = [
  { key: 'developer', label: 'Developer',           sub: 'Present and update your developments', color: '#F59E0B' },
  { key: 'agency',    label: 'Agency',              sub: 'Submit and track developments',        color: '#7C5FFF' },
  { key: 'diaspora',  label: 'Investor (diaspora)', sub: 'Assess developments from abroad',      color: '#14B8A6' },
  { key: 'buyer',     label: 'Buyer',               sub: 'Understand a development first',       color: '#5B2EFF' },
]

export default function RegisterContent() {
  const params = useSearchParams()
  const [dark, setDark] = useState(getInitialDark)
  const initial = params.get('type')
  const [type, setType] = useState<AccountType | null>(
    ACCOUNT_TYPES.some(t => t.key === initial) ? (initial as AccountType) : null,
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<'type' | 'name' | 'email' | 'password' | 'consent' | ''>('')
  const [done, setDone] = useState(false)

  useEffect(() => listenTheme(d => setDark(d)), [])

  const bg = dark ? '#0F172A' : '#F8FAFC'
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.7)' : 'rgba(15,23,42,0.7)'
  const text3 = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.5)'
  const border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.14)'
  const accent = ACCOUNT_TYPES.find(t => t.key === type)?.color || '#5B2EFF'
  const fieldBorder = (f: string) => (errorField === f ? '#EF4444' : border)

  const INP = (f: string): React.CSSProperties => ({
    width: '100%', minHeight: 48, padding: '0.75rem 0.9rem', boxSizing: 'border-box',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${fieldBorder(f)}`, borderRadius: 10, color: text,
    fontSize: 16, // 16px stops iOS zooming on focus
    outline: 'none', fontFamily: 'inherit',
  })
  const LBL: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: text2, marginBottom: 6 }

  function fail(field: typeof errorField, msg: string) { setErrorField(field); setError(msg) }

  async function handleRegister() {
    setError(''); setErrorField('')
    const cleanName = name.trim()
    const cleanEmail = email.trim().toLowerCase()
    if (!type) return fail('type', 'Choose the option that describes you.')
    if (!cleanName) return fail('name', 'Enter your full name.')
    if (!cleanEmail || !cleanEmail.includes('@')) return fail('email', 'Enter a valid email address.')
    if (password.length < 8) return fail('password', 'Password must be at least 8 characters.')
    if (!agreed) return fail('consent', 'Please confirm the acknowledgement below to create your account.')

    setSaving(true)
    try {
      const { data: authData, error: authErr } = await sb.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/verify`,
          data: { full_name: cleanName, user_role: type, consent: consentRecord() },
        },
      })
      if (authErr) {
        fail('email', authErr.message.includes('already registered')
          ? 'An account with this email already exists. Sign in instead, or reset your password.'
          : authErr.message)
        return
      }
      if (!authData.user) { fail('', 'Something went wrong. Please try again.'); return }

      if (type === 'buyer' || type === 'diaspora') {
        await sb.from('user_profiles').insert({
          id: authData.user.id, full_name: cleanName, email: cleanEmail,
          user_role: type, created_at: new Date().toISOString(),
        })
        // Ignored on failure: the profile is completed in the setup step.
      }
      // Developer and agency rows are created during onboarding, after email verification.

      fetch('/api/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: 'user_registered', metadata: { type, consent_version: CONSENT_VERSION } }),
      }).catch(() => {})

      setDone(true)
    } catch (e: unknown) {
      fail('', e instanceof Error ? e.message : 'Registration failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const shell: React.CSSProperties = { background: bg, minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: 'clamp(1.25rem,5vw,2.5rem) 1.25rem', color: text }

  if (done) return (
    <div style={{ ...shell, alignItems: 'center' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Account created</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 12px' }}>Check your email</h1>
        <p style={{ fontSize: 15, color: text2, lineHeight: 1.7, margin: '0 0 24px' }}>
          We sent a verification link to <strong style={{ color: text }}>{email.trim()}</strong>. Open it to confirm your address —
          you&apos;ll then go straight to setting up your MANOP workspace.
        </p>
        <p style={{ fontSize: 13, color: text3, lineHeight: 1.6, margin: '0 0 20px' }}>
          Nothing in your inbox after a few minutes? Check your spam folder.
        </p>
        <Link href="/login" style={{ fontSize: 14, color: '#14B8A6', textDecoration: 'none', fontWeight: 600 }}>Already verified? Enter MANOP →</Link>
      </div>
    </div>
  )

  return (
    <div style={{ ...shell, alignItems: 'flex-start' }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <Link href="/" aria-label="MANOP home" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: 'clamp(1.25rem,4vw,2rem)' }}>
          <ManopLogo height={64} dark={dark} />
        </Link>

        <div style={{ fontSize: 11, fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
          Think through the development
        </div>
        <h1 style={{ fontSize: 'clamp(1.6rem,5vw,2rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.12, margin: '0 0 8px' }}>
          Create your MANOP account
        </h1>
        <p style={{ fontSize: 14.5, color: text2, lineHeight: 1.65, margin: '0 0 24px' }}>
          The intelligence partner for real estate development: evidence, context and analysis in one place.
        </p>

        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
          <legend style={{ ...LBL, padding: 0 }}>I am joining as</legend>
          <div role="radiogroup" aria-label="Account type" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>
            {ACCOUNT_TYPES.map(t => {
              const on = t.key === type
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => { setType(t.key); if (errorField === 'type') { setError(''); setErrorField('') } }}
                  style={{
                    textAlign: 'left', minHeight: 56, padding: '0.7rem 0.9rem', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', color: text,
                    background: on ? `${t.color}18` : 'transparent', border: `1.5px solid ${on ? t.color : fieldBorder('type')}`,
                  }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: text3, marginTop: 2, lineHeight: 1.4 }}>{t.sub}</div>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label htmlFor="su-name" style={LBL}>Full name</label>
            <input id="su-name" style={INP('name')} autoComplete="name" value={name} onChange={e => setName(e.target.value)} aria-invalid={errorField === 'name'} />
          </div>
          <div>
            <label htmlFor="su-email" style={LBL}>Email address</label>
            <input id="su-email" style={INP('email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
              placeholder={type === 'agency' || type === 'developer' ? 'you@company.com' : 'you@email.com'}
              value={email} onChange={e => setEmail(e.target.value)} aria-invalid={errorField === 'email'} />
          </div>
          <div>
            <label htmlFor="su-pass" style={LBL}>Password <span style={{ color: text3, fontWeight: 400 }}>(at least 8 characters)</span></label>
            <div style={{ position: 'relative' }}>
              <input id="su-pass" style={{ ...INP('password'), paddingRight: '4.25rem' }} type={showPass ? 'text' : 'password'} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} aria-invalid={errorField === 'password'}
                onKeyDown={e => e.key === 'Enter' && handleRegister()} />
              <button type="button" onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 4, top: 0, bottom: 0, minWidth: 56, background: 'none', border: 'none', cursor: 'pointer', color: text3, fontSize: 13, fontFamily: 'inherit' }}>
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        </div>

        {/* Acknowledgement — required, visible, not small print */}
        <div style={{ marginTop: 18, padding: '0.9rem', borderRadius: 10, border: `1.5px solid ${fieldBorder('consent')}`, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)' }}>
          <label htmlFor="su-consent" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input id="su-consent" type="checkbox" checked={agreed} aria-describedby="su-consent-text"
              onChange={e => { setAgreed(e.target.checked); if (e.target.checked && errorField === 'consent') { setError(''); setErrorField('') } }}
              style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0, accentColor: accent, cursor: 'pointer' }} />
            <span id="su-consent-text" style={{ fontSize: 14, lineHeight: 1.6, color: text2 }}>
              {hasLegalLinks() && (
                <>I agree to MANOP&apos;s <a href={TERMS_URL} target="_blank" rel="noreferrer" style={{ color: '#14B8A6' }}>Terms of Use</a> and
                  acknowledge MANOP&apos;s <a href={PRIVACY_URL} target="_blank" rel="noreferrer" style={{ color: '#14B8A6' }}>Privacy Policy</a>. </>
              )}
              {EVIDENCE_NOTICE}
            </span>
          </label>
        </div>

        {error && (
          <div role="alert" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.7rem 0.9rem', fontSize: 13.5, color: dark ? '#FCA5A5' : '#B91C1C', marginTop: 14, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <button type="button" onClick={handleRegister} disabled={saving}
          style={{ width: '100%', marginTop: 16, minHeight: 52, background: accent, color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700,
            cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1 }}>
          {saving ? 'Creating account…' : 'Create account'}
        </button>

        <p style={{ fontSize: 14, color: text3, textAlign: 'center', margin: '20px 0 8px' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Enter MANOP →</Link>
        </p>
      </div>
    </div>
  )
}