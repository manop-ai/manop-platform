'use client'
// components/DevelopmentEnquiryModal.tsx
// "Enquire" modal for /development/[id] pages. Submits to
// /api/developer-leads (NOT /api/inquiries — that route is for agency/
// resale listings). Carries the success-fee disclosure so the buyer
// always sees who pays MANOP and when, before they submit anything.

import { useState } from 'react'

interface Props {
  developerId: string
  projectId:   string
  unitTypeId?: string | null
  dark:        boolean
}

export default function DevelopmentEnquiryModal({ developerId, projectId, unitTypeId, dark }: Props) {
  const [open,     setOpen]     = useState(false)
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [country,  setCountry]  = useState('')
  const [note,     setNote]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState('')

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

    setSending(true)
    try {
      const res = await fetch('/api/developer-leads', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developer_id:  developerId,
          project_id:    projectId,
          unit_type_id:  unitTypeId || null,
          name:          name.trim(),
          email:         email.trim().toLowerCase() || null,
          phone:         phone.trim() || null,
          country:       country.trim() || null,
          is_diaspora:   country.trim().length > 0,
          note:          note.trim() || null,
          source:        'manop_development_page',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send enquiry.'); setSending(false); return }
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
                <div style={{ fontWeight: 700, color: text, marginBottom: 6 }}>Enquiry sent</div>
                <div style={{ fontSize: 13, color: text2 }}>MANOP will pass this to the developer and follow up with you directly.</div>
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
                <textarea style={{ ...INP, minHeight: 70 }} placeholder="Anything specific you'd like to know?" value={note} onChange={e => setNote(e.target.value)} />

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