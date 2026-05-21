'use client'
// app/agency/dashboard/page.tsx — SPRINT COMPLETE
//
// Changes in this version:
// 1. AddListingForm — writes lat/lng from HOOD_COORDS on insert
//    so every listing immediately appears on the map
// 2. VerificationTab — professional body membership (NIESV, NIESV,
//    EANS, ISKAN, ESVARBON etc.) as primary verification path,
//    CAC as secondary. Multiple routes to trust, not just one doc.
// 3. TransactionSubmission — "verified by" field added:
//    lawyer name, surveyor name, payment method, witnesses
// 4. MAPEWidget — reads live scores, shows actionable next step
// 5. Auth via useAuth() — no localStorage tokens

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import { useAuth } from '../../../lib/useAuth'
import ImageUploader from '../../../components/ImageUploader'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Neighbourhood → [lng, lat] centre coords ─────────────────
const HOOD_COORDS: Record<string, [number, number]> = {
  // Lagos Island / Lekki
  'lekki phase 1':    [3.4783,  6.4387], 'lekki phase 2':   [3.5133,  6.4348],
  'lekki':            [3.4900,  6.4400], 'ikoyi':           [3.4253,  6.4474],
  'victoria island':  [3.4163,  6.4281], 'vi':              [3.4163,  6.4281],
  'eko atlantic':     [3.3900,  6.4150], 'banana island':   [3.4330,  6.4600],
  'ajah':             [3.5725,  6.4667], 'chevron':         [3.5300,  6.4350],
  'ikota':            [3.5500,  6.4400], 'sangotedo':       [3.6000,  6.4500],
  'osapa london':     [3.5200,  6.4250], 'badore':          [3.5600,  6.4667],
  'ogombo':           [3.5850,  6.4600], 'oniru':           [3.4600,  6.4400],
  // Lagos Mainland
  'gbagada':          [3.3917,  6.5500], 'yaba':            [3.3700,  6.5100],
  'ikeja':            [3.3400,  6.6000], 'ikeja gra':       [3.3500,  6.6100],
  'surulere':         [3.3600,  6.4900], 'magodo':          [3.3800,  6.6200],
  'maryland':         [3.3600,  6.5750], 'ogba':            [3.3400,  6.5900],
  'festac':           [3.3800,  6.4600], 'palmgrove':       [3.3550,  6.5600],
  // Abuja
  'maitama':          [7.5130,  9.0740], 'asokoro':         [7.5300,  9.0600],
  'wuse 2':           [7.4900,  9.0700], 'wuse':            [7.4800,  9.0650],
  'garki':            [7.4900,  9.0500], 'gwarinpa':        [7.4700,  9.0300],
  'life camp':        [7.5200,  9.0400], 'utako':           [7.5000,  9.0550],
  'jabi':             [7.5200,  9.0250], 'katampe':         [7.5450,  9.0350],
  'kado':             [7.5350,  9.0450], 'apo':             [7.5600,  9.0650],
  'kubwa':            [7.4600,  9.0200], 'wuye':            [7.4700,  9.0550],
  // Port Harcourt
  'gra':              [7.0336,  4.8242], 'old gra':         [7.0400,  4.8400],
  'rumuola':          [7.0500,  4.8500], 'trans-amadi':     [7.0200,  4.8100],
  'eliozu':           [7.0700,  4.8600],
  // Accra
  'east legon':       [-0.1551, 5.6408], 'cantonments':     [-0.1880, 5.5700],
  'labone':           [-0.2000, 5.5600], 'airport residential': [-0.2100, 5.5500],
  'north legon':      [-0.1800, 5.6100], 'roman ridge':     [-0.2200, 5.5900],
  'dzorwulu':         [-0.1700, 5.5750], 'osu':             [-0.2300, 5.5650],
  // Nairobi
  'westlands':        [36.8084, -1.2697], 'karen':          [36.7172, -1.3389],
  'kilimani':         [36.7900, -1.2900], 'parklands':      [36.8000, -1.2600],
  'muthaiga':         [36.7800, -1.2500], 'lavington':      [36.7500, -1.3000],
  'kileleshwa':       [36.7800, -1.3200], 'langata':        [36.7900, -1.3600],
}

// City fallbacks
const CITY_COORDS: Record<string, [number, number]> = {
  lagos: [3.3792, 6.5244], abuja: [7.3986, 9.0765],
  accra: [-0.1870, 5.6037], nairobi: [36.8219, -1.2921],
  'port harcourt': [7.0498, 4.8156],
}

function getCoords(neighborhood: string, city: string): { lat: number; lng: number } | null {
  const hood = neighborhood.toLowerCase().trim()
  if (HOOD_COORDS[hood]) {
    const [lng, lat] = HOOD_COORDS[hood]
    return { lat, lng }
  }
  const c = city.toLowerCase().trim()
  if (CITY_COORDS[c]) {
    const [lng, lat] = CITY_COORDS[c]
    return { lat, lng }
  }
  return null
}

function parseMillion(val: string): number | null {
  const n = parseFloat(val)
  return isNaN(n) || n <= 0 ? null : Math.round(n * 1_000_000)
}

function fmtNGN(n: number | null): string {
  if (!n) return '—'
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1000)}K`
}

// ─── Types ────────────────────────────────────────────────────
interface Partner {
  id: string; name: string; contact_email: string | null; cities: string[] | null
  mape_score: number | null; mape_m: number | null; mape_a: number | null
  mape_p: number | null; mape_e: number | null; mape_i: number | null
  badge_level: string | null; verification_status: string | null
  trust_level: string | null; partner_type: string | null
}

interface Listing {
  id: string; neighborhood: string | null; city: string | null
  property_type: string | null; listing_type: string | null
  bedrooms: number | null; bathrooms: number | null
  price_local: number | null; price_usd: number | null
  confidence: number | null; created_at: string | null; raw_data: unknown
}

type Tab = 'overview' | 'listings' | 'add' | 'leads' | 'transactions' | 'verify' | 'settings'

const BADGE_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
  listed:   { label: 'Listed',   icon: '◎', color: '#94A3B8', bg: 'rgba(148,163,184,0.1)',  border: 'rgba(148,163,184,0.25)' },
  verified: { label: 'Verified', icon: '◇', color: '#60A5FA', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.25)' },
  trust:    { label: 'Trust',    icon: '◈', color: '#14B8A6', bg: 'rgba(20,184,166,0.1)',   border: 'rgba(20,184,166,0.25)' },
  elite:    { label: 'Elite',    icon: '★', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.25)' },
}

const NEIGHBORHOODS = [
  // Lagos
  'Lekki Phase 1','Lekki Phase 2','Ikoyi','Victoria Island','Eko Atlantic','Banana Island',
  'Ajah','Chevron','Oniru','Osapa London','Ikota','Sangotedo','Badore',
  'Gbagada','Yaba','Ikeja','Ikeja GRA','Surulere','Magodo','Maryland','Ogba','Festac Town','Palmgrove',
  // Abuja
  'Maitama','Asokoro','Wuse 2','Wuse','Garki','Gwarinpa','Life Camp','Utako','Jabi','Katampe','Kado','Apo','Wuye',
  // Port Harcourt
  'GRA','Old GRA','Rumuola','Trans-Amadi','Eliozu',
  // Accra
  'East Legon','Cantonments','Labone','Airport Residential','North Legon','Roman Ridge','Dzorwulu','Osu',
  // Nairobi
  'Westlands','Karen','Kilimani','Parklands','Muthaiga','Lavington','Kileleshwa','Langata',
]

const PROP_TYPES  = ['Apartment','Duplex','Bungalow','Terraced House','Semi-Detached','Detached House','Land','Commercial','Penthouse','Studio']
const TITLE_DOCS  = ['C of O','Governor\'s Consent','Deed of Assignment','Excision','Freehold Title','Gazette','Right of Occupancy','Survey Plan']

// ─── Professional bodies (Nigeria, Ghana, Kenya) ──────────────
const PROFESSIONAL_BODIES = [
  { code: 'NIESV',   label: 'NIESV',   full: 'Nigerian Institution of Estate Surveyors and Valuers' },
  { code: 'ESVARBON',label: 'ESVARBON',full: 'Estate Surveyors and Valuers Registration Board of Nigeria' },
  { code: 'EANS',    label: 'EANS',    full: 'Estate Agents and Auctioneers Association of Nigeria' },
  { code: 'ISKAN',   label: 'ISKAN',   full: 'International Society of Kijani Appraisers (Nigeria)' },
  { code: 'LASREA',  label: 'LASREA',  full: 'Lagos State Real Estate Regulatory Authority' },
  { code: 'ABUSREA', label: 'ABUSREA', full: 'Abuja Real Estate Regulatory Authority' },
  { code: 'RECON',   label: 'RECON',   full: 'Real Estate Council of Nigeria' },
  { code: 'GHANA_GIS',label:'GIS Ghana',full:'Ghana Institution of Surveyors' },
  { code: 'GHANA_GREA',label:'GREA',   full:'Ghana Real Estate Association' },
  { code: 'ISK',     label: 'ISK Kenya',full:'Institution of Surveyors of Kenya' },
  { code: 'OTHER',   label: 'Other',   full: 'Other professional body' },
]

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

// ── AddListingForm — writes lat/lng ───────────────────────────
function AddListingForm({ partnerId, agencyName, dark, onSaved }: {
  partnerId: string; agencyName: string; dark: boolean; onSaved: () => void
}) {
  const [neighborhood, setNeighborhood] = useState('')
  const [propType,     setPropType]     = useState('Apartment')
  const [listingType,  setListingType]  = useState('for-sale')
  const [priceM,       setPriceM]       = useState('')
  const [bedrooms,     setBedrooms]     = useState('3')
  const [bathrooms,    setBathrooms]    = useState('2')
  const [titleDoc,     setTitleDoc]     = useState('')
  const [agentPhone,   setAgentPhone]   = useState('')
  const [description,  setDescription]  = useState('')
  const [imageUrls,    setImageUrls]    = useState<string[]>([])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState('')

  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC'                : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 8, color: text,
    fontSize: '0.875rem', padding: '0.6rem 0.875rem', outline: 'none', fontFamily: 'inherit',
  }
  const LBL: React.CSSProperties = { fontSize: '0.68rem', color: text2, marginBottom: '0.3rem', display: 'block', fontWeight: 500 }

  async function handleSave() {
    if (!neighborhood) { setError('Select a neighborhood'); return }
    const price = parseMillion(priceM)
    if (!price) { setError('Enter a valid price in millions e.g. 85 for ₦85M'); return }
    setSaving(true); setError('')

    try {
      // Live FX rate
      let ngnRate = 1570
      try {
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), 4000)
        const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal })
        const d = await r.json()
        if (d?.rates?.NGN) ngnRate = d.rates.NGN
      } catch { /* use fallback */ }

      // Resolve city from neighborhood selection
      const cityMap: Record<string, string> = {
        'Maitama': 'Abuja', 'Asokoro': 'Abuja', 'Wuse 2': 'Abuja', 'Wuse': 'Abuja',
        'Garki': 'Abuja', 'Gwarinpa': 'Abuja', 'Life Camp': 'Abuja', 'Utako': 'Abuja',
        'Jabi': 'Abuja', 'Katampe': 'Abuja', 'Kado': 'Abuja', 'Apo': 'Abuja', 'Wuye': 'Abuja',
        'GRA': 'Port Harcourt', 'Old GRA': 'Port Harcourt', 'Rumuola': 'Port Harcourt',
        'Trans-Amadi': 'Port Harcourt', 'Eliozu': 'Port Harcourt',
        'East Legon': 'Accra', 'Cantonments': 'Accra', 'Labone': 'Accra',
        'Airport Residential': 'Accra', 'North Legon': 'Accra', 'Roman Ridge': 'Accra',
        'Dzorwulu': 'Accra', 'Osu': 'Accra',
        'Westlands': 'Nairobi', 'Karen': 'Nairobi', 'Kilimani': 'Nairobi',
        'Parklands': 'Nairobi', 'Muthaiga': 'Nairobi', 'Lavington': 'Nairobi',
        'Kileleshwa': 'Nairobi', 'Langata': 'Nairobi',
      }
      const city = cityMap[neighborhood] || 'Lagos'
      const countryCode = city === 'Accra' ? 'GH' : city === 'Nairobi' ? 'KE' : 'NG'

      // ── KEY CHANGE: get coordinates so pin shows on map ──
      const coords = getCoords(neighborhood, city)

      const { error: dbErr } = await sb.from('properties').insert({
        data_partner_id:     partnerId,
        source_type:         'agency-direct',
        country_code:        countryCode,
        city,
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
        // ── Coordinates — makes the pin appear on the map ──
        lat:                 coords?.lat ?? null,
        lng:                 coords?.lng ?? null,
        raw_data: {
          source_agency: agencyName,
          description:   description || null,
          images:        imageUrls,
          intel: {
            price_usd:    Math.round(price / ngnRate),
            fx_rate:      ngnRate,
            computed_at:  new Date().toISOString(),
          },
        },
      })

      if (dbErr) throw new Error(dbErr.message)

      setSuccess('Listing saved and live on Manop.')
      setTimeout(() => { setSuccess(''); onSaved() }, 1800)
      setNeighborhood(''); setPriceM(''); setTitleDoc('')
      setAgentPhone(''); setDescription(''); setImageUrls([])

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save listing')
    } finally {
      setSaving(false)
    }
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
        <div>
          <label style={LBL}>Property type *</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={propType} onChange={e => setPropType(e.target.value)}>
            {PROP_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Listing type *</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={listingType} onChange={e => setListingType(e.target.value)}>
            <option value="for-sale">For Sale</option>
            <option value="for-rent">For Rent</option>
            <option value="short-let">Short Let</option>
            <option value="off-plan">Off Plan</option>
          </select>
        </div>
        <div>
          <label style={LBL}>Price (₦ millions) *</label>
          <input style={INP} type="number" value={priceM} min="0.1" step="0.5"
            onChange={e => setPriceM(e.target.value)} placeholder="e.g. 85" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={LBL}>Beds</label>
            <input style={INP} type="number" value={bedrooms} min="1" max="20" onChange={e => setBedrooms(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>Baths</label>
            <input style={INP} type="number" value={bathrooms} min="1" step="0.5" onChange={e => setBathrooms(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LBL}>Title document</label>
          <select style={{ ...INP, cursor: 'pointer' }} value={titleDoc} onChange={e => setTitleDoc(e.target.value)}>
            <option value="">None specified</option>
            {TITLE_DOCS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LBL}>Agent phone / WhatsApp</label>
          <input style={INP} type="tel" value={agentPhone} onChange={e => setAgentPhone(e.target.value)} placeholder="+234 800 000 0000" />
        </div>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={LBL}>Description (optional)</label>
          <textarea style={{ ...INP, minHeight: 72, resize: 'vertical' as const }} value={description}
            onChange={e => setDescription(e.target.value)} placeholder="Key features, access notes, what makes this listing stand out…" />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LBL}>Photos</label>
        <ImageUploader onImagesChange={setImageUrls} maxImages={8} dark={dark}
          label="Property photos" hint="JPG, PNG, WebP — First photo is cover image" />
      </div>

      {error   && <div style={{ background: 'rgba(239,68,68,0.1)',  border: '1px solid rgba(239,68,68,0.25)',  borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}
      {success && <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: 13, color: '#22C55E', marginBottom: 10 }}>{success}</div>}

      <button onClick={handleSave} disabled={saving}
        style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 9, padding: '0.75rem 1.5rem', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1, fontFamily: 'inherit' }}>
        {saving ? 'Saving…' : 'Save listing →'}
      </button>
    </div>
  )
}

// ── TransactionSubmission — with "verified by" field ──────────
function TransactionSubmission({ partnerId, agencyName, dark }: {
  partnerId: string; agencyName: string; dark: boolean
}) {
  const newRow = () => ({
    id: Math.random().toString(36).slice(2), neighborhood: '', bedrooms: '3',
    askingPriceM: '', soldPriceM: '', soldDate: '', daysOnMarket: '',
    annualRentM: '', evidenceType: 'agent_confirmed',
    verifiedByName: '', verifiedByRole: 'lawyer', paymentMethod: 'cash',
  })

  const [rows,    setRows]    = useState([newRow()])
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  const border = dark ? 'rgba(248,250,252,0.1)'  : 'rgba(15,23,42,0.1)'
  const text   = dark ? '#F8FAFC'                : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${border}`, borderRadius: 7, color: text,
    fontSize: '0.78rem', padding: '0.45rem 0.65rem', outline: 'none', fontFamily: 'inherit',
  }

  function upd(id: string, f: string, v: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [f]: v } : r))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.neighborhood && r.soldPriceM && r.soldDate && r.bedrooms)
    if (!valid.length) { setError('Fill in at least one complete row — neighborhood, sold price, date, and bedrooms are required'); return }
    setSaving(true); setError('')
    try {
      const inserts = valid.map(r => {
        const city = r.neighborhood.includes('Abuja') ? 'Abuja'
          : r.neighborhood.includes('Accra') ? 'Accra'
          : r.neighborhood.includes('Nairobi') ? 'Nairobi'
          : r.neighborhood.includes('Port Harcourt') || r.neighborhood === 'GRA' || r.neighborhood === 'Old GRA' ? 'Port Harcourt'
          : 'Lagos'
        return {
          neighborhood:        r.neighborhood,
          city,
          country_code:        city === 'Accra' ? 'GH' : city === 'Nairobi' ? 'KE' : 'NG',
          bedrooms:            parseInt(r.bedrooms) || null,
          asking_price:        r.askingPriceM ? Math.round(parseFloat(r.askingPriceM) * 1e6) : null,
          sold_price:          Math.round(parseFloat(r.soldPriceM) * 1e6),
          currency_code:       'NGN',
          sold_at:             r.soldDate,
          days_on_market:      r.daysOnMarket ? parseInt(r.daysOnMarket) : null,
          annual_rent:         r.annualRentM ? Math.round(parseFloat(r.annualRentM) * 1e6) : null,
          submitted_by:        partnerId,
          verification_status: 'pending',
          evidence_type:       r.evidenceType,
          raw_data: {
            submitted_by_agency: agencyName,
            submitted_at:        new Date().toISOString(),
            payment_method:      r.paymentMethod,
            // ── NEW: verified by ──
            verified_by: r.verifiedByName ? {
              name: r.verifiedByName.trim(),
              role: r.verifiedByRole,
            } : null,
          },
        }
      })

      const { error: dbErr } = await sb.from('market_transactions').insert(inserts)
      if (dbErr) throw new Error(dbErr.message)

      fetch('/api/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_type: 'transaction_submitted', metadata: { agency: agencyName, count: inserts.length } }),
      }).catch(() => {})

      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setSaving(false)
    }
  }

  if (success) return (
    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#22C55E' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Submitted — thank you</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, maxWidth: 400, margin: '0 auto' }}>
        Transactions under review. Verified within 24–48 hours. Verified data earns you permanent Intelligence (I) points — these never decay.
      </div>
      <button onClick={() => { setSuccess(false); setRows([newRow()]) }}
        style={{ marginTop: 16, background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        Submit more →
      </button>
    </div>
  )

  return (
    <div>
      <div style={{ background: dark ? 'rgba(91,46,255,0.07)' : 'rgba(91,46,255,0.04)', border: '1px solid rgba(91,46,255,0.18)', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#7C5FFF', marginBottom: 6 }}>Why submit closed sales?</div>
        <div style={{ fontSize: 12, color: text2, lineHeight: 1.65 }}>
          Each verified transaction earns <strong style={{ color: '#F59E0B' }}>+20 Intelligence (I) points</strong> — permanent, never decay.
          I points are the fastest path to Trust and Elite badges. Data is kept confidential — only neighbourhood-level aggregates are ever shown publicly.
          Adding a <strong>lawyer or surveyor witness</strong> doubles the confidence weight of your submission.
        </div>
      </div>

      {/* Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.4fr 0.7fr 0.7fr 0.7fr 0.9fr 1fr 1fr auto', gap: 5, marginBottom: 6 }}>
        {['Neighborhood','Beds','Asking ₦M','Sold ₦M *','Date sold *','Payment','Evidence','Verified by',''].map(h => (
          <div key={h} style={{ fontSize: '0.58rem', fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</div>
        ))}
      </div>

      {rows.map(row => (
        <div key={row.id}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.4fr 0.7fr 0.7fr 0.7fr 0.9fr 1fr 1fr auto', gap: 5, marginBottom: 4, alignItems: 'center' }}>
            <select style={{ ...INP, cursor: 'pointer' }} value={row.neighborhood} onChange={e => upd(row.id, 'neighborhood', e.target.value)}>
              <option value="">Select</option>
              {NEIGHBORHOODS.map(n => <option key={n}>{n}</option>)}
            </select>
            <select style={{ ...INP, cursor: 'pointer' }} value={row.bedrooms} onChange={e => upd(row.id, 'bedrooms', e.target.value)}>
              {['1','2','3','4','5','6','7'].map(n => <option key={n}>{n}</option>)}
            </select>
            <input style={INP} type="number" placeholder="e.g. 300" value={row.askingPriceM}
              onChange={e => upd(row.id, 'askingPriceM', e.target.value)} />
            <input style={{ ...INP, border: `1px solid ${row.soldPriceM ? border : 'rgba(239,68,68,0.4)'}` }}
              type="number" placeholder="e.g. 260 *" value={row.soldPriceM}
              onChange={e => upd(row.id, 'soldPriceM', e.target.value)} />
            <input style={{ ...INP, border: `1px solid ${row.soldDate ? border : 'rgba(239,68,68,0.4)'}` }}
              type="date" value={row.soldDate} onChange={e => upd(row.id, 'soldDate', e.target.value)} />
            <select style={{ ...INP, cursor: 'pointer' }} value={row.paymentMethod} onChange={e => upd(row.id, 'paymentMethod', e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mortgage">Mortgage</option>
              <option value="installment">Installment</option>
              <option value="mixed">Mixed</option>
            </select>
            <select style={{ ...INP, cursor: 'pointer' }} value={row.evidenceType} onChange={e => upd(row.id, 'evidenceType', e.target.value)}>
              <option value="agent_confirmed">Agent confirmed</option>
              <option value="deed_of_assignment">Deed of Assignment</option>
              <option value="bank_confirmation">Bank confirmation</option>
              <option value="client_testimony">Client testimony</option>
              <option value="survey_report">Survey report</option>
            </select>
            {/* ── Verified by — lawyer / surveyor name ── */}
            <div style={{ display: 'flex', gap: 3 }}>
              <input style={{ ...INP, flex: 1 }} placeholder="Name (optional)" value={row.verifiedByName}
                onChange={e => upd(row.id, 'verifiedByName', e.target.value)} />
              <select style={{ ...INP, width: 80, flexShrink: 0, cursor: 'pointer' }} value={row.verifiedByRole}
                onChange={e => upd(row.id, 'verifiedByRole', e.target.value)}>
                <option value="lawyer">Lawyer</option>
                <option value="surveyor">Surveyor</option>
                <option value="valuer">Valuer</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))} disabled={rows.length === 1}
              style={{ background: 'transparent', border: `1px solid ${border}`, borderRadius: 6, color: '#EF4444', cursor: 'pointer', padding: '0.4rem 0.55rem', fontSize: 13 }}>×</button>
          </div>
        </div>
      ))}

      <button onClick={() => setRows(prev => [...prev, newRow()])}
        style={{ fontSize: 12, color: '#14B8A6', background: 'transparent', border: '1px solid rgba(20,184,166,0.3)', borderRadius: 7, padding: '0.4rem 0.875rem', cursor: 'pointer', marginBottom: 16 }}>
        + Add another transaction
      </button>

      {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.65rem', fontSize: 13, color: '#EF4444', marginBottom: 10 }}>{error}</div>}

      <button onClick={handleSubmit} disabled={saving}
        style={{ width: '100%', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Submitting…' : `Submit ${rows.filter(r => r.neighborhood && r.soldPriceM).length} transaction${rows.filter(r => r.neighborhood && r.soldPriceM).length !== 1 ? 's' : ''} for review →`}
      </button>
      <p style={{ fontSize: 11, color: text3, marginTop: 10, lineHeight: 1.6, textAlign: 'center' as const }}>
        * Required. All data confidential. Only neighbourhood-level aggregates shown publicly. Every submission reviewed by Manop before it enters the intelligence layer.
      </p>
    </div>
  )
}

// ── VerificationTab — professional bodies + CAC ───────────────
function VerificationTab({ partner, dark, border, text, text2, text3, bg3, onStatusChange }: {
  partner: Partner; dark: boolean; border: string
  text: string; text2: string; text3: string; bg3: string
  onStatusChange: (status: string) => void
}) {
  const [method,      setMethod]      = useState<'body' | 'cac' | 'both'>('body')
  const [bodyCode,    setBodyCode]    = useState('')
  const [bodyNumber,  setBodyNumber]  = useState('')
  const [bodyYear,    setBodyYear]    = useState('')
  const [cacNumber,   setCacNumber]   = useState('')
  const [officeAddr,  setOfficeAddr]  = useState('')
  const [phone,       setPhone]       = useState('')
  const [docUrl,      setDocUrl]      = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [error,       setError]       = useState('')

  const vStatus = partner.verification_status || 'not_started'

  const INP: React.CSSProperties = {
    width: '100%', background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${border}`, borderRadius: 9, color: text,
    fontSize: '0.875rem', padding: '0.7rem 0.9rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
  }
  const LBL: React.CSSProperties = { fontSize: '0.7rem', color: text2, fontWeight: 500, display: 'block', marginBottom: '0.3rem' }

  async function handleSubmit() {
    const needsBody = method === 'body' || method === 'both'
    const needsCAC  = method === 'cac'  || method === 'both'

    if (needsBody && !bodyCode)   { setError('Select your professional body'); return }
    if (needsBody && !bodyNumber) { setError('Enter your membership number'); return }
    if (needsCAC  && !cacNumber)  { setError('Enter your CAC registration number'); return }
    if (!officeAddr.trim())       { setError('Office address is required'); return }

    setSubmitting(true); setError('')
    try {
      const verificationPayload = {
        method,
        professional_body:    needsBody ? { code: bodyCode, membership_number: bodyNumber, year_joined: bodyYear || null } : null,
        cac_number:           needsCAC ? cacNumber.trim() : null,
        office_address:       officeAddr.trim(),
        contact_phone:        phone.trim() || null,
        doc_url:              docUrl.trim() || null,
        submitted_at:         new Date().toISOString(),
      }

      const { error: dbErr } = await sb.from('data_partners').update({
        verification_status: 'pending',
        notes: JSON.stringify({ verification_request: verificationPayload }),
      }).eq('id', partner.id)

      if (dbErr) throw new Error(dbErr.message)

      fetch('/api/signals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal_type: 'verification_requested',
          metadata: { partner_id: partner.id, agency: partner.name, method, body_code: bodyCode || null },
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
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>◇</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#14B8A6', marginBottom: 8 }}>Verified</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
        Your agency is verified on Manop. The Verified badge is visible on all your listings. Keep building your MAPE score to reach Trust and Elite.
      </div>
    </div>
  )

  if (vStatus === 'pending' || submitted) return (
    <div style={{ background: bg3, border: '1px solid rgba(245,158,11,0.3)', borderRadius: 14, padding: '2rem', textAlign: 'center' as const }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⏱</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#F59E0B', marginBottom: 8 }}>Under review — 24–48 hours</div>
      <div style={{ fontSize: 13, color: text2, lineHeight: 1.6 }}>Questions? <span style={{ color: '#14B8A6' }}>partners@manopintel.com</span></div>
    </div>
  )

  return (
    <div>
      {/* What verification unlocks */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', marginBottom: 14 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.875rem' }}>
          What verification unlocks
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { icon: '◇', label: 'Verified badge on all listings', color: '#60A5FA' },
            { icon: '↑', label: '+40 MAPE Ethics points', color: '#22C55E' },
            { icon: '✓', label: 'Higher ranking in search results', color: '#5B2EFF' },
            { icon: '◈', label: 'Eligible for Trust and Elite badges', color: '#F59E0B' },
          ].map(w => (
            <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0.6rem 0.875rem', background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px solid ${border}`, borderRadius: 9 }}>
              <span style={{ color: w.color, fontSize: '0.85rem', flexShrink: 0, fontWeight: 700 }}>{w.icon}</span>
              <span style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.4 }}>{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.75rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1.25rem' }}>
          Verification method
        </div>

        {/* Method selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: '1.5rem' }}>
          {([
            { key: 'body', label: 'Professional body', desc: 'NIESV, EANS, GIS, ISK etc.' },
            { key: 'cac',  label: 'CAC registration', desc: 'Nigeria companies only' },
            { key: 'both', label: 'Both', desc: 'Strongest verification' },
          ] as const).map(m => (
            <div key={m.key} onClick={() => setMethod(m.key)}
              style={{ padding: '0.875rem', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${method === m.key ? '#5B2EFF' : border}`, background: method === m.key ? 'rgba(91,46,255,0.08)' : 'transparent', transition: 'all 0.12s' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: method === m.key ? '#7C5FFF' : text, marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: '0.68rem', color: text3, lineHeight: 1.4 }}>{m.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

          {/* Professional body fields */}
          {(method === 'body' || method === 'both') && (
            <div style={{ background: dark ? 'rgba(91,46,255,0.05)' : 'rgba(91,46,255,0.03)', border: '1px solid rgba(91,46,255,0.15)', borderRadius: 10, padding: '1rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#7C5FFF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Professional body membership
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <div>
                  <label style={LBL}>Professional body *</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={bodyCode} onChange={e => setBodyCode(e.target.value)}>
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
                    <input style={INP} placeholder="e.g. 2018" value={bodyYear}
                      onChange={e => setBodyYear(e.target.value)} />
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
            <input style={INP} type="tel" placeholder="+234 800 000 0000" value={phone}
              onChange={e => setPhone(e.target.value)} />
          </div>
          <div>
            <label style={LBL}>
              Document URL <span style={{ color: text3, fontWeight: 400 }}>(optional — membership certificate or CAC cert on Google Drive/Cloudinary)</span>
            </label>
            <input style={INP} placeholder="https://drive.google.com/..." value={docUrl}
              onChange={e => setDocUrl(e.target.value)} />
            <div style={{ fontSize: '0.68rem', color: text3, marginTop: 4, lineHeight: 1.55 }}>
              Or email docs to <span style={{ color: '#14B8A6' }}>partners@manopintel.com</span> — Subject: "Verify — {partner.name}"
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

// ── MAPE Widget ───────────────────────────────────────────────
function MAPEWidget({ partner, listings, dark, border, text, text2, text3, bg3, onGoVerify }: {
  partner: Partner; listings: Listing[]; dark: boolean
  border: string; text: string; text2: string; text3: string; bg3: string
  onGoVerify: () => void
}) {
  const badge      = partner.badge_level || 'listed'
  const badgeConf  = BADGE_CONFIG[badge] || BADGE_CONFIG.listed
  const total      = Math.round(partner.mape_score || 0)
  const scores     = {
    m: Math.round(partner.mape_m || 0),
    a: Math.round(partner.mape_a || 0),
    p: Math.round(partner.mape_p || 0),
    e: Math.round(partner.mape_e || 0),
    i: Math.round(partner.mape_i || 0),
  }
  const vStatus = partner.verification_status || 'not_started'

  function nextAction() {
    if (vStatus === 'not_started' || vStatus === 'unsubmitted')
      return { label: 'Submit your professional body membership or CAC docs. Unlocks +40 Ethics points and the Verified badge.', cta: 'Submit verification →', color: '#60A5FA', onClick: onGoVerify }
    if (listings.length === 0)
      return { label: 'Add your first listing. Each complete listing with photos earns up to 20 Market Quality points.', cta: 'Add a listing →', color: '#5B2EFF' }
    const withPhotos = listings.filter(l => {
      const imgs = Array.isArray((l.raw_data as any)?.images) ? (l.raw_data as any).images : []
      return imgs.length >= 3
    }).length
    if (withPhotos < listings.length * 0.5)
      return { label: `Only ${withPhotos} of ${listings.length} listings have 3+ photos. Photos are the biggest driver of Market Quality points.`, cta: 'Edit listings →', color: '#5B2EFF' }
    if (scores.i < 30)
      return { label: 'Submit your first closed sale. Each verified transaction earns +20 Intelligence points — permanent, never decay.', cta: 'Submit a sale →', color: '#F59E0B' }
    return { label: 'Reply to new inquiries within 4 hours. Response speed is the biggest Performance score driver.', cta: 'Check leads →', color: '#22C55E' }
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
        <div style={{ width: 48, height: 48, borderRadius: 12, background: badgeConf.bg, border: `1px solid ${badgeConf.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', color: badgeConf.color, flexShrink: 0 }}>
          {badgeConf.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: badgeConf.color }}>{badgeConf.label}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: text, letterSpacing: '-0.03em' }}>{total}</span>
            <span style={{ fontSize: 11, color: text3 }}>/1000 pts</span>
          </div>
          <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>MAPE score — updated nightly</div>
        </div>
        {/* Badge ladder */}
        <div style={{ display: 'flex', gap: 5 }}>
          {(['listed', 'verified', 'trust', 'elite'] as const).map(b => {
            const bc = BADGE_CONFIG[b]; const isA = b === badge
            return (
              <div key={b} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: isA ? bc.bg : 'transparent', border: `1px solid ${isA ? bc.border : border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: isA ? bc.color : text3 }}>{bc.icon}</div>
                <div style={{ fontSize: '0.45rem', color: isA ? bc.color : text3, fontWeight: isA ? 700 : 400 }}>{bc.label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dimension bars */}
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

      {/* Next action card */}
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
  const [dark, setDark] = useState(true)
  const [partner,  setPartner]  = useState<Partner | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [tab,      setTab]      = useState<Tab>('overview')
  const [loading,  setLoading]  = useState(false)
  const [editId,   setEditId]   = useState<string | null>(null)
  const [editPrice,setEditPrice] = useState('')
  const [saveMsg,  setSaveMsg]  = useState('')

  useEffect(() => { setDark(getInitialDark()); return listenTheme(d => setDark(d)) }, [])

  const loadListings = useCallback(async (id: string) => {
    setLoading(true)
    const { data } = await sb.from('properties')
      .select('id,neighborhood,city,property_type,listing_type,bedrooms,bathrooms,price_local,price_usd,confidence,created_at,raw_data')
      .eq('data_partner_id', id).order('created_at', { ascending: false })
    setListings((data as Listing[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!user) return
    sb.from('data_partners')
      .select('id,name,contact_email,cities,mape_score,mape_m,mape_a,mape_p,mape_e,mape_i,badge_level,verification_status,trust_level,partner_type')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) { setPartner(data as Partner); loadListings(data.id) }
      })
  }, [user, loadListings])

  async function signOut() { await sb.auth.signOut() }

  async function toggleStatus(id: string, currentStatus: string) {
    const l = listings.find(l => l.id === id); if (!l) return
    const raw = (l.raw_data || {}) as Record<string, unknown>
    await sb.from('properties').update({ raw_data: { ...raw, status: currentStatus === 'active' ? 'paused' : 'active' } }).eq('id', id)
    if (partner) loadListings(partner.id)
  }
  async function deleteListing(id: string) {
    if (!confirm('Remove this listing from Manop?')) return
    await sb.from('properties').delete().eq('id', id)
    if (partner) loadListings(partner.id)
  }
  async function saveEdit(id: string) {
    const price = parseMillion(editPrice); if (!price) { setSaveMsg('Enter valid price'); return }
    let ngnRate = 1570
    try { const r = await fetch('https://open.er-api.com/v6/latest/USD'); const d = await r.json(); if (d?.rates?.NGN) ngnRate = d.rates.NGN } catch { }
    await sb.from('properties').update({ price_local: price, price_usd: Math.round(price / ngnRate) }).eq('id', id)
    setEditId(null); setSaveMsg('✓ Price updated'); setTimeout(() => setSaveMsg(''), 2500)
    if (partner) loadListings(partner.id)
  }

  const bg     = dark ? '#0A0F1E' : '#F4F6FB'
  const bg2    = dark ? '#111827' : '#F1F5F9'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const INP: React.CSSProperties = { background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 8, color: text, fontSize: '0.85rem', outline: 'none', padding: '0.65rem 0.875rem', fontFamily: 'inherit', width: '100%' }

  const totalValue = listings.reduce((s, l) => s + (l.price_local || 0), 0)
  const forSale    = listings.filter(l => l.listing_type === 'for-sale').length
  const forRent    = listings.filter(l => ['for-rent', 'short-let'].includes(l.listing_type || '')).length
  const badge      = partner?.badge_level || 'listed'
  const badgeConf  = BADGE_CONFIG[badge] || BADGE_CONFIG.listed
  const vStatus    = partner?.verification_status || 'not_started'

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview',     label: 'Overview' },
    { key: 'listings',     label: `Listings (${listings.length})` },
    { key: 'add',          label: '+ Add listing' },
    { key: 'leads',        label: 'Leads' },
    { key: 'transactions', label: 'Sales history' },
    { key: 'verify',       label: vStatus === 'verified' ? '✓ Verified' : 'Get verified' },
    { key: 'settings',     label: 'Profile' },
  ]

  if (checking || (user && !partner && loading)) return (
    <div style={{ background: bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' as const }}>
        <div style={{ width: 24, height: 24, border: '3px solid rgba(91,46,255,0.2)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 13, color: text3 }}>Loading your dashboard…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

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

      {/* Top bar */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0.875rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14 }}>M</div>
          </Link>
          <div>
            <div style={{ fontWeight: 700, color: text, fontSize: 14 }}>{partner?.name}</div>
            <div style={{ fontSize: 11, color: text3 }}>{(partner?.cities || []).join(', ')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: badgeConf.bg, border: `1px solid ${badgeConf.border}`, borderRadius: 20, padding: '3px 10px' }}>
            <span style={{ fontSize: '0.75rem', color: badgeConf.color }}>{badgeConf.icon}</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: badgeConf.color }}>{badgeConf.label}</span>
          </div>
          <div style={{ fontSize: '0.65rem', color: text3, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 20, padding: '3px 10px', border: `1px solid ${border}` }}>
            {Math.round(partner?.mape_score || 0)}/1000 pts
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/search" style={{ fontSize: 12, color: text3, textDecoration: 'none', padding: '0.4rem 0.75rem', borderRadius: 7, border: `1px solid ${border}` }}>View site</Link>
          <button onClick={signOut} style={{ fontSize: 12, color: text3, background: 'transparent', border: `1px solid ${border}`, borderRadius: 7, padding: '0.4rem 0.75rem', cursor: 'pointer' }}>Log out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '0 1.5rem', display: 'flex', overflowX: 'auto' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '0.75rem 1rem', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === t.key ? '#5B2EFF' : 'transparent'}`, color: tab === t.key ? text : text3, fontSize: '0.8rem', fontWeight: tab === t.key ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>

      {saveMsg && (
        <div style={{ background: 'rgba(34,197,94,0.1)', padding: '0.5rem 1.5rem', fontSize: 13, color: '#22C55E', borderBottom: `1px solid ${border}` }}>
          {saveMsg}
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>

        {tab === 'overview' && partner && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: '1.25rem' }}>
              {[
                { label: 'Total listings',  value: listings.length,    color: '#7C5FFF' },
                { label: 'For sale',        value: forSale,            color: '#5B2EFF' },
                { label: 'For rent / STR',  value: forRent,            color: '#14B8A6' },
                { label: 'Portfolio value', value: fmtNGN(totalValue), color: '#22C55E' },
              ].map(s => (
                <div key={s.label} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 10, padding: '1rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
                </div>
              ))}
            </div>

            <MAPEWidget partner={partner} listings={listings} dark={dark} border={border} text={text} text2={text2} text3={text3} bg3={bg3} onGoVerify={() => setTab('verify')} />

            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>Recent listings</div>
            {listings.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '3rem', color: text3 }}>
                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏘</div>
                <button onClick={() => setTab('add')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.25rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Add your first listing →
                </button>
              </div>
            ) : listings.slice(0, 5).map(l => {
              const raw = (l.raw_data || {}) as Record<string, unknown>
              const images = Array.isArray(raw.images) ? raw.images as string[] : []
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem', background: bg3, border: `1px solid ${border}`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ width: 52, height: 42, borderRadius: 7, overflow: 'hidden', background: bg2, flexShrink: 0 }}>
                    {images[0] ? <img src={images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as HTMLImageElement).style.display = 'none'} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏠</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {l.bedrooms ? `${l.bedrooms}-Bed ` : ''}{l.property_type} — {l.neighborhood}
                    </div>
                    <div style={{ fontSize: 11, color: text3, marginTop: 2 }}>
                      {new Date(l.created_at || '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {images.length} photo{images.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#7C5FFF', flexShrink: 0 }}>{fmtNGN(l.price_local)}</div>
                  <Link href={`/property/${l.id}`} style={{ fontSize: 11, color: '#14B8A6', textDecoration: 'none', border: '1px solid rgba(20,184,166,0.3)', padding: '3px 8px', borderRadius: 6 }}>View ↗</Link>
                </div>
              )
            })}
          </>
        )}

        {tab === 'listings' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em' }}>All listings ({listings.length})</div>
              <button onClick={() => setTab('add')} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Add listing</button>
            </div>
            {listings.map(l => {
              const raw    = (l.raw_data || {}) as Record<string, unknown>
              const images = Array.isArray(raw.images) ? raw.images as string[] : []
              const status = (raw.status as string) || 'active'
              const isEdit = editId === l.id
              return (
                <div key={l.id} style={{ background: bg3, border: `1px solid ${isEdit ? 'rgba(91,46,255,0.4)' : border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.875rem 1rem', flexWrap: 'wrap' as const }}>
                    <div style={{ width: 60, height: 48, borderRadius: 7, overflow: 'hidden', background: bg2, flexShrink: 0 }}>
                      {images[0] ? <img src={images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as HTMLImageElement).style.display = 'none'} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, opacity: 0.4 }}>🏠</div>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{l.bedrooms ? `${l.bedrooms}-Bed ` : ''}{l.property_type} — {l.neighborhood}</div>
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
                      <button onClick={() => deleteListing(l.id)} style={{ fontSize: 11, color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)', padding: '3px 8px', borderRadius: 6, background: 'transparent', cursor: 'pointer' }}>Remove</button>
                    </div>
                  </div>
                  {isEdit && (
                    <div style={{ borderTop: `1px solid ${border}`, padding: '0.75rem 1rem', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' as const }}>
                      <label style={{ fontSize: 12, color: text2 }}>New price (₦M):</label>
                      <input style={{ ...INP, width: 120 }} type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="e.g. 310" />
                      <button onClick={() => saveEdit(l.id)} style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 7, padding: '0.4rem 0.875rem', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === 'add' && partner && (
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem' }}>
            <AddListingForm partnerId={partner.id} agencyName={partner.name} dark={dark} onSaved={() => { loadListings(partner.id); setTab('listings') }} />
          </div>
        )}

        {tab === 'leads' && partner && (
          <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem', color: text2, textAlign: 'center' as const }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>📬</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>Leads tab</div>
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>Buyer inquiries submitted via the Message agency button appear here. Check the inquiries table in your Supabase dashboard.</div>
          </div>
        )}

        {tab === 'transactions' && partner && (
          <>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: 10 }}>
              Sales history — contribute transaction data
            </div>
            <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.5rem' }}>
              <TransactionSubmission partnerId={partner.id} agencyName={partner.name} dark={dark} />
            </div>
          </>
        )}

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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}