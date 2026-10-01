'use client'
// app/admin/verification/page.tsx — SPRINT 5
// Admin panel to review and approve pending agency/developer verifications.
// Gated by useAuth('admin') — only admin role can access.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface PendingPartner {
  id:                  string
  name:                string
  contact_name:        string
  contact_email:       string
  cities:              string[]
  verification_status: string
  created_at:          string
  phone:               string | null
  website:             string | null
  description:         string | null
}

export default function AdminVerificationPage() {
  const { user, role, checking } = useAuth('admin')
  const [dark, setDark] = useState(getInitialDark)

  const [partners, setPartners] = useState<PendingPartner[]>([])
  const [loading,  setLoading]  = useState(false)
  const [filter,   setFilter]   = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending')
  const [msg,      setMsg]      = useState<{ id: string; text: string; ok: boolean } | null>(null)

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  const loadPartners = useCallback(async () => {
    setLoading(true)
    let q = sb.from('data_partners')
      .select('id,name,contact_name,contact_email,cities,verification_status,created_at,phone,website,description')
      .order('created_at', { ascending: false })

    if (filter === 'pending') {
      q = q.eq('verification_status', 'pending')
    } else if (filter === 'approved') {
      q = q.eq('verification_status', 'approved')
    } else if (filter === 'rejected') {
      q = q.eq('verification_status', 'rejected')
    }

    const { data } = await q
    setPartners((data as PendingPartner[]) || [])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    if (user) loadPartners()
  }, [user, loadPartners])

  async function handleAction(partnerId: string, action: 'approved' | 'rejected', partnerName: string) {
    const { error } = await sb.from('data_partners')
      .update({
        verification_status: action,
        verified_at: action === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', partnerId)

    if (error) {
      setMsg({ id: partnerId, text: `Error: ${error.message}`, ok: false })
    } else {
      setMsg({ id: partnerId, text: action === 'approved' ? `✓ ${partnerName} approved` : `✗ ${partnerName} rejected`, ok: action === 'approved' })
      setPartners(prev => prev.filter(p => p.id !== partnerId))
    }
    setTimeout(() => setMsg(null), 3000)
  }

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.18)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 15 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>Admin · Verification</div>
            <div style={{ fontSize: 11, color: text3 }}>Manop trust panel</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: text3 }}>{user?.email}</div>
      </div>

      {/* Filter tabs */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex' }}>
        {(['pending','approved','rejected','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${filter === f ? '#5B2EFF' : 'transparent'}`, color: filter === f ? text : text3, fontSize: '0.8rem', fontWeight: filter === f ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>

        {msg && (
          <div style={{ background: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, padding: '0.65rem 0.875rem', fontSize: 13, color: msg.ok ? '#22C55E' : '#EF4444', marginBottom: 14 }}>
            {msg.text}
          </div>
        )}

        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
          {filter === 'pending' ? `${partners.length} awaiting review` : `${partners.length} ${filter}`}
        </div>

        {loading && <div style={{ color: text3, fontSize: 13 }}>Loading…</div>}

        {!loading && partners.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✓</div>
            <div style={{ fontSize: 14 }}>No {filter} applications</div>
          </div>
        )}

        {partners.map(p => (
          <div key={p.id} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.5rem', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem', flexWrap: 'wrap' as const, gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: text, marginBottom: 3 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: text3 }}>
                  {p.contact_name} · {p.contact_email}
                  {p.phone && ` · ${p.phone}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 10px',
                  background: p.verification_status === 'approved' ? 'rgba(34,197,94,0.12)' : p.verification_status === 'pending' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                  color: p.verification_status === 'approved' ? '#22C55E' : p.verification_status === 'pending' ? '#F59E0B' : '#EF4444',
                  border: `1px solid ${p.verification_status === 'approved' ? 'rgba(34,197,94,0.3)' : p.verification_status === 'pending' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                }}>
                  {p.verification_status}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: '0.875rem' }}>
              {p.cities?.map(c => (
                <span key={c} style={{ fontSize: 11, background: 'rgba(91,46,255,0.08)', color: '#7C5FFF', border: '1px solid rgba(91,46,255,0.2)', borderRadius: 20, padding: '2px 8px' }}>{c}</span>
              ))}
            </div>

            {p.description && (
              <div style={{ fontSize: '0.8rem', color: text2, lineHeight: 1.6, background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 7, padding: '0.65rem 0.875rem', marginBottom: '0.875rem' }}>
                {p.description}
              </div>
            )}

            <div style={{ fontSize: 11, color: text3, marginBottom: '0.875rem' }}>
              Registered: {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              {p.website && <> · <a href={p.website} target="_blank" rel="noopener noreferrer" style={{ color: '#14B8A6', textDecoration: 'none' }}>{p.website}</a></>}
            </div>

            {p.verification_status === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleAction(p.id, 'approved', p.name)}
                  style={{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✓ Approve
                </button>
                <button onClick={() => handleAction(p.id, 'rejected', p.name)}
                  style={{ background: 'transparent', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✗ Reject
                </button>
                <a href={`mailto:${p.contact_email}?subject=Manop verification — ${p.name}&body=Hi ${p.contact_name},%0D%0A%0D%0AThank you for registering with Manop. To complete your verification, please reply with:%0D%0A• CAC registration certificate%0D%0A• Business address%0D%0A%0D%0AManop Trust Team`}
                  style={{ background: 'transparent', color: '#14B8A6', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  📧 Request docs
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}