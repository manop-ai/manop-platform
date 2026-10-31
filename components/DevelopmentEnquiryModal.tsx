'use client'
// components/DevelopmentEnquiryModal.tsx
// "Enquire" modal for /development/[id] pages. Submits to
// /api/developer-leads (NOT /api/inquiries — that route is for agency/
// resale listings). Carries the success-fee disclosure so the buyer
// always sees who pays MANOP and when, before they submit anything.

import { useState } from 'react'
import { sb } from '../lib/supabase/client'
import { describeUnit, priceLine, type UnitRow } from '../lib/unit-selection'

interface Props {
  developerId: string
  projectId:   string
  // The development's own units. The buyer may name one; nothing is chosen for them.
  units?: UnitRow[]
  neighborhood?: string | null
  city?: string | null
  countryCode?: string
  dark:        boolean
}

export default function DevelopmentEnquiryModal({ developerId, projectId, units, neighborhood, city, countryCode = 'NG', dark }: Props) {
  const [open,     setOpen]     = useState(false)
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [country,  setCountry]  = useState('')
  const [note,     setNote]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState('')
  const [attribution, setAttribution] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [unitId, setUnitId] = useState('')   // '' = no specific unit; never defaulted

  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  const INP: React.CSSProperties = {
    width: '100%', padding: '0.65rem 0.875rem',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1.5px solid ${border}`, borderRadius: 8,
    color: text, fontSize: '0.875rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const, marginBottom: 10,
  }

  async function handleSend() {
    setError('')
    if (!name.trim())                    { setError('Please enter your name.'); return }
    if (!phone.trim() && !email.trim())  { setError('Please enter a phone number or email.'); return }
    if (!attribution)                    { setError('Please confirm how MANOP will record and share this introduction.'); return }

    setSending(true)
    try {
      // The signed-in buyer is identified SERVER-SIDE from this token — the
      // request body no longer carries a user_id, so one account can't attach
      // an enquiry to another. Anonymous enquiries still work (no token).
      const { data: { session } } = await sb.auth.getSession()

      const res = await fetch('/api/developer-leads', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          project_id:    projectId,
          unit_type_id:  unitId || null,
          name:          name.trim(),
          email:         email.trim().toLowerCase() || null,
          phone:         phone.trim() || null,
          country:       country.trim() || null,
          is_diaspora:   country.trim().length > 0,
          note:          note.trim() || null,
          source:        'manop_development_page',
          neighborhood:  neighborhood || null,
          city:          city || null,
          country_code:  countryCode,
          attribution_acknowledged: attribution,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send enquiry.'); setSending(false); return }
      setReference(data.manop_lead_id || null)
      setDuplicate(!!data.duplicate)
      setSent(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    setOpen(false); setSent(false); setError('')
    setName(''); setEmail(''); setPhone(''); setCountry(''); setNote('')
    setAttribution(false); setReference(null); setDuplicate(false); setUnitId('')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', padding: '0.75rem 1rem', background: '#5B2EFF', color: '#fff',
          border: 'none', borderRadius: 9, fontSize: '0.85rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Enquire about this development
      </button>

      {/* Trust line — shown wherever this button appears, not just inside the modal */}
      <div style={{ fontSize: 11, color: text3, marginTop: 6, lineHeight: 1.4 }}>
        MANOP earns a success fee from the developer only if a transaction closes — never from you.
      </div>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={handleClose}>
          <div
            style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', maxWidth: 420, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            {sent ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✓</div>
                <div style={{ fontWeight: 700, color: text, marginBottom: 6 }}>{duplicate ? 'You already have an introduction here' : 'Enquiry sent'}</div>
                <div style={{ fontSize: 13, color: text2 }}>
                  {duplicate
                    ? 'We have added your message to the introduction already open for this development rather than creating a second one.'
                    : 'MANOP will review your enquiry and route it to the developer or partner in charge. They will then contact you.'}
                </div>
                {reference && <div style={{ fontSize: 12, color: text3, marginTop: 10 }}>Introduction reference: <strong style={{ color: text }}>{reference}</strong></div>}
                <button onClick={handleClose} style={{ marginTop: 16, background: 'transparent', border: `1px solid ${border}`, color: text, borderRadius: 8, padding: '0.5rem 1rem', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, color: text, marginBottom: 4 }}>Enquire about this development</div>
                <div style={{ fontSize: 12, color: text3, marginBottom: 14 }}>
                  MANOP earns a success fee from the developer only if this closes — never from you.
                </div>

                <input style={INP} placeholder="Full name *" value={name} onChange={e => setName(e.target.value)} />
                <input style={INP} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={INP} placeholder="Phone (with country code)" value={phone} onChange={e => setPhone(e.target.value)} />
                <input style={INP} placeholder="Country you're based in (if diaspora)" value={country} onChange={e => setCountry(e.target.value)} />
                {units && units.length > 0 && (
                  <>
                    <select aria-label="Unit you are asking about" style={INP} value={unitId} onChange={e => setUnitId(e.target.value)}>
                      <option value="">No specific unit yet</option>
                      {units.map(u => { const v = describeUnit(u); return <option key={u.id} value={u.id}>{v.label} — {priceLine(v)}</option> })}
                    </select>
                  </>
                )}
                <textarea style={{ ...INP, minHeight: 70 }} placeholder="Anything specific you'd like to know?" value={note} onChange={e => setNote(e.target.value)} />

                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11.5, color: text2, lineHeight: 1.5, marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={attribution} onChange={e => setAttribution(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    I consent to MANOP recording this enquiry, reviewing it, and then sharing my details with the developer or
                    authorised partner in charge so they can contact me. This does not commit me to buy anything. <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>How MANOP handles your details</a>.
                  </span>
                </label>

                {error && <div style={{ color: '#EF4444', fontSize: 12, marginBottom: 10 }}>{error}</div>}

                <button onClick={handleSend} disabled={sending} style={{
                  width: '100%', padding: '0.75rem', background: '#5B2EFF', color: '#fff', border: 'none',
                  borderRadius: 9, fontWeight: 700, cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1, fontFamily: 'inherit',
                }}>
                  {sending ? 'Sending…' : 'Send enquiry'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}