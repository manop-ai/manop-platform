'use client'
// components/InquiryModal.tsx — SPRINT 4
// "Message agency" modal — shown on property detail pages.
// Submits to /api/inquiries → saved to DB → appears in agency leads tab.
//
// Usage:
//   import InquiryModal from '../../components/InquiryModal'
//   <InquiryModal propertyId={p.id} agencyName={agencyName} dark={dark} />

import { useState } from 'react'

interface Props {
  propertyId: string
  agencyName?: string | null
  dark:        boolean
}

const INQUIRY_TYPES = [
  { key: 'viewing',  label: '👁 Request viewing' },
  { key: 'question', label: '❓ Ask a question' },
  { key: 'offer',    label: '💬 Make an offer' },
  { key: 'general',  label: '📩 General inquiry' },
]

export default function InquiryModal({ propertyId, agencyName, dark }: Props) {
  const [open,        setOpen]        = useState(false)
  const [name,        setName]        = useState('')
  const [email,       setEmail]       = useState('')
  const [message,     setMessage]     = useState('')
  const [inquiryType, setInquiryType] = useState('viewing')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)
  const [error,       setError]       = useState('')

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
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  }

  async function handleSend() {
    setError('')
    if (!name.trim())    { setError('Please enter your name.'); return }
    if (!message.trim()) { setError('Please enter a message.'); return }

    setSending(true)
    try {
      const res = await fetch('/api/inquiries', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          property_id:  propertyId,
          buyer_name:   name.trim(),
          buyer_email:  email.trim().toLowerCase() || null,
          message:      message.trim(),
          inquiry_type: inquiryType,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send message.')
        setSending(false)
        return
      }

      setSent(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSending(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setSent(false)
    setError('')
    setName('')
    setEmail('')
    setMessage('')
    setInquiryType('viewing')
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', padding: '0.75rem 1rem',
          background: '#5B2EFF', color: '#fff',
          border: 'none', borderRadius: 9,
          fontSize: '0.85rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#4920cc')}
        onMouseLeave={e => (e.currentTarget.style.background = '#5B2EFF')}
      >
        ✉ Message agency
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) handleClose() }}
        >
          <div style={{
            background: bg3, borderRadius: 16,
            padding: '1.75rem', width: '100%', maxWidth: 460,
            border: `1px solid ${border}`,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            {sent ? (
              // Success state
              <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✓</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: text, marginBottom: '0.5rem' }}>Message sent</h3>
                <p style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  {agencyName || 'The agency'} will see your inquiry in their dashboard and reply soon.
                  {email && ' We\'ll notify you by email when they respond.'}
                </p>
                <button onClick={handleClose}
                  style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1.5rem', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: text, marginBottom: '0.25rem' }}>
                      Message {agencyName || 'the agency'}
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: text3, lineHeight: 1.5 }}>
                      Your message goes directly to their leads inbox.
                    </p>
                  </div>
                  <button onClick={handleClose}
                    style={{ background: 'none', border: 'none', color: text3, cursor: 'pointer', fontSize: '1.25rem', padding: 0, lineHeight: 1 }}>
                    ×
                  </button>
                </div>

                {/* Inquiry type */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '1.25rem' }}>
                  {INQUIRY_TYPES.map(t => (
                    <button key={t.key} onClick={() => setInquiryType(t.key)}
                      style={{
                        padding: '0.35rem 0.75rem', borderRadius: 20, cursor: 'pointer',
                        fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: inquiryType === t.key ? 700 : 400,
                        border: `1.5px solid ${inquiryType === t.key ? '#5B2EFF' : border}`,
                        background: inquiryType === t.key ? 'rgba(91,46,255,0.12)' : 'transparent',
                        color: inquiryType === t.key ? '#7C5FFF' : text3,
                        transition: 'all 0.12s',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Your name *</label>
                    <input style={INP} placeholder="Full name" value={name} onChange={e => setName(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                      onBlur={e => (e.target.style.borderColor = border)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: text2, marginBottom: 5 }}>
                      Email <span style={{ color: text3, fontWeight: 400 }}>(optional — for reply notifications)</span>
                    </label>
                    <input style={INP} type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                      onBlur={e => (e.target.style.borderColor = border)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: text2, marginBottom: 5 }}>Message *</label>
                    <textarea
                      style={{ ...INP, minHeight: 90, resize: 'vertical' as const }}
                      placeholder={
                        inquiryType === 'viewing'  ? 'I\'d like to schedule a viewing. Please let me know your availability…' :
                        inquiryType === 'offer'    ? 'I\'m interested in making an offer. Please contact me to discuss…' :
                        inquiryType === 'question' ? 'I have a few questions about this property…' :
                        'I\'m interested in this property. Please get in touch…'
                      }
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      onFocus={e => (e.target.style.borderColor = '#5B2EFF')}
                      onBlur={e => (e.target.style.borderColor = border)} />
                  </div>
                </div>

                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem', fontSize: '0.78rem', color: '#EF4444', marginTop: 10 }}>
                    {error}
                  </div>
                )}

                <button onClick={handleSend} disabled={sending}
                  style={{
                    width: '100%', marginTop: 14, height: 46,
                    background: '#5B2EFF', color: '#fff',
                    border: 'none', borderRadius: 9,
                    fontSize: '0.9rem', fontWeight: 700,
                    cursor: sending ? 'default' : 'pointer',
                    fontFamily: 'inherit', opacity: sending ? 0.75 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  {sending ? (
                    <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />Sending…</>
                  ) : 'Send message →'}
                </button>

                <p style={{ fontSize: '0.68rem', color: text3, textAlign: 'center', marginTop: '0.75rem', lineHeight: 1.5 }}>
                  Manop does not share your contact details without your consent.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}