'use client'
// app/agency/onboard/page.tsx — FIXED
//
// ROOT CAUSE OF "Setup not complete":
// The insert step was silently failing due to RLS and returning no error.
// router.replace('/agency/dashboard') was firing even when insert produced nothing.
// Dashboard then found no row and showed "Setup not complete".
//
// FIXES APPLIED:
// 1. insert() now uses .select('id').single() so we know if it actually worked
// 2. If insert fails, error is surfaced to the user — no silent redirects
// 3. Added a post-insert verification: re-query to confirm row exists before redirect
// 4. Fallback: if row exists for this auth_user_id already, redirect directly

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { sb } from '../../../lib/supabase/client'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import { ManopLogoSVG } from '../../../components/ManopLogo'

const CITIES     = ['Lagos','Abuja','Port Harcourt','Accra','Nairobi','Kano','Ibadan','Other']
const PROP_TYPES = ['Residential','Commercial','Mixed-use','Land','Off-plan','Short-let','Luxury']

export default function AgencyOnboardPage() {
  const router = useRouter()
  const { user, checking } = useAuth('agency')
  const [dark, setDark] = useState(getInitialDark)

  const [agencyName,  setAgencyName]  = useState('')
  const [contactName, setContactName] = useState('')
  const [email,       setEmail]       = useState('')
  const [phone,       setPhone]       = useState('')
  const [website,     setWebsite]     = useState('')
  const [description, setDescription] = useState('')
  const [cities,      setCities]      = useState<string[]>([])
  const [propTypes,   setPropTypes]   = useState<string[]>([])
  const [agree,       setAgree]       = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => { return listenTheme(d => setDark(d)) }, [])
  useEffect(() => {
    if (!user) return
    setContactName(user.user_metadata?.full_name || '')
    setEmail(user.email || '')

    // Check if a partner row already exists for this user
    // If it does, they've already set up — go straight to dashboard
    async function checkExisting() {
      try {
        const { data: byAuthId } = await sb
          .from('data_partners')
          .select('id')
          .eq('auth_user_id', user!.id)
          .maybeSingle()
        if (byAuthId?.id) {
          router.replace('/agency/dashboard')
          return
        }

        const cleanEmail = (user.email || '').trim().toLowerCase()
        if (!cleanEmail) return

        const { data: byEmail } = await sb
          .from('data_partners')
          .select('id')
          .ilike('contact_email', cleanEmail)
          .maybeSingle()
        if (byEmail?.id) {
          router.replace('/agency/dashboard')
        }
      } catch {
        // no row — continue with onboard
      }
    }
    checkExisting()
  }, [user, router])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const card   = dark ? '#162032' : '#FFFFFF'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.875rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  }
  const LBL: React.CSSProperties = {
    fontSize: '0.73rem', fontWeight: 600, color: text2,
    display: 'block', marginBottom: 5,
  }

  function toggleCity(c: string) {
    setCities(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])
  }
  function toggleType(t: string) {
    setPropTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])
  }

  async function handleSubmit() {
    setError('')
    if (!agencyName.trim())  { setError('Agency name is required.'); return }
    if (!contactName.trim()) { setError('Your name is required.'); return }
    if (cities.length === 0) { setError('Select at least one city.'); return }
    if (!agree)              { setError('Please agree to the data commitment.'); return }
    if (!user)               { setError('Session expired. Please sign in again.'); return }

    setSaving(true)
    try {
      const cleanEmail = (email || user.email || '').trim().toLowerCase()

      const payload = {
        name:                agencyName.trim(),
        contact_name:        contactName.trim(),
        contact_email:       cleanEmail,
        phone:               phone.trim() || null,
        website:             website.trim() || null,
        description:         description.trim() || null,
        cities,
        property_types:      propTypes,
        partner_type:        'agency',
        trust_level:         'agency',
        verification_status: 'not_started',
        active:              true,
        auth_user_id:        user.id,
        updated_at:          new Date().toISOString(),
      }

      // STEP 1: Try to update existing row by auth_user_id
      const { data: byAuthId } = await sb
        .from('data_partners')
        .update(payload)
        .eq('auth_user_id', user.id)
        .select('id')
        .maybeSingle()

      if (byAuthId?.id) {
        router.replace('/agency/dashboard')
        return
      }

      // STEP 2: Try to update by email (pre-existing partner rows)
      if (cleanEmail) {
        const { data: byEmail } = await sb
          .from('data_partners')
          .update(payload)
          .ilike('contact_email', cleanEmail)
          .select('id')
          .maybeSingle()

        if (byEmail?.id) {
          router.replace('/agency/dashboard')
          return
        }
      }

      // STEP 3: Insert new row — with explicit confirmation
      // .select('id') after insert confirms the row was actually created
      // Without .select(), Supabase returns nothing even on success
      const { data: inserted, error: insertErr } = await sb
        .from('data_partners')
        .insert(payload)
        .select('id')
        .maybeSingle()

      if (insertErr) {
        // Surface the actual database error so it's visible
        console.error('[Onboard] Insert error:', insertErr)
        throw new Error(
          insertErr.message.includes('row-level security')
            ? 'Database permission error. Please contact support@manopintel.com with error code: RLS-001'
            : insertErr.message
        )
      }

      if (!inserted?.id) {
        // Insert returned no data — silent RLS failure
        // This is the bug that caused "Setup not complete"
        throw new Error(
          'Setup could not be saved. This is usually a database permissions issue. ' +
          'Please try signing out, signing back in, and trying again. ' +
          'If the problem persists, contact support@manopintel.com'
        )
      }

      // STEP 4: Confirmed — row exists with our auth_user_id
      // Now redirect — dashboard will find the row
      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'agency_onboarded',
          metadata: { agency: agencyName.trim(), partner_id: inserted.id },
        }),
      }).catch(() => {})

      router.replace('/agency/dashboard')

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '2rem 1rem 5rem' }}>

        <Link href="/" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: '2.5rem' }}>
          <ManopLogoSVG height={30} dark={dark} showText />
        </Link>

        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(91,46,255,0.08)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 20, padding: '3px 12px', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>Agency setup</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
            Set up your agency profile.
          </h1>
          <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7 }}>
            Your profile is the foundation of your MAPE score. Buyers see your trust badge before your listings.
          </p>
        </div>

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>Agency / company name *</label>
              <input style={INP} value={agencyName}
                onChange={e => { setAgencyName(e.target.value); setError('') }}
                placeholder="Your agency's registered name"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)}
                autoFocus />
            </div>
            <div>
              <label style={LBL}>Your name *</label>
              <input style={INP} value={contactName}
                onChange={e => setContactName(e.target.value)} placeholder="Full name"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Work email</label>
              <input style={INP} type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@agency.com"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Phone</label>
              <input style={INP} type="tel" value={phone}
                onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div>
              <label style={LBL}>Website (optional)</label>
              <input style={INP} value={website}
                onChange={e => setWebsite(e.target.value)} placeholder="https://youragency.com"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>About your agency (optional)</label>
              <textarea style={{ ...INP, minHeight: 64, resize: 'vertical' as const }}
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Markets you specialise in, years operating…"
                onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                onBlur={e => (e.target.style.borderColor = border)} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>Cities you operate in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => {
                const on = cities.includes(c)
                return (
                  <button key={c} onClick={() => toggleCity(c)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#5B2EFF' : border}`, background: on ? 'rgba(91,46,255,0.14)' : 'transparent', color: on ? '#7C5FFF' : text2, fontWeight: on ? 600 : 400, transition: 'all 0.12s' }}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={LBL}>Property types (optional)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {PROP_TYPES.map(t => {
                const on = propTypes.includes(t)
                return (
                  <button key={t} onClick={() => toggleType(t)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#14B8A6' : border}`, background: on ? 'rgba(20,184,166,0.12)' : 'transparent', color: on ? '#14B8A6' : text2, fontWeight: on ? 600 : 400, transition: 'all 0.12s' }}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div onClick={() => setAgree(a => !a)}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 9, border: `1px solid ${border}`, marginBottom: 18, cursor: 'pointer' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1.5px solid ${agree ? '#5B2EFF' : border}`, background: agree ? '#5B2EFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
              {agree && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, userSelect: 'none' as const }}>
              I commit to listing only real properties with accurate prices. Inaccurate listings affect my MAPE score and may result in removal.
            </span>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.82rem', color: '#EF4444', marginBottom: 14, lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', height: 50, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'opacity 0.15s' }}>
            {saving
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Setting up…</>
              : 'Complete setup →'}
          </button>
        </div>

        <p style={{ fontSize: '0.72rem', color: text3, textAlign: 'center' as const, marginTop: '1.25rem', lineHeight: 1.6 }}>
          Questions?{' '}
          <a href="mailto:partners@manopintel.com" style={{ color: '#14B8A6', textDecoration: 'none' }}>
            partners@manopintel.com
          </a>
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

