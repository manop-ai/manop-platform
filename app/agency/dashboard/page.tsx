'use client'
// app/agency/dashboard/page.tsx — WITH SESSION TOKEN AUTH
// Key change: checks localStorage for manop_agency_token first
// If valid token exists → auto-login, skip email prompt
// Agencies who came via onboard never see the login screen again

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import ImageUploader from '@/components/ImageUploader'
import TransactionSubmission from '@/components/TransactionSubmission'
 import { getUpgradePath, computeAgentLevel, mapPartnerTrustLevel, TRUST_LEVELS } from '../../../lib/agent-trust'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface Partner {
  id: string; name: string; partner_type: string
  trust_level: string | null; cities: string[]; contact_email: string | null;created_at?: string | null
}
interface Listing {
  id: string; neighborhood: string | null; city: string | null
  property_type: string | null; listing_type: string | null
  bedrooms: number | null; bathrooms: number | null
  price_local: number | null; price_usd: number | null
  confidence: number | null; created_at: string | null
  raw_data: Record<string, unknown> | null
}
type Tab = 'overview' | 'listings' | 'add' | 'leads' | 'transactions' | 'settings'

function fmtNGN(n: number | null) {
  if (!n) return 'POA'
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}
function parseMillion(v: string): number | null {
  const n = parseFloat(v)
  if (isNaN(n) || n <= 0) return null
  return Math.round(n * 1_000_000)
}

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Lekki','Ikoyi','Victoria Island',
  'Eko Atlantic','Banana Island','Ajah','Chevron','Ikota','Sangotedo',
  'Osapa London','Gbagada','Yaba','Ikeja GRA','Surulere','Magodo',
  'Maitama, Abuja','Asokoro, Abuja','Wuse 2, Abuja',
  'East Legon, Accra','Westlands, Nairobi','Karen, Nairobi',
]
const PROP_TYPES = ['Apartment','Duplex','Detached Duplex','Semi-Detached Duplex','Terraced Duplex','Detached Bungalow','Penthouse','Maisonette','Land','Commercial']
const TITLE_DOCS = ["C of O","Governor's Consent","Deed of Assignment","Gazette","Right of Occupancy","Leasehold","Survey Plan"]

function AddListingForm({ partnerId, agencyName, dark, onSaved }: {
  partnerId: string; agencyName: string; dark: boolean; onSaved: () => void
}) {
  const [neighborhood, setNeighborhood] = useState('')
  const [propType,     setPropType]     = useState('Duplex')
  const [listingType,  setListingType]  = useState('for-sale')
  const [priceM,       setPriceM]       = useState('')
  const [bedrooms,     setBedrooms]     = useState('3')
  const [bathrooms,    setBathrooms]    = useState('3')
  const [titleDoc,     setTitleDoc]     = useState('')
  const [agentPhone,   setAgentPhone]   = useState('')
  const [description,  setDescription]  = useState('')
  const [imageUrls,    setImageUrls]    = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.875rem', padding: '0.6rem 0.875rem', outline: 'none', fontFamily: 'inherit',
  }
  const LBL: React.CSSProperties = {
    fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500,
  }

  async function handleSave() {
    if (!neighborhood) { setError('Select a neighborhood'); return }
    const price = parseMillion(priceM)
    if (!price) { setError('Enter a valid price in millions — e.g. 285 for ₦285M'); return }
    setSaving(true); setError('')
    try {
      let ngnRate = 1570
      try {
        const controller = new AbortController()
        const timeoutId  = setTimeout(() => controller.abort(), 5000)
        const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal })
        clearTimeout(timeoutId)
        const d = await r.json()
        if (d?.rates?.NGN) ngnRate = d.rates.NGN
      } catch {}

      const { error: dbErr } = await sb.from('properties').insert({
        data_partner_id:     partnerId,
        source_type:         'agent-direct',
        country_code:        neighborhood.includes('Accra') ? 'GH' : neighborhood.includes('Nairobi') ? 'KE' : 'NG',
        city:                neighborhood.includes('Abuja') ? 'Abuja' : neighborhood.includes('Accra') ? 'Accra' : neighborhood.includes('Nairobi') ? 'Nairobi' : 'Lagos',
        neighborhood,
        property_type:       propType.toLowerCase().replace(/ /g, '-'),
        listing_type:        listingType,
        bedrooms:            parseInt(bedrooms) || null,
        bathrooms:           parseFloat(bathrooms) || null,
        price_local:         price,
        currency_code:       'NGN',
        price_usd:           Math.round(price / ngnRate),
        title_document_type: titleDoc || null,
        agent_phone:         agentPhone || null,
        confidence:          0.9,
        raw_data: {
          source_agency: agencyName,
          description:   description || null,
          images:        imageUrls,
          intel: { price_usd: Math.round(price / ngnRate), fx_rate: ngnRate, computed_at: new Date().toISOString() },
        },
      })
      if (dbErr) throw new Error(dbErr.message)
      setSuccess('Listing saved! It is now live on Manop.')
      setTimeout(() => { setSuccess(''); onSaved() }, 1800)
      setNeighborhood(''); setPriceM(''); setTitleDoc(''); setAgentPhone(''); setDescription(''); setImageUrls([])
    } catch (e: any) {
      setError(e.message || 'Failed to save listing')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={LBL}>Neighborhood *</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}>
            <option value="">Select neighborhood</option>
            {NEIGHBORHOODS.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
        <div><label style={LBL}>Property type *</label><select style={{ ...INP, cursor: 'pointer' }} value={propType} onChange={e => setPropType(e.target.value)}>{PROP_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label style={LBL}>Listing type *</label><select style={{ ...INP, cursor: 'pointer' }} value={listingType} onChange={e => setListingType(e.target.value)}><option value="for-sale">For Sale</option><option value="for-rent">For Rent</option><option value="short-let">Short Let</option><option value="off-plan">Off Plan</option></select></div>
        <div>
          <label style={LBL}>Price (₦M) *</label>
          <input style={INP} type="number" value={priceM} min="0.1" step="0.5" onChange={e => setPriceM(e.target.value)} placeholder="e.g. 285" />
          {priceM && parseMillion(priceM) && <div style={{ fontSize: '0.62rem', color: text3, marginTop: 3 }}>= {fmtNGN(parseMillion(priceM))}</div>}
        </div>
        <div><label style={LBL}>Bedrooms</label><select style={{ ...INP, cursor: 'pointer' }} value={bedrooms} onChange={e => setBedrooms(e.target.value)}>{['1','2','3','4','5','6'].map(n => <option key={n}>{n}</option>)}</select></div>
        <div><label style={LBL}>Bathrooms</label><select style={{ ...INP, cursor: 'pointer' }} value={bathrooms} onChange={e => setBathrooms(e.target.value)}>{['1','1.5','2','2.5','3','3.5','4'].map(n => <option key={n}>{n}</option>)}</select></div>
        <div><label style={LBL}>Title document</label><select style={{ ...INP, cursor: 'pointer' }} value={titleDoc} onChange={e => setTitleDoc(e.target.value)}><option value="">Not specified</option>{TITLE_DOCS.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label style={LBL}>Agent WhatsApp</label><input style={INP} type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="+234 800 000 0000" /></div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={LBL}>Description (optional)</label>
          <textarea style={{ ...INP, minHeight: 80, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Key features, amenities, nearby landmarks…" />
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <ImageUploader onImagesChange={setImageUrls} maxImages={8} dark={dark} label="Property photos" hint="JPG, PNG, WebP — Auto-optimized via Cloudinary CDN · First photo is cover" />
        {imageUrls.length > 0 && <div style={{ fontSize: 11, color: '#22C55E', marginTop: 6 }}>✓ {imageUrls.length} photo{imageUrls.length > 1 ? 's' : ''} ready</div>}
      </div>
      {error   && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}
      {success && <div style={{ background: 'rgba(34,197,94,0.1)',  border: '1px solid rgba(34,197,94,0.3)',  borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#22C55E',  marginBottom: 10 }}>✓ {success}</div>}
      <button onClick={handleSave} disabled={saving} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving listing…' : 'Save listing →'}
      </button>
    </div>
  )
}

export default function AgencyDashboard() {
  const [dark,      setDark]      = useState(true)
  const [checking,  setChecking]  = useState(true)
  const [loginVal,  setLoginVal]  = useState('')
  const [loginErr,  setLoginErr]  = useState('')
  const [logging,   setLogging]   = useState(false)
  const [partner,   setPartner]   = useState<Partner | null>(null)
  const [listings,  setListings]  = useState<Listing[]>([])
  const [loading,   setLoading]   = useState(false)
  const [tab,       setTab]       = useState<Tab>('overview')
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [saveMsg,   setSaveMsg]   = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  // ── Auto-login from session token ──────────────────────────
  useEffect(() => {
    async function checkSession() {
      const token    = localStorage.getItem('manop_agency_token')
      const agencyId = localStorage.getItem('manop_agency_id')
      if (token && agencyId) {
        const { data: session } = await sb.from('partner_sessions')
          .select('partner_id, expires_at')
          .eq('token', token).eq('partner_type', 'agency').single()
        if (session && new Date(session.expires_at) > new Date()) {
          const { data: acc } = await sb.from('data_partners')
            .select('id,name,partner_type,trust_level,cities,contact_email')
            .eq('id', agencyId).single()
          if (acc) {
            setPartner(acc as Partner)
            loadListings(acc.id)
          }
        } else {
          localStorage.removeItem('manop_agency_token')
          localStorage.removeItem('manop_agency_id')
        }
      }
      setChecking(false)
    }
    checkSession()
  }, [])

  const bg     = dark ? '#0F172A' : '#F8FAFC'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const INP: React.CSSProperties = {
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.85rem', outline: 'none', padding: '0.65rem 0.875rem', fontFamily: 'inherit', width: '100%',
  }
  const STAG: React.CSSProperties = {
    fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6',
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
  }
  const CARD: React.CSSProperties = {
    background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem',
  }

  async function handleLogin() {
    if (!loginVal.trim()) { setLoginErr('Enter your email or agency name'); return }
    setLogging(true); setLoginErr('')
    try {
      let data: Partner | null = null
      const r1 = await sb.from('data_partners').select('id,name,partner_type,trust_level,cities,contact_email').eq('contact_email', loginVal.trim().toLowerCase()).eq('active', true).single()
      if (r1.data) data = r1.data as Partner
      if (!data) {
        const r2 = await sb.from('data_partners').select('id,name,partner_type,trust_level,cities,contact_email').ilike('name', `%${loginVal.trim()}%`).eq('active', true).limit(1).single()
        if (r2.data) data = r2.data as Partner
      }
      if (!data) { setLoginErr('No agency found. Check your email or register at /agency/onboard'); setLogging(false); return }

      // Create session token
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const token = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
      await sb.from('partner_sessions').insert({ partner_type: 'agency', partner_id: data.id, token, email: data.contact_email || '' })
      localStorage.setItem('manop_agency_token', token)
      localStorage.setItem('manop_agency_id',    data.id)
      if (data.contact_email) localStorage.setItem('manop_agency_email', data.contact_email)

      setPartner(data)
      loadListings(data.id)
    } catch { setLoginErr('Login failed. Try again or email partners@manopintel.com') }
    finally { setLogging(false) }
  }

  const loadListings = useCallback(async (id: string) => {
    setLoading(true)
    const { data } = await sb.from('properties')
      .select('id,neighborhood,city,property_type,listing_type,bedrooms,bathrooms,price_local,price_usd,confidence,created_at,raw_data')
      .eq('data_partner_id', id).order('created_at', { ascending: false })
    setListings((data as Listing[]) || [])
    setLoading(false)
  }, [])

  async function toggleStatus(id: string, currentStatus: string) {
    const listing = listings.find(l => l.id === id); if (!listing) return
    const raw = (listing.raw_data || {}) as Record<string, unknown>
    await sb.from('properties').update({ raw_data: { ...raw, status: currentStatus === 'active' ? 'paused' : 'active' } }).eq('id', id)
    if (partner) loadListings(partner.id)
  }

  async function deleteListing(id: string) {
    if (!confirm('Remove this listing from Manop?')) return
    await sb.from('properties').delete().eq('id', id)
    if (partner) loadListings(partner.id)
  }

  async function saveEdit(id: string) {
    const price = parseMillion(editPrice)
    if (!price) { setSaveMsg('Enter valid price'); return }
    let ngnRate = 1570
    try { const r = await fetch('https://open.er-api.com/v6/latest/USD'); const d = await r.json(); if (d?.rates?.NGN) ngnRate = d.rates.NGN } catch {}
    await sb.from('properties').update({ price_local: price, price_usd: Math.round(price / ngnRate) }).eq('id', id)
    setEditId(null); setSaveMsg('✓ Price updated')
    setTimeout(() => setSaveMsg(''), 2500)
    if (partner) loadListings(partner.id)
  }

  const totalValue = listings.reduce((s, l) => s + (l.price_local || 0), 0)
  const forSale    = listings.filter(l => l.listing_type === 'for-sale').length
  const forRent    = listings.filter(l => ['for-rent','short-let'].includes(l.listing_type || '')).length

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',      label: 'Overview' },
    { key: 'listings',      label: `Listings (${listings.length})` },
    { key: 'add',           label: '+ Add listing' },
    { key: 'leads',         label: 'Leads' },
    { key: 'transactions',  label: 'Sales history' },
    { key: 'settings',      label: 'Profile' },
  ]

  if (checking) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: text3 }}>Loading…</div>
    </div>
  )

  if (!partner) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text, padding: '1rem', transition: 'background 0.3s' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          <div style={{ fontWeight: 700, color: text }}>Manop · Agency</div>
        </Link>
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6, color: text }}>Agency dashboard</h1>
          <p style={{ fontSize: 13, color: text2, marginBottom: '1.5rem', lineHeight: 1.55 }}>Enter your registered email address.</p>
          <label style={{ fontSize: 12, color: text2, display: 'block', marginBottom: 5, fontWeight: 500 }}>Email address</label>
          <input style={{ ...INP, marginBottom: 10 }} type="email" placeholder="listings@youragency.com" value={loginVal} onChange={e => setLoginVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} autoFocus />
          {loginErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{loginErr}</div>}
          <button onClick={handleLogin} disabled={logging} style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.75rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: logging ? 0.7 : 1 }}>
            {logging ? 'Finding your account…' : 'Access dashboard →'}
          </button>
          <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: 13, color: text2 }}>
            Not registered? <Link href="/agency/onboard" style={{ color: '#14B8A6', fontWeight: 600, textDecoration: 'none' }}>Join as partner →</Link>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s' }}>
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{partner.name}</div>
            <div style={{ fontSize: 11, color: text3 }}>{partner.partner_type} · {(partner.cities || []).join(', ')}</div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 20, padding: '2px 8px' }}>● Active</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View site</Link>
          <button onClick={() => { localStorage.removeItem('manop_agency_token'); localStorage.removeItem('manop_agency_id'); setPartner(null) }}
            style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#5B2EFF' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      {saveMsg && <div style={{ background: 'rgba(34,197,94,0.1)', padding: '0.5rem 1.5rem', fontSize: 13, color: '#22C55E', borderBottom: `1px solid ${border}` }}>{saveMsg}</div>}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {tab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: '1.5rem' }}>
              {[
                { label: 'Total listings',  value: listings.length,    color: '#7C5FFF' },
                { label: 'For sale',        value: forSale,            color: '#5B2EFF' },
                { label: 'For rent / STR',  value: forRent,            color: '#14B8A6' },
                { label: 'Portfolio value', value: fmtNGN(totalValue), color: '#22C55E' },
              ].map(s => (
                <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={STAG}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={STAG}>Recent listings</div>
            {loading ? <div style={{ color: text3, fontSize: 13 }}>Loading…</div>
              : listings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏘</div>
                  <div style={{ marginBottom: 10 }}>No listings yet</div>
                  <button onClick={() => setTab('add')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add your first listing →</button>
                </div>
              ) : listings.slice(0, 5).map(l => {
                const raw    = (l.raw_data || {}) as Record<string, unknown>
                const images = Array.isArray(raw.images) ? raw.images as string[] : []
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6 }}>
                    <div style={{ width: 52, height: 42, borderRadius: 7, overflow: 'hidden', background: bg2, flexShrink: 0 }}>
                      {images[0] ? <img src={images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as HTMLImageElement).style.display='none'} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏠</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.bedrooms ? `${l.bedrooms}-Bed ` : ''}{l.property_type} — {l.neighborhood}</div>
                      <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>{new Date(l.created_at || '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {images.length} photo{images.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#7C5FFF', flexShrink: 0 }}>{fmtNGN(l.price_local)}</div>
                    <Link href={`/property/${l.id}`} style={{ fontSize: 11, color: '#14B8A6', textDecoration: 'none', border: '1px solid rgba(20,184,166,0.3)', padding: '3px 8px', borderRadius: 6 }}>View ↗</Link>
                  </div>
                )
              })}
            {listings.length > 5 && <button onClick={() => setTab('listings')} style={{ fontSize: 13, color: '#7C5FFF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem 0' }}>View all {listings.length} listings →</button>}
          </>
        )}

        {tab === 'listings' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={STAG}>All listings ({listings.length})</div>
              <button onClick={() => setTab('add')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add listing</button>
            </div>
            {loading ? <div style={{ color: text3, fontSize: 13 }}>Loading…</div> : listings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏘</div>
                <button onClick={() => setTab('add')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add your first listing →</button>
              </div>
            ) : listings.map(l => {
              const raw    = (l.raw_data || {}) as Record<string, unknown>
              const images = Array.isArray(raw.images) ? raw.images as string[] : []
              const status = (raw.status as string) || 'active'
              const isEdit = editId === l.id
              return (
                <div key={l.id} style={{ background: bg3, border: `1px solid ${isEdit ? 'rgba(91,46,255,0.4)' : border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.875rem 1rem', flexWrap: 'wrap' as const }}>
                    <div style={{ width: 60, height: 48, borderRadius: 7, overflow: 'hidden', background: bg2, flexShrink: 0 }}>
                      {images[0] ? <img src={images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as HTMLImageElement).style.display='none'} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.4 }}>🏠</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.bedrooms ? `${l.bedrooms}-Bed ` : ''}{l.property_type} — {l.neighborhood}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#7C5FFF' }}>{fmtNGN(l.price_local)}</span>
                        <span style={{ fontSize: 10, color: status === 'active' ? '#22C55E' : text3, fontWeight: 600 }}>{status === 'active' ? '● Active' : '○ Paused'}</span>
                        <span style={{ fontSize: 10, color: text3 }}>{images.length} photo{images.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' as const }}>
                      <Link href={`/property/${l.id}`} target="_blank" style={{ fontSize: 11, color: '#14B8A6', border: '1px solid rgba(20,184,166,0.3)', padding: '3px 8px', borderRadius: 6, textDecoration: 'none' }}>View ↗</Link>
                      <button onClick={() => { setEditId(isEdit ? null : l.id); setEditPrice('') }} style={{ fontSize: 11, color: isEdit ? '#F59E0B' : text3, border: `1px solid ${isEdit ? 'rgba(245,158,11,0.4)' : border}`, padding: '3px 8px', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>{isEdit ? 'Cancel' : 'Edit price'}</button>
                      <button onClick={() => toggleStatus(l.id, status)} style={{ fontSize: 11, color: text3, border: `1px solid ${border}`, padding: '3px 8px', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>{status === 'active' ? 'Pause' : 'Activate'}</button>
                      <button onClick={() => deleteListing(l.id)} style={{ fontSize: 11, color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', padding: '3px 8px', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                  {isEdit && (
                    <div style={{ borderTop: `1px solid ${border}`, padding: '0.875rem 1rem', background: dark ? 'rgba(91,46,255,0.04)' : 'rgba(91,46,255,0.02)', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>
                      <div>
                        <div style={{ fontSize: 11, color: text3, marginBottom: 4 }}>New price (₦M) — e.g. 285 for ₦285M</div>
                        <input style={{ ...INP, width: 180 }} type="number" min="0.1" step="0.5" placeholder="e.g. 285" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
                      </div>
                      <button onClick={() => saveEdit(l.id)} style={{ background: '#22C55E', color: '#fff', border: 'none', borderRadius: 7, padding: '0.6rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                      <div style={{ fontSize: 11, color: text3 }}>Current: {fmtNGN(l.price_local)}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === 'add' && (
          <>
            <div style={STAG}>Add new listing</div>
            <div style={CARD}>
              <AddListingForm partnerId={partner.id} agencyName={partner.name} dark={dark} onSaved={() => { loadListings(partner.id); setTab('listings') }} />
            </div>
          </>
        )}

        {tab === 'leads' && (
          <div style={{ ...CARD, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.4 }}>📬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>Enquiry tracking coming soon</div>
            <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
              When buyers enquire on your listings their details will appear here. For now buyers who click WhatsApp go directly to your agent number.
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <>
            <div style={STAG}>Sales history — contribute transaction data</div>
            <div style={CARD}>
              <TransactionSubmission partnerId={partner.id} agencyName={partner.name} dark={dark} />
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <div style={STAG}>Agency profile</div>

  {/* Trust ladder card */}
  <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 12 }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
      Trust level
    </div>

    {(() => {
      // Map DB value to valid level — handles "agency", null, undefined etc.
      const rawLevel = partner.trust_level
      const level = mapPartnerTrustLevel(rawLevel)
      const def   = TRUST_LEVELS[level]

      // Compute upgrade path with real data
      const monthsActive = Math.floor(
        (Date.now() - new Date(partner.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24 * 30)
      )
      const upgrade = getUpgradePath(level, {
        listingCount:     listings.length,
        monthsActive,
        hasCAC:           false,
        responseRate:     85,
        disputedCount:    0,
        transactionCount: 0,
      })

      return (
        <div>
          {/* Current badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem', padding: '1rem', background: def.bg, border: `1px solid ${def.border}`, borderRadius: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: def.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16, flexShrink: 0 }}>
              {def.icon}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: def.color, fontSize: 15 }}>{def.label}</div>
              <div style={{ fontSize: 12, color: text2, marginTop: 2, lineHeight: 1.5 }}>{def.description}</div>
            </div>
          </div>

          {/* Upgrade path */}
          {upgrade.nextLevel ? (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                To reach {TRUST_LEVELS[upgrade.nextLevel].label}
              </div>
              {upgrade.remaining.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: text2, marginBottom: 6, padding: '0.5rem 0.75rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 7, border: `1px solid ${border}` }}>
                  <span style={{ color: '#F59E0B', flexShrink: 0 }}>◦</span>
                  {r}
                </div>
              ))}
            </div>
          ) : (
            level === 'elite' ? (
              <div style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>✓ Elite level — highest trust on Manop</div>
            ) : null
          )}
        </div>
      )
    })()}
  </div>

  {/* Profile form */}
  <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 12 }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
      <div>
        <label style={{ fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }}>Agency name</label>
        <input style={INP} defaultValue={partner.name} />
      </div>
      <div>
        <label style={{ fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }}>Contact email</label>
        <input style={INP} defaultValue={partner.contact_email || ''} />
      </div>
    </div>
    <div style={{ background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.15)', borderRadius: 10, padding: '0.875rem 1rem', fontSize: 13, color: text2 }}>
      To upgrade your trust level, email <strong>partners@manopintel.com</strong> with your CAC certificate. Verification takes 24–48 hours.
    </div>
    <div style={{ marginTop: 12, fontSize: 12, color: text3, lineHeight: 1.7 }}>
      <strong>Partner ID:</strong> <span style={{ fontFamily: 'monospace' }}>{partner.id}</span><br />
      <strong>Cities:</strong> {(partner.cities || []).join(', ')}
    </div>

            </div>
          </>
        )}
      </div>
    </div>
  )
}