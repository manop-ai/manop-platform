'use client'
// app/agency/onboard/page.tsx
//
// THE FIX for "Setup not complete":
// Always writes auth_user_id = user.id on every upsert.
// Tries three strategies in order:
//   1. Update row by auth_user_id (for new registrations)
//   2. Update row by contact_email (for users who registered before auth_user_id column existed)
//   3. Insert a fresh row (for users with no matching row at all)
// This covers all three states a user might be in.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const CITIES     = ['Lagos','Abuja','Port Harcourt','Accra','Nairobi','Kano','Ibadan','Enugu','Other']
const PROP_TYPES = ['Residential','Commercial','Mixed-use','Land','Off-plan','Short-let','Luxury']

export default function AgencyOnboardPage() {
  const router = useRouter()
  const { user, checking } = useAuth('agency')
  const [dark, setDark] = useState(true)

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

  useEffect(() => { setDark(getInitialDark()); return listenTheme(d => setDark(d)) }, [])

  useEffect(() => {
    if (user) {
      setContactName(user.user_metadata?.full_name || '')
      setEmail(user.email || '')
    }
  }, [user])

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
    fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }
  const LBL: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: text2, display: 'block', marginBottom: 5 }

  function toggleCity(c: string) { setCities(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]) }
  function toggleType(t: string) { setPropTypes(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t]) }

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
        auth_user_id:        user.id,          // ← THE CRITICAL FIELD
        updated_at:          new Date().toISOString(),
        notes: JSON.stringify({
          contact_name: contactName.trim(),
          phone:        phone.trim() || null,
          website:      website.trim() || null,
          prop_types:   propTypes,
          description:  description.trim() || null,
          source:       'web_onboard_v3',
        }),
      }

      // Strategy 1: update row already linked to this auth user
      const { data: byAuthId, error: e1 } = await sb
        .from('data_partners')
        .update(payload)
        .eq('auth_user_id', user.id)
        .select('id')
        .maybeSingle()

      if (!e1 && byAuthId) {
        // Row existed and was updated — done
        router.replace('/agency/dashboard')
        return
      }

      // Strategy 2: existing row by email (registered before auth_user_id column)
      if (cleanEmail) {
        const { data: byEmail, error: e2 } = await sb
          .from('data_partners')
          .update(payload)
          .eq('contact_email', cleanEmail)
          .select('id')
          .maybeSingle()

        if (!e2 && byEmail) {
          router.replace('/agency/dashboard')
          return
        }
      }

      // Strategy 3: no existing row — insert fresh
      const { error: insertErr } = await sb
        .from('data_partners')
        .insert(payload)

      if (insertErr) throw new Error(insertErr.message)

      fetch('/api/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: 'agency_onboarded', metadata: { agency: agencyName.trim(), email: cleanEmail } }),
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

        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          <div>
            <div style={{ fontWeight: 800, color: text, fontSize: 15, letterSpacing: '-0.03em' }}>Manop</div>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#14B8A6', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(91,46,255,0.08)', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 20, padding: '3px 12px', marginBottom: '0.875rem' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#7C5FFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Agency setup</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2.2rem)', fontWeight: 800, letterSpacing: '-0.04em', color: text, lineHeight: 1.1, marginBottom: '0.5rem' }}>
            Set up your agency.
          </h1>
          <p style={{ fontSize: '0.875rem', color: text2, lineHeight: 1.7 }}>
            Your profile is the foundation of your MAPE score. Buyers see your badge before your listings.
          </p>
        </div>

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>Agency / company name *</label>
              <input style={INP} value={agencyName} onChange={e => setAgencyName(e.target.value)}
                placeholder="Your agency's registered name" autoFocus />
            </div>
            <div>
              <label style={LBL}>Your name *</label>
              <input style={INP} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label style={LBL}>Work email</label>
              <input style={INP} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@agency.com" />
            </div>
            <div>
              <label style={LBL}>WhatsApp / phone</label>
              <input style={INP} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" />
            </div>
            <div>
              <label style={LBL}>Website (optional)</label>
              <input style={INP} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://youragency.com" />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={LBL}>About your agency (optional)</label>
              <textarea style={{ ...INP, minHeight: 64, resize: 'vertical' as const }} value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Markets you specialise in, years operating, what sets you apart…" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={LBL}>Cities you operate in *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {CITIES.map(c => {
                const on = cities.includes(c)
                return (
                  <button key={c} onClick={() => toggleCity(c)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#5B2EFF' : border}`, background: on ? 'rgba(91,46,255,0.14)' : 'transparent', color: on ? '#7C5FFF' : text2, fontWeight: on ? 600 : 400 }}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={LBL}>Property types</label>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 7 }}>
              {PROP_TYPES.map(t => {
                const on = propTypes.includes(t)
                return (
                  <button key={t} onClick={() => toggleType(t)}
                    style={{ padding: '0.38rem 0.875rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${on ? '#14B8A6' : border}`, background: on ? 'rgba(20,184,166,0.12)' : 'transparent', color: on ? '#14B8A6' : text2, fontWeight: on ? 600 : 400 }}>
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div onClick={() => setAgree(a => !a)}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 9, border: `1px solid ${border}`, marginBottom: 18, cursor: 'pointer' }}>
            <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1, border: `1.5px solid ${agree ? '#5B2EFF' : border}`, background: agree ? '#5B2EFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {agree && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.65, userSelect: 'none' as const }}>
              I commit to listing only real properties with accurate prices. Inaccurate listings affect my MAPE score and may result in removal from the platform.
            </span>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.7rem 0.875rem', fontSize: '0.8rem', color: '#EF4444', marginBottom: 14, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            style={{ width: '100%', height: 50, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Setting up…</>
              : 'Complete setup →'}
          </button>
        </div>

        <p style={{ fontSize: '0.72rem', color: text3, textAlign: 'center', marginTop: '1.25rem', lineHeight: 1.6 }}>
          Questions? <a href="mailto:partners@manopintel.com" style={{ color: '#14B8A6', textDecoration: 'none' }}>partners@manopintel.com</a>
        </p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}