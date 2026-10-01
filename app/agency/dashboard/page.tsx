'use client'
// app/agency/dashboard/page.tsx
//
// Agencies no longer post resale listings. Every tab here is built
// around what they actually bring MANOP: developments and land/
// redevelopment opportunities under mandate, leads on those
// submissions, and transaction data. See the "Developments" and
// "Site Intelligence" sections below for the reasoning behind each.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import TransactionPromptModal from '../../../components/TransactionPromptModal'
import { ManopLogoSVG } from '../../../components/ManopLogo'
import ManopLoader from '../../../components/ManopLoader'
import ImageUploader from '../../../components/ImageUploader'
import { ExternalLink, Plus, Trash2, Building2, Circle, BadgeCheck, ShieldCheck, Star, Clock, Mail, CheckCircle2, type LucideIcon } from 'lucide-react'
import { supabase as sb } from '../../../lib/supabase'

// ─── Neighbourhood → [lng, lat] centre coords ─────────────────
const HOOD_COORDS: Record<string, [number, number]> = {
  'lekki phase 1': [3.4783, 6.4387], 'lekki phase 2': [3.5133, 6.4348],
  'lekki': [3.4900, 6.4400], 'ikoyi': [3.4253, 6.4474],
  'victoria island': [3.4163, 6.4281], 'vi': [3.4163, 6.4281],
  'eko atlantic': [3.3900, 6.4150], 'banana island': [3.4330, 6.4600],
  'ajah': [3.5725, 6.4667], 'chevron': [3.5300, 6.4350],
  'ikota': [3.5500, 6.4400], 'sangotedo': [3.6000, 6.4500],
  'osapa london': [3.5200, 6.4250], 'badore': [3.5600, 6.4667],
  'ogombo': [3.5850, 6.4600], 'oniru': [3.4600, 6.4400],
  'gbagada': [3.3917, 6.5500], 'yaba': [3.3700, 6.5100],
  'ikeja': [3.3400, 6.6000], 'ikeja gra': [3.3500, 6.6100],
  'surulere': [3.3600, 6.4900], 'magodo': [3.3800, 6.6200],
  'maryland': [3.3600, 6.5750], 'ogba': [3.3400, 6.5900],
  'festac': [3.3800, 6.4600], 'palmgrove': [3.3550, 6.5600],
  'maitama': [7.5130, 9.0740], 'asokoro': [7.5300, 9.0600],
  'wuse 2': [7.4900, 9.0700], 'wuse': [7.4800, 9.0650],
  'garki': [7.4900, 9.0500], 'gwarinpa': [7.4700, 9.0300],
  'life camp': [7.5200, 9.0400], 'utako': [7.5000, 9.0550],
  'jabi': [7.5200, 9.0250], 'katampe': [7.5450, 9.0350],
  'kado': [7.5350, 9.0450], 'apo': [7.5600, 9.0650],
  'kubwa': [7.4600, 9.0200], 'wuye': [7.4700, 9.0550],
  'gra': [7.0336, 4.8242], 'old gra': [7.0400, 4.8400],
  'rumuola': [7.0500, 4.8500], 'trans-amadi': [7.0200, 4.8100],
  'eliozu': [7.0700, 4.8600],
  'east legon': [-0.1551, 5.6408], 'cantonments': [-0.1880, 5.5700],
  'labone': [-0.2000, 5.5600], 'airport residential': [-0.2100, 5.5500],
  'north legon': [-0.1800, 5.6100], 'roman ridge': [-0.2200, 5.5900],
  'dzorwulu': [-0.1700, 5.5750], 'osu': [-0.2300, 5.5650],
  'westlands': [36.8084, -1.2697], 'karen': [36.7172, -1.3389],
  'kilimani': [36.7900, -1.2900], 'parklands': [36.8000, -1.2600],
  'muthaiga': [36.7800, -1.2500], 'lavington': [36.7500, -1.3000],
  'kileleshwa': [36.7800, -1.3200], 'langata': [36.7900, -1.3600],
}

const CITY_COORDS: Record<string, [number, number]> = {
  lagos: [3.3792, 6.5244], abuja: [7.3986, 9.0765],
  accra: [-0.1870, 5.6037], nairobi: [36.8219, -1.2921],
  'port harcourt': [7.0498, 4.8156],
}

function getCoords(neighborhood: string, city: string): { lat: number; lng: number } | null {
  const hood = neighborhood.toLowerCase().trim()
  if (HOOD_COORDS[hood]) { const [lng, lat] = HOOD_COORDS[hood]; return { lat, lng } }
  const c = city.toLowerCase().trim()
  if (CITY_COORDS[c]) { const [lng, lat] = CITY_COORDS[c]; return { lat, lng } }
  return null
}

function fmtNGN(n: number | null): string {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1000)}K`
}

interface Partner {
  id: string; name: string; contact_email: string | null; cities: string[] | null
  mape_score: number | null; mape_m: number | null; mape_a: number | null
  mape_p: number | null; mape_e: number | null; mape_i: number | null
  badge_level: string | null; verification_status: string | null
  trust_level: string | null; partner_type: string | null
}

// A development the agency submitted or was assigned — NOT a resale
// listing. Agencies no longer post resale properties; every development
// they touch flows through developer_projects, same as MANOP-sourced ones.
interface Development {
  id: string; name: string; neighborhood: string | null; city: string | null
  state: string | null; country_code: string | null
  stage: string | null; total_units: number | null; handover_date: string | null
  description: string | null; images: string[] | null; video_urls: string[] | null
  mandate_type: string | null; mandate_document_url: string | null
  fee_model: string | null; agency_fee_share_pct: number | null
  publish_status: string; reviewed_at: string | null
}

interface Lead {
  id: string; name: string; phone: string | null; email: string | null
  stage: string; created_at: string; project_id: string
  project_name?: string
  source: string | null      // 'manop_financing_developer_plan' flags a buyer
  budget_usd: number | null  // who chose Developer Installment Plan — see Finance tab
}

interface Txn {
  id: string; neighborhood: string; city: string; sold_price: number
  verification_status: string; sold_at: string
}

type Tab = 'overview' | 'developments' | 'leads' | 'finance' | 'transactions' | 'verify' | 'settings'

const BADGE_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string; bg: string; border: string }> = {
  listed:   { label: 'Listed',   icon: Circle,     color: '#94A3B8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)' },
  verified: { label: 'Verified', icon: BadgeCheck, color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)' },
  trust:    { label: 'Trust',    icon: ShieldCheck,color: '#14B8A6', bg: 'rgba(20,184,166,0.1)',   border: 'rgba(20,184,166,0.25)' },
  elite:    { label: 'Elite',    icon: Star,       color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)' },
}

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Ikoyi','Victoria Island','Eko Atlantic','Banana Island',
  'Ajah','Chevron','Oniru','Osapa London','Ikota','Sangotedo','Badore',
  'Gbagada','Yaba','Ikeja','Ikeja GRA','Surulere','Magodo','Maryland','Ogba','Festac Town','Palmgrove',
  'Maitama','Asokoro','Wuse 2','Wuse','Garki','Gwarinpa','Life Camp','Utako','Jabi','Katampe','Kado','Apo','Wuye',
  'GRA','Old GRA','Rumuola','Trans-Amadi','Eliozu',
  'East Legon','Cantonments','Labone','Airport Residential','North Legon','Roman Ridge','Dzorwulu','Osu',
  'Westlands','Karen','Kilimani','Parklands','Muthaiga','Lavington','Kileleshwa','Langata',
]

const PROFESSIONAL_BODIES = [
  { code: 'NIESV',    label: 'NIESV',     full: 'Nigerian Institution of Estate Surveyors and Valuers' },
  { code: 'ESVARBON', label: 'ESVARBON',  full: 'Estate Surveyors and Valuers Registration Board of Nigeria' },
  { code: 'EANS',     label: 'EANS',      full: 'Estate Agents and Auctioneers Association of Nigeria' },
  { code: 'ISKAN',    label: 'ISKAN',     full: 'International Society of Kijani Appraisers (Nigeria)' },
  { code: 'LASREA',   label: 'LASREA',    full: 'Lagos State Real Estate Regulatory Authority' },
  { code: 'ABUSREA',  label: 'ABUSREA',   full: 'Abuja Real Estate Regulatory Authority' },
  { code: 'RECON',    label: 'RECON',     full: 'Real Estate Council of Nigeria' },
  { code: 'AEAN',     label: 'AEAN',      full: 'Association of Estate Agents in Nigeria' },
  { code: 'GHANA_GIS',label: 'GIS Ghana', full: 'Ghana Institution of Surveyors' },
  { code: 'GHANA_GREA',label: 'GREA',     full: 'Ghana Real Estate Association' },
  { code: 'ISK',      label: 'ISK Kenya', full: 'Institution of Surveyors of Kenya' },
  { code: 'OTHER',    label: 'Other',     full: 'Other professional body' },
]

// ─────────────────────────────────────────────────────────────
// VerificationTab — association number + professional body + CAC
// ─────────────────────────────────────────────────────────────
function VerificationTab({ partner, dark, border, text, text2, text3, bg3, onStatusChange }: {
  partner: Partner; dark: boolean; border: string
  text: string; text2: string; text3: string; bg3: string
  onStatusChange: (status: string) => void
}) {
  const [method,           setMethod]           = useState<'body' | 'cac' | 'both'>('body')
  const [bodyCode,         setBodyCode]         = useState('')
  const [bodyNumber,       setBodyNumber]       = useState('')
  const [bodyYear,         setBodyYear]         = useState('')
  // ── NEW: association membership number ──────────────────────
  // This is the key field for the AEAN pilot.
  // When an agency submits their AEAN/NIESV number, Manop cross-checks
  // it against the association's membership records.
  const [assocNumber,      setAssocNumber]      = useState('')
  const [assocName,        setAssocName]        = useState('')
  // ───────────────────────────────────────────────────────────
  const [cacNumber,        setCacNumber]        = useState('')
  const [officeAddr,       setOfficeAddr]       = useState('')
  const [phone,            setPhone]            = useState('')
  const [docUrl,           setDocUrl]           = useState('')
  const [submitting,       setSubmitting]       = useState(false)
  const [submitted,        setSubmitted]        = useState(false)
  const [error,            setError]            = useState('')

  const vStatus = partner.verification_status || 'not_started'

  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${border}`, borderRadius: 9, color: text,
    fontSize: '0.875rem', padding: '0.7rem 0.9rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }
  const LBL: React.CSSProperties = {
    fontSize: '0.7rem', color: text2, fontWeight: 500,
    display: 'block', marginBottom: '0.3rem',
  }

  async function handleSubmit() {
    const needsBody = method === 'body' || method === 'both'
    const needsCAC  = method === 'cac'  || method === 'both'

    if (needsBody && !bodyCode)   { setError('Select your professional body'); return }
    if (needsBody && !bodyNumber) { setError('Enter your membership number'); return }
    if (needsCAC  && !cacNumber)  { setError('Enter your CAC registration number'); return }
    if (!officeAddr.trim())       { setError('Office address is required'); return }

    setSubmitting(true); setError('')
    try {
      const hasAssociation = Boolean(assocNumber.trim())
      const verificationType = hasAssociation
        ? 'association_membership'
        : needsBody
          ? 'professional_body'
          : needsCAC
            ? 'cac'
            : 'manop_review'

      const verReq: Record<string, unknown> = {
        data_partner_id: partner.id,
        verification_type: verificationType,
        status: 'pending',
        office_address: officeAddr.trim(),
        contact_phone: phone.trim() || null,
      }

      if (needsBody) {
        verReq.body_code = bodyCode
        verReq.membership_number = bodyNumber.trim()
        verReq.year_joined = bodyYear || null
      }

      if (hasAssociation) {
        verReq.membership_number = assocNumber.trim()
        verReq.body_code = assocName || bodyCode || null

        const { data: assoc } = await sb
          .from('associations')
          .select('id')
          .eq('short_code', assocName || bodyCode)
          .maybeSingle()

        if (assoc) verReq.association_id = assoc.id
      }

      if (needsCAC) {
        verReq.cac_number = cacNumber.trim()
        verReq.cac_doc_url = docUrl.trim() || null
      }

      const { error: insertErr } = await sb
        .from('verification_requests')
        .insert(verReq)

      if (insertErr) throw new Error(insertErr.message)

      await sb
        .from('data_partners')
        .update({ verification_status: 'pending' })
        .eq('id', partner.id)

      // Log signal for admin to pick up
      fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'verification_requested',
          metadata: {
            partner_id:         partner.id,
            agency:             partner.name,
            method,
            body_code:          bodyCode || null,
            association_number: assocNumber || null,
          },
        }),
      }).catch(() => {})

      setSubmitted(true)
      onStatusChange('pending')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed. Email partners@manopintel.com')
    } finally {
      setSubmitting(false)
    }
  }

  if (vStatus === 'verified') return (
    <div style={{ background: bg3, border: '1px solid rgba(20,184,166,0.3)', borderRadius: 14, padding: '2rem', textAlign: 'center' as const }}>
      <BadgeCheck size={40} color="#14B8A6" style={{ marginBottom: '1rem' }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: '#14B8A6', marginBottom: 8 }}>Verified</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
        Your agency is verified on Manop. The Verified badge is visible on everything you submit.
        Keep building your MAPE score to reach Trust and Elite.
      </div>
    </div>
  )

  if (vStatus === 'pending' || submitted) return (
    <div style={{ background: bg3, border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '2rem', textAlign: 'center' as const }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}><Clock size={22} color="#F59E0B" /></div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>Under review — 24–48 hours</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6 }}>
        Questions? <span style={{ color: '#14B8A6' }}>partners@manopintel.com</span>
      </div>
    </div>
  )

  return (
    <div>
      {/* What verification unlocks */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 14 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.875rem' }}>
          What verification unlocks
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { icon: BadgeCheck, label: 'Verified badge on all submissions',      color: '#60A5FA' },
            { icon: CheckCircle2, label: '+40 MAPE Ethics points',              color: '#22C55E' },
            { icon: Clock,      label: 'Faster review turnaround',              color: '#5B2EFF' },
            { icon: ShieldCheck,label: 'Eligible for Trust and Elite badges',   color: '#F59E0B' },
          ].map(w => (
            <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.6rem 0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${border}`, borderRadius: 9 }}>
              <w.icon size={15} color={w.color} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.4 }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '1.25rem' }}>
          Verification method
        </div>

        {/* Method selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
          {([
            { key: 'body', label: 'Professional body', desc: 'NIESV, AEAN, GIS, ISK etc.' },
            { key: 'cac',  label: 'CAC registration',  desc: 'Nigeria companies only' },
            { key: 'both', label: 'Both',               desc: 'Strongest verification' },
          ] as const).map(m => (
            <div key={m.key} onClick={() => setMethod(m.key)}
              style={{ padding: '0.875rem', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${method === m.key ? '#5B2EFF' : border}`, background: method === m.key ? 'rgba(91,46,255,0.08)' : 'transparent', transition: 'all 0.12s' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: method === m.key ? '#7C5FFF' : text, marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: '0.68rem', color: text3, lineHeight: 1.4 }}>{m.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

          {/* ── ASSOCIATION MEMBERSHIP NUMBER — the AEAN pilot anchor ── */}
          <div style={{
            background: dark ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.04)',
            border: '1px solid rgba(20,184,166,0.2)',
            borderRadius: 10, padding: '1rem',
          }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#14B8A6', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
              Association membership
            </div>
            <div style={{ fontSize: '0.72rem', color: text2, lineHeight: 1.6, marginBottom: 10 }}>
              If you are a member of AEAN, NIESV, LASREA, or any registered association,
              enter your membership number here. Manop cross-checks this with the association.
              This is the fastest route to verification.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={LBL}>Association name</label>
                <select
                  style={{ ...INP, cursor: 'pointer', appearance: 'none' as const }}
                  value={assocName}
                  onChange={e => setAssocName(e.target.value)}
                >
                  <option value="">Select association</option>
                  {PROFESSIONAL_BODIES.map(b => (
                    <option key={b.code} value={b.code}>{b.label} — {b.full}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LBL}>Membership / registration number</label>
                <input
                  style={INP}
                  placeholder="e.g. AEAN/2019/00123"
                  value={assocNumber}
                  onChange={e => { setAssocNumber(e.target.value); setError('') }}
                />
              </div>
            </div>
            {assocNumber && (
              <div style={{ marginTop: 8, fontSize: '0.68rem', color: '#14B8A6', display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={12} />
                <span>Manop will cross-check this number with {assocName || 'the association'} records within 24 hours</span>
              </div>
            )}
          </div>

          {/* Professional body fields */}
          {(method === 'body' || method === 'both') && (
            <div style={{ background: dark ? 'rgba(91,46,255,0.05)' : 'rgba(91,46,255,0.03)', border: '1px solid rgba(91,46,255,0.15)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7C5FFF', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>
                Professional body membership
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div>
                  <label style={LBL}>Professional body *</label>
                  <select style={{ ...INP, cursor: 'pointer', appearance: 'none' as const }} value={bodyCode} onChange={e => setBodyCode(e.target.value)}>
                    <option value="">Select body</option>
                    {PROFESSIONAL_BODIES.map(b => (
                      <option key={b.code} value={b.code}>{b.label} — {b.full}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={LBL}>Membership number *</label>
                    <input style={INP} placeholder="e.g. NIESV/001234" value={bodyNumber}
                      onChange={e => { setBodyNumber(e.target.value); setError('') }} />
                  </div>
                  <div>
                    <label style={LBL}>Year joined (optional)</label>
                    <input style={INP} placeholder="e.g. 2018" value={bodyYear} onChange={e => setBodyYear(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CAC fields */}
          {(method === 'cac' || method === 'both') && (
            <div>
              <label style={LBL}>CAC registration number *</label>
              <input style={INP} placeholder="RC123456" value={cacNumber}
                onChange={e => { setCacNumber(e.target.value); setError('') }} />
            </div>
          )}

          {/* Common fields */}
          <div>
            <label style={LBL}>Office address *</label>
            <input style={INP} placeholder="Full office address including state" value={officeAddr}
              onChange={e => { setOfficeAddr(e.target.value); setError('') }} />
          </div>
          <div>
            <label style={LBL}>Contact phone</label>
            <input style={INP} type="tel" placeholder="+234 800 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>
              Document URL{' '}
              <span style={{ color: text3, fontWeight: 400 }}>
                (optional — membership certificate on Google Drive / Cloudinary)
              </span>
            </label>
            <input style={INP} placeholder="https://drive.google.com/..." value={docUrl} onChange={e => setDocUrl(e.target.value)} />
            <div style={{ fontSize: '0.68rem', color: text3, marginTop: 4, lineHeight: 1.55 }}>
              Or email docs to{' '}
              <span style={{ color: '#14B8A6' }}>partners@manopintel.com</span>
              {' '}— Subject: "Verify — {partner.name}"
            </div>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginTop: 14 }}>
            {error}
          </div>
        )}

        <button onClick={handleSubmit} disabled={submitting}
          style={{ width: '100%', height: 48, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 700, cursor: submitting ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 16, opacity: submitting ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {submitting ? (
            <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Submitting…</>
          ) : 'Submit for verification →'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAPEWidget — unchanged from original
// ─────────────────────────────────────────────────────────────
function MAPEWidget({ partner, developments, dark, border, text, text2, text3, bg3, onGoVerify }: {
  partner: Partner; developments: Development[]; dark: boolean
  border: string; text: string; text2: string; text3: string; bg3: string
  onGoVerify: () => void
}) {
  const badge     = partner.badge_level || 'listed'
  const badgeConf = BADGE_CONFIG[badge] || BADGE_CONFIG.listed
  const total     = Math.round(partner.mape_score || 0)
  const scores    = {
    m: Math.round(partner.mape_m || 0),
    a: Math.round(partner.mape_a || 0),
    p: Math.round(partner.mape_p || 0),
    e: Math.round(partner.mape_e || 0),
    i: Math.round(partner.mape_i || 0),
  }
  const vStatus = partner.verification_status || 'not_started'

  function nextAction() {
    if (vStatus === 'not_started' || vStatus === 'unsubmitted')
      return { label: 'Submit your association or professional body membership. Unlocks +40 Ethics points and the Verified badge.', cta: 'Submit verification →', color: '#60A5FA', onClick: onGoVerify }
    if (developments.length === 0)
      return { label: 'Submit your first development or land opportunity. A complete submission with documents earns Market Quality points once MANOP reviews it.', cta: null, color: '#5B2EFF' }
    const published = developments.filter(d => d.publish_status === 'published').length
    if (published === 0)
      return { label: `${developments.length} development${developments.length !== 1 ? 's' : ''} submitted, none published yet — MANOP review is what moves a submission forward.`, cta: null, color: '#5B2EFF' }
    if (scores.i < 30)
      return { label: 'Log a closed transaction. Each verified transaction earns +20 Intelligence points — permanent, never decay.', cta: null, color: '#F59E0B' }
    return { label: 'Reply to new leads within 4 hours. Response speed is the biggest Performance score driver.', cta: null, color: '#22C55E' }
  }

  const next = nextAction()
  const dims = [
    { key: 'm', label: 'Market quality', max: 200, val: scores.m, color: '#5B2EFF' },
    { key: 'a', label: 'Activity',       max: 150, val: scores.a, color: '#14B8A6' },
    { key: 'p', label: 'Performance',    max: 250, val: scores.p, color: '#22C55E' },
    { key: 'e', label: 'Ethics',         max: 100, val: scores.e, color: '#F59E0B' },
    { key: 'i', label: 'Intelligence',   max: 300, val: scores.i, color: '#F59E0B' },
  ]

  return (
    <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: badgeConf.bg, border: `1px solid ${badgeConf.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: badgeConf.color, flexShrink: 0 }}>
          <badgeConf.icon size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: badgeConf.color }}>{badgeConf.label}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: text, letterSpacing: '-0.03em' }}>{total}</span>
            <span style={{ fontSize: 11, color: text3 }}>/1000 pts</span>
          </div>
          <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>MAPE score — updated nightly</div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {(['listed', 'verified', 'trust', 'elite'] as const).map(b => {
            const bc = BADGE_CONFIG[b]; const isA = b === badge
            return (
              <div key={b} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: isA ? bc.bg : 'transparent', border: `1px solid ${isA ? bc.border : border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isA ? bc.color : text3 }}><bc.icon size={13} /></div>
                <div style={{ fontSize: '0.45rem', color: isA ? bc.color : text3, fontWeight: isA ? 700 : 400 }}>{bc.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: '1.25rem' }}>
        {dims.map(d => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: text3, textTransform: 'uppercase' as const, letterSpacing: '0.08em', width: 90, flexShrink: 0 }}>{d.label}</div>
            <div style={{ flex: 1, height: 6, background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (d.val / d.max) * 100)}%`, height: '100%', background: d.color, borderRadius: 3, transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: text, width: 50, textAlign: 'right' as const, flexShrink: 0 }}>{d.val}/{d.max}</div>
          </div>
        ))}
      </div>

      <div style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem 1rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: next.color, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 6 }}>→ Highest impact next action</div>
        <div style={{ fontSize: '0.8rem', color: text2, lineHeight: 1.65, marginBottom: next.onClick ? 10 : 0 }}>{next.label}</div>
        {next.onClick && (
          <button onClick={next.onClick}
            style={{ fontSize: '0.78rem', fontWeight: 700, color: next.color, background: 'transparent', border: `1px solid ${next.color}30`, borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {next.cta}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────
export default function AgencyDashboard() {
  const { user, checking } = useAuth('agency')
  const [dark, setDark]         = useState(getInitialDark)
  const [partner, setPartner]   = useState<Partner | null>(null)
  const [developments, setDevelopments] = useState<Development[]>([])
  const [leads, setLeads]       = useState<Lead[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [tab, setTab]           = useState<Tab>('overview')
  const [loading, setLoading]   = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')

  // Log a transaction — reachable directly from the Transactions tab now,
  // not only right after adding a listing (agencies don't add listings
  // anymore, and a transaction they closed shouldn't need one anyway).
  const [showTxPrompt,   setShowTxPrompt]   = useState(false)
  const [txNeighborhood, setTxNeighborhood] = useState('')
  const [txCityInput,    setTxCityInput]    = useState('')

  useEffect(() => { return listenTheme(d => setDark(d)) }, [])

  const loadAgencyData = useCallback(async (id: string) => {
    setLoading(true)
    const { data: devs } = await sb.from('developer_projects')
      .select('id,name,neighborhood,city,state,country_code,stage,total_units,handover_date,description,images,video_urls,mandate_type,mandate_document_url,fee_model,agency_fee_share_pct,publish_status,reviewed_at')
      .eq('submitting_agency_id', id)
      .order('created_at', { ascending: false })
    const devList = (devs as Development[]) || []
    setDevelopments(devList)

    const projectIds = devList.map(d => d.id)
    if (projectIds.length > 0) {
      const { data: leadRows } = await sb.from('developer_leads')
        .select('id,name,phone,email,stage,created_at,project_id,source,budget_usd')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      const nameById = Object.fromEntries(devList.map(d => [d.id, d.name]))
      setLeads(((leadRows as Lead[]) || []).map(l => ({ ...l, project_name: nameById[l.project_id] })))
    } else {
      setLeads([])
    }

    const { data: txRows } = await sb.from('market_transactions')
      .select('id,neighborhood,city,sold_price,verification_status,sold_at')
      .eq('submitted_by', id)
      .order('sold_at', { ascending: false })
    setTransactions((txRows as Txn[]) || [])

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!user) return
    async function loadPartner() {
      try {
        const { data: byAuthId } = await sb.from('data_partners')
          .select('id,name,contact_email,cities,mape_score,mape_m,mape_a,mape_p,mape_e,mape_i,badge_level,verification_status,trust_level,partner_type')
          .eq('auth_user_id', user.id)
          .maybeSingle()

        if (byAuthId?.id) {
          setPartner(byAuthId as Partner)
          loadAgencyData(byAuthId.id)
          return
        }

        const cleanEmail = (user.email || '').trim().toLowerCase()
        if (!cleanEmail) return

        const { data: byEmail } = await sb.from('data_partners')
          .select('id,name,contact_email,cities,mape_score,mape_m,mape_a,mape_p,mape_e,mape_i,badge_level,verification_status,trust_level,partner_type')
          .ilike('contact_email', cleanEmail)
          .limit(1)

        const emailPartner = Array.isArray(byEmail) ? byEmail[0] : null
        if (emailPartner?.id) {
          setPartner(emailPartner as Partner)
          loadAgencyData(emailPartner.id)
          return
        }
      } catch (err) {
        console.error('[Dashboard] loadPartner:', err)
      }
    }
    loadPartner()
  }, [user, loadAgencyData])

  async function signOut() { await sb.auth.signOut() }

  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const bg2    = dark ? '#111827' : '#F8FAFC'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3  = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.58)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.16)'
  const cardShadow = dark ? 'none' : '0 1px 2px rgba(15,23,42,0.08)'
  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.85rem', outline: 'none', padding: '0.65rem 0.875rem',
    fontFamily: 'inherit', width: '100%',
  }

  const published    = developments.filter(d => d.publish_status === 'published').length
  const underReview  = developments.filter(d => d.publish_status !== 'published').length
  const badge      = partner?.badge_level || 'listed'
  const badgeConf  = BADGE_CONFIG[badge] || BADGE_CONFIG.listed
  const vStatus    = partner?.verification_status || 'not_started'
  const isVerified = vStatus === 'verified' || vStatus === 'approved' ||
                     badge === 'verified' || badge === 'trust' || badge === 'elite'

  // Leads that came in through Get Financed choosing a Developer
  // Installment Plan, not "Enquire about this development" — same
  // developer_leads pipeline, tagged at the source so it's a filtered
  // view, not a second lead system.
  const financeLeads = leads.filter(l => l.source === 'manop_financing_developer_plan')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'developments', label: `Developments (${developments.length})` },
    { key: 'leads',        label: `Leads (${leads.length})` },
    { key: 'finance',      label: `Finance (${financeLeads.length})` },
    { key: 'transactions', label: 'Transactions' },
    { key: 'verify',       label: vStatus === 'verified' ? 'Verified' : 'Get verified' },
    { key: 'settings',     label: 'Profile' },
  ]

  // These live on other domains (Site Intelligence owns the schema for
  // both) — real separate destinations with their own tab-bar slot,
  // rather than folded into Developments or faked as embedded panels.
  // A visible "go there" link is the honest version of "own world" when
  // the actual page can't be embedded without duplicating someone else's
  // implementation.
  const EXTERNAL_NAV: { href: string; label: string }[] = [
    { href: '/site-intelligence/submit', label: 'Site Submission' },
    { href: '/site-intelligence',        label: 'Land & Redevelopment' },
  ]

  if (checking || (user && !partner && loading)) return <ManopLoader dark={dark} label="Loading your dashboard…" />

  if (user && !partner) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: text }}>
      <div style={{ maxWidth: 440, textAlign: 'center' as const }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: text, marginBottom: '0.75rem' }}>Setup not complete</h2>
        <p style={{ fontSize: '0.85rem', color: text2, marginBottom: '1.5rem', lineHeight: 1.65 }}>Your agency profile isn't set up yet.</p>
        <Link href="/agency/onboard" style={{ background: '#5B2EFF', color: '#fff', borderRadius: 8, padding: '0.65rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>
          Complete setup →
        </Link>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* ── Top bar ── */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Real logo — replaces purple M square */}
          <Link href="/" style={{ display: 'flex', textDecoration: 'none' }}>
            <ManopLogoSVG height={80} dark={dark} showText={false} />
          </Link>
          <div style={{ width: 1, height: 20, background: border }} />
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{partner?.name}</div>
            <div style={{ fontSize: 11, color: text3 }}>{(partner?.cities || []).join(', ')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: badgeConf.bg, border: `1px solid ${badgeConf.border}`, borderRadius: 20, padding: '3px 10px' }}>
            <badgeConf.icon size={11} color={badgeConf.color} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: badgeConf.color }}>{badgeConf.label}</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: text3, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 20, padding: '3px 10px', border: `1px solid ${border}` }}>
            {Math.round(partner?.mape_score || 0)}/1000 pts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/developments" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View public site</Link>
          <button onClick={signOut} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const, alignItems: 'center' }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key)}
            style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#5B2EFF' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: border, margin: '0 6px', flexShrink: 0 }} />
        {EXTERNAL_NAV.map(n => (
          <Link key={n.href} href={n.href} target="_blank"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.75rem 1rem', color: text3, fontSize: '0.8rem', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>
            {n.label} <ExternalLink size={12} />
          </Link>
        ))}
      </div>

      {saveMsg && (
        <div style={{ background: 'rgba(34,197,94,0.1)', padding: '0.5rem 1.5rem', fontSize: 13, color: '#22C55E', borderBottom: `1px solid ${border}` }}>
          {saveMsg}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {/* ── Overview ── */}
        {tab === 'overview' && partner && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              {[
                { label: 'Developments',   value: developments.length, color: '#7C5FFF' },
                { label: 'Published',      value: published,           color: '#0D9488' },
                { label: 'Under review',   value: underReview,         color: '#F59E0B' },
                { label: 'Open leads',     value: leads.length,        color: '#5B2EFF' },
              ].map(s => (
                <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem', boxShadow: cardShadow }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <MAPEWidget partner={partner} developments={developments} dark={dark} border={border} text={text} text2={text2} text3={text3} bg3={bg3} onGoVerify={() => setTab('verify')} />

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Recent developments</div>
            {developments.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '3rem', color: text3 }}>
                <Building2 size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
                <button onClick={() => setTab('developments')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'block', margin: '0 auto' }}>
                  Submit your first development →
                </button>
              </div>
            ) : developments.slice(0, 5).map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6, boxShadow: cardShadow }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.name} — {d.neighborhood}, {d.city}
                  </div>
                  <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>{d.stage || '—'} · {d.total_units ?? '—'} units</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: d.reviewed_at ? '#0D9488' : '#F59E0B', background: d.reviewed_at ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 20, padding: '3px 8px', flexShrink: 0 }}>
                  {d.reviewed_at ? 'MANOP Review' : d.publish_status}
                </span>
              </div>
            ))}
          </>
        )}

        {/* ── Developments — submission + tracking, together ──────────
             Agencies bring MANOP developments and land/redevelopment
             opportunities under mandate, never resale listings. Creating
             a new one and managing existing ones live on the same tab so
             there's one place to think about "what am I bringing MANOP",
             not two. */}
        {tab === 'developments' && partner && (
          <AgencyDevelopmentsTab
            partner={partner} developments={developments} dark={dark}
            bg2={bg2} bg3={bg3} border={border} text={text} text2={text2} text3={text3}
            onSubmitted={() => loadAgencyData(partner.id)}
          />
        )}

        {/* ── Leads — real developer_leads for this agency's developments ── */}
        {tab === 'leads' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>
              Leads on your developments
            </div>
            {leads.length === 0 ? (
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', color: text2, textAlign: 'center' as const, boxShadow: cardShadow }}>
                <Mail size={24} style={{ marginBottom: 10, opacity: 0.5 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>No leads yet</div>
                <div style={{ fontSize: 13, lineHeight: 1.65 }}>Enquiries from the public development page for anything you've submitted will appear here — and land in MANOP's inbox the moment they come in.</div>
              </div>
            ) : (
              leads.map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 8, boxShadow: cardShadow }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{l.name} — {l.project_name || 'Development'}</div>
                    <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>
                      {[l.phone, l.email].filter(Boolean).join(' · ') || 'No contact provided'} · {new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: text3, background: bg2, borderRadius: 20, padding: '3px 8px', textTransform: 'capitalize' as const }}>{l.stage}</span>
                </div>
              ))
            )}
          </>
        )}

        {/* ── Finance — buyers who chose Developer Installment Plan in
             Get Financed on one of this agency's mandated developments.
             Same developer_leads table as the Leads tab, filtered by
             source — not a second lead system. ─────────────────────── */}
        {tab === 'finance' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>
              Financing enquiries on your developments
            </div>
            <div style={{ fontSize: 13, color: text2, lineHeight: 1.65, marginBottom: 14, maxWidth: 640 }}>
              Buyers who asked about a developer installment plan rather than a bank mortgage. MANOP
              doesn't structure the plan — pass it to the developer you're mandated by, or handle it
              directly if that's your arrangement with them.
            </div>
            {financeLeads.length === 0 ? (
              <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', color: text2, textAlign: 'center' as const, boxShadow: cardShadow }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>No installment-plan enquiries yet</div>
                <div style={{ fontSize: 13, lineHeight: 1.65 }}>These come from the "Get Financed" flow on your published developments.</div>
              </div>
            ) : (
              financeLeads.map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 8, boxShadow: cardShadow }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{l.name} — {l.project_name || 'Development'}</div>
                    <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>
                      {[l.phone, l.email].filter(Boolean).join(' · ') || 'No contact provided'}
                      {l.budget_usd ? ` · ~$${l.budget_usd.toLocaleString()} budget` : ''}
                      {' · '}{new Date(l.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: text3, background: bg2, borderRadius: 20, padding: '3px 8px', textTransform: 'capitalize' as const }}>{l.stage}</span>
                </div>
              ))
            )}

            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginTop: 18, boxShadow: cardShadow }}>
              <div style={{ fontWeight: 700, color: text, fontSize: 14, marginBottom: 4 }}>Investment Intelligence</div>
              <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, marginBottom: 10 }}>
                Run the yield, debt cover and cashflow numbers on one of your mandated developments the
                way an investor buyer would.
              </div>
              <Link href="/calculator" target="_blank" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#5B2EFF', textDecoration: 'none' }}>
                Open Investment Intelligence <ExternalLink size={12} />
              </Link>
            </div>
          </>
        )}

        {/* ── Transactions — standalone, reachable without adding
             anything first. This is the fix for the old flow where the
             only way in was a modal that popped up right after saving a
             listing agencies no longer post. ────────────────────────── */}
        {tab === 'transactions' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>
              Transactions — contribute closed-deal data
            </div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 16, boxShadow: cardShadow }}>
              <p style={{ fontSize: 13, color: text2, lineHeight: 1.65, marginBottom: 14 }}>
                Log a sale or rental you've closed — you don't need an active listing here to do it.
                Each verified transaction earns +20 Intelligence score points and strengthens the
                neighborhood benchmark for everyone.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                <input style={{ ...INP, maxWidth: 220 }} placeholder="Neighborhood *" value={txNeighborhood} onChange={e => setTxNeighborhood(e.target.value)} />
                <input style={{ ...INP, maxWidth: 180 }} placeholder="City" value={txCityInput || partner.cities?.[0] || ''} onChange={e => setTxCityInput(e.target.value)} />
                <button
                  onClick={() => txNeighborhood.trim() && setShowTxPrompt(true)}
                  disabled={!txNeighborhood.trim()}
                  style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.65rem 1.25rem', fontSize: 13, fontWeight: 700, cursor: txNeighborhood.trim() ? 'pointer' : 'default', opacity: txNeighborhood.trim() ? 1 : 0.5, fontFamily: 'inherit' }}>
                  Log a transaction →
                </button>
              </div>
            </div>

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Your submissions</div>
            {transactions.length === 0 ? (
              <div style={{ fontSize: 13, color: text3, textAlign: 'center' as const, padding: '1.5rem' }}>No transactions logged yet.</div>
            ) : (
              transactions.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6, boxShadow: cardShadow }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{t.neighborhood}, {t.city}</div>
                    <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>{new Date(t.sold_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: '#7C5FFF' }}>{fmtNGN(t.sold_price)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.verification_status === 'verified' ? '#0D9488' : '#F59E0B', background: t.verification_status === 'verified' ? 'rgba(13,148,136,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: 20, padding: '3px 8px', textTransform: 'capitalize' as const }}>
                      {t.verification_status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* ── Verify ── */}
        {tab === 'verify' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Verification</div>
            <VerificationTab
              partner={partner} dark={dark} border={border} text={text} text2={text2} text3={text3} bg3={bg3}
              onStatusChange={status => {
                setPartner(p => p ? { ...p, verification_status: status } : p)
                setSaveMsg('Verification submitted — under review within 48 hours')
              }}
            />
          </>
        )}

        {/* ── Settings ── */}
        {tab === 'settings' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Agency profile</div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><label style={{ fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }}>Agency name</label><input style={INP} defaultValue={partner.name} /></div>
                <div><label style={{ fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }}>Contact email</label><input style={INP} defaultValue={partner.contact_email || ''} /></div>
              </div>
              <div style={{ fontSize: 12, color: text3, lineHeight: 1.7 }}>
                <strong>Partner ID:</strong> <span style={{ fontFamily: 'monospace' }}>{partner.id}</span><br />
                <strong>Cities:</strong> {(partner.cities || []).join(', ')}
              </div>
            </div>
          </>
        )}
      </div>

      {/*
        Renders outside the tab div so it's a proper full-screen overlay
        regardless of which tab is active. Reachable directly from the
        Transactions tab now — no longer tied to adding a listing.
      */}
      {showTxPrompt && partner && (
        <TransactionPromptModal
          partnerId={partner.id}
          neighborhood={txNeighborhood}
          city={txCityInput || partner.cities?.[0] || ''}
          dark={dark}
          onClose={() => { setShowTxPrompt(false); loadAgencyData(partner.id) }}
        />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// AgencyDevelopmentsTab — submission + tracking, together.
//
// This is a REAL development submission, not a name-and-neighborhood
// stub — a developer or agency deciding whether to bring MANOP a
// project needs to provide what they'd provide anywhere else: unit
// types and pricing, a real image gallery, and supporting documents.
// Everything here lands in draft/pending_review and shows up in the
// admin's global Pending Review list (app/admin/developments/page.tsx)
// for MANOP to continue and publish — this form does not publish
// anything itself.
//
// Site Submission and Land & Redevelopment For Sale are NOT part of
// this tab — those are separate destinations in the tab bar above,
// owned by the Site Intelligence domain. A development here always has
// a developer attached (developer_projects.developer_id is NOT NULL);
// raw land with no developer belongs in `sites`, not here.
// ─────────────────────────────────────────────────────────────
interface UnitTypeRow {
  unit_type: string; price_ngn: string; size_sqm: string
  available_count: string; deposit_pct: string; installment_months: string
}
interface DocRow {
  document_type: string; document_name: string; document_url: string
}

const DOC_TYPES = ['cac', 'land_title', 'planning_approval', 'building_approval', 'survey', 'allocation', 'other']

function emptyUnitRow(): UnitTypeRow {
  return { unit_type: '', price_ngn: '', size_sqm: '', available_count: '', deposit_pct: '', installment_months: '' }
}
function emptyDocRow(): DocRow {
  return { document_type: 'other', document_name: '', document_url: '' }
}

function AgencyDevelopmentsTab({ partner, developments, dark, bg2, bg3, border, text, text2, text3, onSubmitted }: {
  partner: Partner; developments: Development[]; dark: boolean
  bg2: string; bg3: string; border: string; text: string; text2: string; text3: string
  onSubmitted: () => void
}) {
  const [showForm, setShowForm] = useState(developments.length === 0)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [name, setName]                 = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity]                 = useState(partner.cities?.[0] || '')
  const [state, setState]               = useState('')
  const [countryCode, setCountryCode]   = useState('NG')
  const [stage, setStage]               = useState('Foundation')
  const [totalUnits, setTotalUnits]     = useState('')
  const [handoverDate, setHandoverDate] = useState('')
  const [description, setDescription]   = useState('')
  const [developerName, setDeveloperName] = useState('')
  const [mandateType, setMandateType]   = useState<'direct_authority' | 'developer_mandate'>('direct_authority')
  const [mandateDocUrl, setMandateDocUrl] = useState('')
  const [feeModel, setFeeModel]         = useState<'developer_success_fee' | 'agency_commission_share'>('developer_success_fee')
  const [feeSharePct, setFeeSharePct]   = useState('25')
  const [images, setImages]             = useState<string[]>([])
  const [unitRows, setUnitRows]         = useState<UnitTypeRow[]>([emptyUnitRow()])
  const [docRows, setDocRows]           = useState<DocRow[]>([emptyDocRow()])
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')

  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.85rem', outline: 'none', padding: '0.65rem 0.875rem',
    fontFamily: 'inherit', width: '100%',
  }
  const SMALL_INP: React.CSSProperties = { ...INP, padding: '0.5rem 0.6rem', fontSize: '0.8rem' }
  const LBL: React.CSSProperties = { fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

  function updateUnitRow(i: number, field: keyof UnitTypeRow, val: string) {
    setUnitRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }
  function updateDocRow(i: number, field: keyof DocRow, val: string) {
    setDocRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function resetForm() {
    setEditingId(null)
    setName(''); setNeighborhood(''); setTotalUnits(''); setHandoverDate('')
    setDeveloperName(''); setMandateDocUrl(''); setDescription('')
    setImages([]); setUnitRows([emptyUnitRow()]); setDocRows([emptyDocRow()])
  }

  // Editing something already submitted — only fields the agency itself
  // provided are touched here (developer identity and unit types/
  // documents stay as originally submitted; those need their own review
  // trail and aren't part of this pass). Construction stage, unit count,
  // handover date, description, and the gallery are exactly the things
  // that go stale between submission and MANOP's review, so those are
  // what this unlocks.
  function startEdit(d: Development) {
    setEditingId(d.id)
    setName(d.name)
    setNeighborhood(d.neighborhood || '')
    setCity(d.city || '')
    setState(d.state || '')
    setStage(d.stage || 'Foundation')
    setTotalUnits(d.total_units != null ? String(d.total_units) : '')
    setHandoverDate(d.handover_date ? d.handover_date.slice(0, 10) : '')
    setDescription(d.description || '')
    setImages(d.images || [])
    setShowForm(true)
  }

  async function updateDevelopment() {
    if (!editingId) return
    setError('')
    if (!name.trim())         { setError('Development name is required'); return }
    if (!neighborhood.trim()) { setError('Neighborhood is required'); return }

    setSubmitting(true)
    try {
      const coords = getCoords(neighborhood, city)
      const { error: updErr } = await sb.from('developer_projects').update({
        name:          name.trim(),
        location:      [neighborhood, city].filter(Boolean).join(', ') || name.trim(),
        neighborhood:  neighborhood.trim(),
        city:          city.trim() || null,
        state:         state.trim() || null,
        stage,
        total_units:   totalUnits ? parseInt(totalUnits) : null,
        handover_date: handoverDate || null,
        description:   description.trim() || null,
        images,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      }).eq('id', editingId)

      if (updErr) throw new Error(updErr.message)

      setSuccess('Changes saved.')
      setTimeout(() => { setSuccess(''); resetForm(); setShowForm(false); onSubmitted() }, 1400)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmit() {
    setError('')
    if (!name.trim())          { setError('Development name is required'); return }
    if (!neighborhood.trim())  { setError('Neighborhood is required'); return }
    if (!developerName.trim()) { setError('Developer name is required — the developer this belongs to, even if unclaimed on MANOP yet'); return }
    if (!mandateDocUrl.trim()) { setError('A mandate document is required — MANOP does not accept submissions without proof of authority to list'); return }

    setSubmitting(true)
    try {
      // Find or create an unclaimed developer_accounts row — same
      // "unclaimed until they log in" pattern the admin panel uses, so
      // an agency submission never needs the developer to have a MANOP
      // account first.
      let developerId: string
      const { data: existingDev } = await sb.from('developer_accounts')
        .select('id').ilike('company_name', developerName.trim()).limit(1).maybeSingle()

      if (existingDev?.id) {
        developerId = existingDev.id
      } else {
        const { data: newDev, error: devErr } = await sb.from('developer_accounts').insert({
          company_name:   developerName.trim(),
          country_code:   countryCode,
          city:           city || null,
          account_status: 'unclaimed',
          added_by:       'agency_submission',
        }).select('id').single()
        if (devErr) throw new Error(devErr.message)
        developerId = newDev.id
      }

      const coords = getCoords(neighborhood, city)

      const { data: newProject, error: projErr } = await sb.from('developer_projects').insert({
        developer_id:         developerId,
        name:                 name.trim(),
        location:             [neighborhood, city].filter(Boolean).join(', ') || name.trim(),
        neighborhood:         neighborhood.trim(),
        city:                 city.trim() || null,
        state:                state.trim() || null,
        country_code:         countryCode,
        stage,
        total_units:          totalUnits ? parseInt(totalUnits) : null,
        handover_date:        handoverDate || null,
        description:          description.trim() || null,
        images,
        lat:                  coords?.lat ?? null,
        lng:                  coords?.lng ?? null,
        entry_source:         'manop_sourced',
        publish_status:       'pending_review',
        submitted_via:        'agency_submission',
        submitting_agency_id: partner.id,
        mandate_type:         mandateType,
        mandate_document_url: mandateDocUrl.trim(),
        fee_model:            feeModel,
        agency_fee_share_pct: feeModel === 'agency_commission_share' ? parseFloat(feeSharePct) : null,
      }).select('id').single()

      if (projErr) throw new Error(projErr.message)
      const projectId = newProject.id

      // Unit types — only rows where the agency actually filled something in
      const validUnits = unitRows.filter(r => r.unit_type.trim() && r.price_ngn.trim())
      if (validUnits.length > 0) {
        const { error: unitErr } = await sb.from('developer_unit_types').insert(
          validUnits.map(r => ({
            project_id:      projectId,
            unit_type:       r.unit_type.trim(),
            price_ngn:       parseFloat(r.price_ngn) || 0,
            size_sqm:        r.size_sqm ? parseFloat(r.size_sqm) : null,
            available_count: r.available_count ? parseInt(r.available_count) : null,
            deposit_pct:     r.deposit_pct ? parseFloat(r.deposit_pct) : null,
            installment_months: r.installment_months ? parseInt(r.installment_months) : null,
          }))
        )
        if (unitErr) console.error('[unit types]', unitErr.message) // non-fatal — project already saved
      }

      // Documents — only rows with both a name and a URL
      const validDocs = docRows.filter(r => r.document_name.trim() && r.document_url.trim())
      if (validDocs.length > 0) {
        const { error: docErr } = await sb.from('developer_documents').insert(
          validDocs.map(r => ({
            developer_id:  developerId,
            project_id:    projectId,
            document_type: r.document_type,
            document_name: r.document_name.trim(),
            document_url:  r.document_url.trim(),
            provided_by:   partner.name,
          }))
        )
        if (docErr) console.error('[documents]', docErr.message) // non-fatal
      }

      // Always the mandate letter itself, recorded as a document too —
      // not just the free-text URL field on developer_projects.
      await sb.from('developer_documents').insert({
        developer_id:  developerId,
        project_id:    projectId,
        document_type: 'other',
        document_name: 'Mandate letter',
        document_url:  mandateDocUrl.trim(),
        provided_by:   partner.name,
      })

      // Straight to MANOP's inbox — a new submission needs review before
      // anything happens with it.
      void fetch('/api/notify/agency-submission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_name: partner.name, development_name: name.trim(),
          developer_name: developerName.trim(), neighborhood, city,
          project_id: projectId,
        }),
      }).catch(() => { /* non-critical — ignore */ })

      setSuccess(`${name.trim()} submitted for MANOP review.`)
      resetForm()
      setTimeout(() => { setSuccess(''); setShowForm(false); onSubmitted() }, 1600)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>
          Your developments
        </div>
        <button onClick={() => { if (showForm) resetForm(); setShowForm(v => !v) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: showForm ? 'transparent' : '#5B2EFF', color: showForm ? text2 : '#fff', border: showForm ? `1px solid ${border}` : 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showForm ? 'Cancel' : <><Plus size={14} /> Submit a development</>}
        </button>
      </div>

      {showForm && (
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: text3, lineHeight: 1.6, marginBottom: 16 }}>
            {editingId
              ? "Editing what you've already submitted — construction stage, unit count, handover date, description, and the gallery. The developer and mandate on file stay as originally submitted."
              : "A development under mandate — never a resale listing. MANOP reviews every submission before it's published; nothing goes live automatically."}
          </p>

          {/* ── Basics ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Development name *</label>
              <input style={INP} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Eko Gardens Phase 2" />
            </div>
            <div>
              <label style={LBL}>Developer name *</label>
              <input style={INP} value={developerName} onChange={e => setDeveloperName(e.target.value)} placeholder="MANOP creates an unclaimed profile if new" />
            </div>
            <div>
              <label style={LBL}>Neighborhood *</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}>
                <option value="">Select neighborhood</option>
                {NEIGHBORHOODS.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>City</label>
              <input style={INP} value={city} onChange={e => setCity(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>State</label>
              <input style={INP} value={state} onChange={e => setState(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Construction stage</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={stage} onChange={e => setStage(e.target.value)}>
                {['Planning', 'Foundation', 'Structure', 'Finishing', 'Completed'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Total units (leave blank for land)</label>
              <input style={INP} type="number" value={totalUnits} onChange={e => setTotalUnits(e.target.value)} />
            </div>
            <div>
              <label style={LBL}>Expected handover</label>
              <input style={INP} type="date" value={handoverDate} onChange={e => setHandoverDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={LBL}>Description</label>
              <textarea style={{ ...INP, minHeight: 70 }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this development — units, amenities, what makes it worth reviewing" />
            </div>
          </div>

          {/* Unit types, documents, and mandate only apply to a brand
              new submission — editing an existing one is scoped to the
              fields above (status, units count, dates, description,
              gallery), not re-touching the original submission record. */}
          {!editingId && (
            <>
          {/* ── Unit types & pricing ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={LBL}>Unit types &amp; pricing</label>
              <button type="button" onClick={() => setUnitRows(r => [...r, emptyUnitRow()])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: 11, color: text2, cursor: 'pointer' }}>
                <Plus size={12} /> Add unit type
              </button>
            </div>
            {unitRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={SMALL_INP} placeholder="e.g. 3-bed apartment" value={row.unit_type} onChange={e => updateUnitRow(i, 'unit_type', e.target.value)} />
                <input style={SMALL_INP} type="number" placeholder="Price (₦)" value={row.price_ngn} onChange={e => updateUnitRow(i, 'price_ngn', e.target.value)} />
                <input style={SMALL_INP} type="number" placeholder="Size (sqm)" value={row.size_sqm} onChange={e => updateUnitRow(i, 'size_sqm', e.target.value)} />
                <input style={SMALL_INP} type="number" placeholder="Available" value={row.available_count} onChange={e => updateUnitRow(i, 'available_count', e.target.value)} />
                <input style={SMALL_INP} type="number" placeholder="Deposit %" value={row.deposit_pct} onChange={e => updateUnitRow(i, 'deposit_pct', e.target.value)} />
                <input style={SMALL_INP} type="number" placeholder="Installments (mo)" value={row.installment_months} onChange={e => updateUnitRow(i, 'installment_months', e.target.value)} />
                {unitRows.length > 1 && (
                  <button type="button" onClick={() => setUnitRows(r => r.filter((_, idx) => idx !== i))}
                    style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
            </>
          )}

          {/* ── Media — editable in both create and edit modes ── */}
          <div style={{ marginBottom: 14 }}>
            <label style={LBL}>Development &amp; site images</label>
            <ImageUploader
              onImagesChange={setImages}
              maxImages={15}
              dark={dark}
              initialUrls={images}
              label="Gallery"
              hint="First image becomes the cover — include site photos, not just renders"
            />
          </div>

          {!editingId && (
            <>
          {/* ── Documents ── */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={LBL}>Supporting documents</label>
              <button type="button" onClick={() => setDocRows(r => [...r, emptyDocRow()])}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: 11, color: text2, cursor: 'pointer' }}>
                <Plus size={12} /> Add document
              </button>
            </div>
            {docRows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.8fr auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select style={SMALL_INP} value={row.document_type} onChange={e => updateDocRow(i, 'document_type', e.target.value)}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <input style={SMALL_INP} placeholder="Document name" value={row.document_name} onChange={e => updateDocRow(i, 'document_name', e.target.value)} />
                <input style={SMALL_INP} placeholder="Document URL" value={row.document_url} onChange={e => updateDocRow(i, 'document_url', e.target.value)} />
                {docRows.length > 1 && (
                  <button type="button" onClick={() => setDocRows(r => r.filter((_, idx) => idx !== i))}
                    style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* ── Mandate — the one thing every submission requires ── */}
          <div style={{ background: bg2, borderRadius: 10, padding: '0.875rem', marginBottom: 12 }}>
            <label style={LBL}>Your mandate *</label>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              {([
                ['direct_authority', 'I have direct authority to market this'],
                ['developer_mandate', 'I hold a documented mandate from the developer/owner'],
              ] as const).map(([val, label]) => (
                <label key={val} style={{ fontSize: 12, color: text2, display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1 }}>
                  <input type="radio" checked={mandateType === val} onChange={() => setMandateType(val)} style={{ marginTop: 2 }} />
                  {label}
                </label>
              ))}
            </div>
            <input style={INP} value={mandateDocUrl} onChange={e => setMandateDocUrl(e.target.value)} placeholder="Mandate document URL * — required, MANOP does not accept submissions without one" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <div>
                <label style={LBL}>Fee model</label>
                <select style={{ ...INP, cursor: 'pointer' }} value={feeModel} onChange={e => setFeeModel(e.target.value as any)}>
                  <option value="developer_success_fee">Standard developer success fee</option>
                  <option value="agency_commission_share">MANOP takes a share of my commission</option>
                </select>
              </div>
              {feeModel === 'agency_commission_share' && (
                <div>
                  <label style={LBL}>MANOP's share (%)</label>
                  <input style={INP} type="number" value={feeSharePct} onChange={e => setFeeSharePct(e.target.value)} />
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {error   && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}
          {success && <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#22C55E', marginBottom: 10 }}>{success}</div>}

          <button onClick={editingId ? updateDevelopment : handleSubmit} disabled={submitting}
            style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 9, padding: '0.75rem 1.5rem', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}>
            {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Submit for MANOP review →'}
          </button>
        </div>
      )}

      {developments.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center' as const, padding: '2rem', color: text3, fontSize: 13 }}>
          <Building2 size={22} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>Nothing submitted yet.</div>
        </div>
      ) : (
        developments.map(d => (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{d.name}</div>
              <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>{d.neighborhood}, {d.city} · {d.stage || '—'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {d.reviewed_at && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', borderRadius: 20, padding: '3px 8px' }}>MANOP Review</span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, color: text3, background: bg2, borderRadius: 20, padding: '3px 8px', textTransform: 'capitalize' as const }}>{d.publish_status.replace(/_/g, ' ')}</span>
              <button onClick={() => startEdit(d)} style={{ fontSize: 11, color: '#5B2EFF', background: 'transparent', border: '1px solid rgba(91,46,255,0.3)', padding: '3px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
              <Link href={`/development/${d.id}`} target="_blank" style={{ fontSize: 11, color: '#14B8A6', border: '1px solid rgba(20,184,166,0.3)', padding: '3px 8px', borderRadius: 6, textDecoration: 'none' }}>View ↗</Link>
            </div>
          </div>
        ))
      )}
    </>
  )
}