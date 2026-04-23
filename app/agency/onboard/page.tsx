'use client'
// app/agency/onboard/page.tsx
// Zahazi Agency Partner Onboarding
// Two paths: bulk CSV/Excel upload OR single listing form
// No email back-and-forth — agencies are live in under 5 minutes

import { useState, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Types ────────────────────────────────────────────────────
type Step = 'welcome' | 'register' | 'choose' | 'bulk' | 'single' | 'done'

interface AgencyProfile {
  name:         string
  contact_name: string
  email:        string
  phone:        string
  city:         string
  website:      string
}

interface SingleListing {
  neighborhood:   string
  city:           string
  property_type:  string
  bedrooms:       string
  bathrooms:      string
  price:          string
  listing_type:   string
  title_doc:      string
  size_sqm:       string
  description:    string
  agent_name:     string
  agent_phone:    string
}

const EMPTY_LISTING: SingleListing = {
  neighborhood: '', city: 'Lagos', property_type: '', bedrooms: '',
  bathrooms: '', price: '', listing_type: 'for-sale', title_doc: '',
  size_sqm: '', description: '', agent_name: '', agent_phone: '',
}

const NEIGHBORHOODS = [
  'Lekki Phase 1','Lekki Phase 2','Lekki','Ikoyi','Victoria Island',
  'Eko Atlantic','Banana Island','Ikota','Chevron','Ajah','Sangotedo',
  'Osapa London','Orchid Road','Badore','Thomas Estate','Gbagada',
  'Yaba','Ikeja','Ikeja GRA','Surulere','Magodo',
  'Maitama','Asokoro','Wuse 2','Gwarinpa',
  'East Legon','Cantonments','Airport Residential','Labone',
  'Westlands','Karen','Kilimani','Lavington',
]

const PROP_TYPES = [
  'Apartment','Duplex','Detached Duplex','Semi-Detached Duplex',
  'Terraced Duplex','Detached Bungalow','Penthouse','Maisonette',
  'Detached House','Terraced House','Land','Commercial',
]

const TITLE_TYPES = [
  'C of O','Governor\'s Consent','Deed of Assignment',
  'Gazette','Right of Occupancy','Leasehold','Freehold','Survey Plan',
]

// ─── Price parser ─────────────────────────────────────────────
function parsePrice(raw: string): number | null {
  const s = raw.toLowerCase().replace(/[,₦$\s]/g, '')
  const m = s.match(/([\d.]+)(b|m|k)?/)
  if (!m) return null
  let n = parseFloat(m[1])
  if (m[2] === 'b') n *= 1_000_000_000
  else if (m[2] === 'm') n *= 1_000_000
  else if (m[2] === 'k') n *= 1_000
  if (n < 10_000) n *= 1_000_000 // "120" → 120M
  return n > 0 ? Math.round(n) : null
}

// ─── Styles ───────────────────────────────────────────────────
const D = {
  bg: '#0F172A', bg2: '#1E293B', bg3: '#162032',
  text: '#F8FAFC', text2: 'rgba(248,250,252,0.65)', text3: 'rgba(248,250,252,0.35)',
  border: 'rgba(248,250,252,0.08)', purple: '#5B2EFF', teal: '#14B8A6',
  green: '#22C55E', amber: '#F59E0B', red: '#EF4444',
}

const inp = {
  width: '100%', padding: '0.65rem 0.875rem',
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${D.border}`,
  borderRadius: 8, color: D.text, fontSize: '0.875rem',
  outline: 'none', fontFamily: 'inherit',
}

const lbl = {
  fontSize: '0.65rem', fontWeight: 700 as const, color: D.teal,
  textTransform: 'uppercase' as const, letterSpacing: '0.1em',
  display: 'block' as const, marginBottom: '0.4rem',
}

const card = {
  background: D.bg3, border: `1px solid ${D.border}`,
  borderRadius: 14, padding: '1.5rem', marginBottom: '1rem',
}

const btn = (color = D.purple) => ({
  background: color, color: '#fff', border: 'none',
  borderRadius: 10, padding: '0.75rem 1.5rem',
  fontSize: '0.875rem', fontWeight: 600 as const, cursor: 'pointer',
})

// ─── Main component ───────────────────────────────────────────
export default function AgencyOnboard() {
  const [step, setStep]           = useState<Step>('welcome')
  const [agency, setAgency]       = useState<AgencyProfile>({
    name: '', contact_name: '', email: '', phone: '', city: 'Lagos', website: '',
  })
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [listing, setListing]     = useState<SingleListing>(EMPTY_LISTING)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [savedCount, setSavedCount] = useState(0)

  // Bulk upload state
  const [bulkFile, setBulkFile]   = useState<File | null>(null)
  const [bulkStatus, setBulkStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const wrap = { background: D.bg, minHeight: '100vh', color: D.text, padding: '3rem 2rem' }
  const inner = { maxWidth: 640, margin: '0 auto' }

  // ── Register agency ──────────────────────────────────────────
  async function handleRegister() {
    if (!agency.name || !agency.email || !agency.phone) {
      setError('Agency name, email, and phone are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data, error: err } = await supabase
        .from('data_partners')
        .insert({
          name:          agency.name,
          partner_type:  'agency',
          trust_level:   'agency',
          contact_email: agency.email,
          contact_phone: agency.phone,
          country_codes: ['NG'],
          cities:        [agency.city],
          active:        true,
          notes:         `Self-onboarded. Contact: ${agency.contact_name}. Website: ${agency.website}`,
        })
        .select('id')
        .single()

      if (err) throw new Error(err.message)
      setPartnerId(data.id)
      setStep('choose')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Save single listing ──────────────────────────────────────
  async function handleSingleSave() {
    const price = parsePrice(listing.price)
    if (!price) { setError('Enter a valid price e.g. 120M, 85000000'); return }
    if (!listing.neighborhood) { setError('Select a neighborhood'); return }
    if (!listing.property_type) { setError('Select a property type'); return }

    setSaving(true)
    setError('')
    try {
      // Live FX rate
      let ngnRate = 1570
      try {
        const fx = await fetch('https://open.er-api.com/v6/latest/USD')
        const d  = await fx.json()
        if (d?.rates?.NGN) ngnRate = d.rates.NGN
      } catch { /* use fallback */ }

      const priceUSD = Math.round(price / ngnRate)

      const { error: err } = await supabase.from('properties').insert({
        data_partner_id:     partnerId,
        source_type:         'agent-direct',
        country_code:        'NG',
        city:                listing.city || 'Lagos',
        neighborhood:        listing.neighborhood,
        property_type:       listing.property_type.toLowerCase().replace(/ /g, '-'),
        listing_type:        listing.listing_type,
        bedrooms:            listing.bedrooms ? parseInt(listing.bedrooms) : null,
        bathrooms:           listing.bathrooms ? parseFloat(listing.bathrooms) : null,
        size_sqm:            listing.size_sqm ? parseFloat(listing.size_sqm) : null,
        price_local:         price,
        currency_code:       'NGN',
        price_usd:           priceUSD,
        title_document_type: listing.title_doc || null,
        agent_phone:         listing.agent_phone || null,
        confidence:          0.85,
        raw_data: {
          source_agency:  agency.name,
          description:    listing.description || null,
          agent_name:     listing.agent_name || null,
          intel: {
            price_usd:   priceUSD,
            fx_rate:     ngnRate,
            fx_source:   'open.er-api.com',
            computed_at: new Date().toISOString(),
          },
        },
      })

      if (err) throw new Error(err.message)
      setSavedCount(c => c + 1)
      setListing(EMPTY_LISTING) // reset for next listing
      setStep('done')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Bulk upload ──────────────────────────────────────────────
  async function handleBulkUpload() {
    if (!bulkFile) return
    setBulkStatus('Uploading to Manop...')
    const form = new FormData()
    form.append('file', bulkFile)
    form.append('partner_id', partnerId || '')
    form.append('agency_name', agency.name)

    try {
      const res  = await fetch('/api/ingest/agency-bulk', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setSavedCount(data.inserted || 0)
      setBulkStatus(`✓ ${data.inserted} properties added to Zahazi`)
      setStep('done')
    } catch (e: any) {
      setBulkStatus('')
      setError(e.message)
    }
  }

  // ── WELCOME ──────────────────────────────────────────────────
  if (step === 'welcome') return (
    <div style={wrap}>
      <div style={inner}>
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.75rem' }}>Zahazi · Agency Partner</div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '1rem' }}>
            Your listings.<br />Our intelligence.
          </h1>
          <p style={{ color: D.text2, lineHeight: 1.7, maxWidth: 460, margin: '0 auto 2rem' }}>
            Join as a founding agency partner. Upload your properties — Zahazi adds real-time yield analysis, USD pricing, and market intelligence. Your buyers see smarter listings. You see who's interested.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '2rem', maxWidth: 480, margin: '0 auto 2rem' }}>
            {[
              ['Free to join', 'No subscription. No listing fees during pilot.'],
              ['Live in 5 min', 'Upload CSV or add listings one by one.'],
              ['Get leads', 'Buyer enquiries come directly to your agents.'],
            ].map(([t, s]) => (
              <div key={t} style={{ background: D.bg3, border: `1px solid ${D.border}`, borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem', color: D.text }}>{t}</div>
                <div style={{ fontSize: '0.72rem', color: D.text2, lineHeight: 1.5 }}>{s}</div>
              </div>
            ))}
          </div>

          <button onClick={() => setStep('register')} style={{ ...btn(), fontSize: '1rem', padding: '0.875rem 2.5rem' }}>
            Become a Partner →
          </button>
        </div>
      </div>
    </div>
  )

  // ── REGISTER ─────────────────────────────────────────────────
  if (step === 'register') return (
    <div style={wrap}>
      <div style={inner}>
        <button onClick={() => setStep('welcome')} style={{ background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: '0.8rem', marginBottom: '1.5rem' }}>← Back</button>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Register your agency</h2>
        <p style={{ color: D.text2, fontSize: '0.875rem', marginBottom: '1.5rem' }}>Takes 2 minutes. No payment needed.</p>

        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Agency name *</label>
              <input style={inp} placeholder="e.g. CW Real Estate" value={agency.name} onChange={e => setAgency(a => ({ ...a, name: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Contact person *</label>
              <input style={inp} placeholder="Your name" value={agency.contact_name} onChange={e => setAgency(a => ({ ...a, contact_name: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>City</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={agency.city} onChange={e => setAgency(a => ({ ...a, city: e.target.value }))}>
                {['Lagos','Abuja','Port Harcourt','Accra','Nairobi','Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Email *</label>
              <input style={inp} type="email" placeholder="agency@example.com" value={agency.email} onChange={e => setAgency(a => ({ ...a, email: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>WhatsApp / Phone *</label>
              <input style={inp} placeholder="+234 800 000 0000" value={agency.phone} onChange={e => setAgency(a => ({ ...a, phone: e.target.value }))} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Website (optional)</label>
              <input style={inp} placeholder="https://youragency.com" value={agency.website} onChange={e => setAgency(a => ({ ...a, website: e.target.value }))} />
            </div>
          </div>
        </div>

        {error && <div style={{ color: D.red, fontSize: '0.82rem', marginBottom: '1rem' }}>✗ {error}</div>}

        <button onClick={handleRegister} disabled={saving} style={{ ...btn(), width: '100%', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Registering...' : 'Register Agency →'}
        </button>
      </div>
    </div>
  )

  // ── CHOOSE PATH ───────────────────────────────────────────────
  if (step === 'choose') return (
    <div style={wrap}>
      <div style={inner}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: D.green, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>✓ {agency.name} registered</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em' }}>How would you like to add listings?</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div onClick={() => setStep('bulk')} style={{ ...card, cursor: 'pointer', border: `1px solid rgba(91,46,255,0.25)`, transition: 'border-color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(91,46,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(91,46,255,0.25)')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>📂</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>Bulk upload</div>
            <div style={{ fontSize: '0.78rem', color: D.text2, lineHeight: 1.55 }}>
              Upload your existing spreadsheet — CSV or Excel. Zahazi maps your columns automatically. Best for 5+ properties.
            </div>
            <div style={{ marginTop: '1rem', fontSize: '0.72rem', color: D.purple, fontWeight: 600 }}>Upload file →</div>
          </div>

          <div onClick={() => setStep('single')} style={{ ...card, cursor: 'pointer', border: `1px solid rgba(20,184,166,0.25)`, transition: 'border-color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(20,184,166,0.25)')}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>✏️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.4rem' }}>Single listing</div>
            <div style={{ fontSize: '0.78rem', color: D.text2, lineHeight: 1.55 }}>
              Add one property at a time. Fill in the details, see it live on Zahazi immediately. Add more from your dashboard.
            </div>
            <div style={{ marginTop: '1rem', fontSize: '0.72rem', color: D.teal, fontWeight: 600 }}>Add listing →</div>
          </div>
        </div>

        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: D.text3, textAlign: 'center' }}>
          You can do both — add listings one by one and upload a spreadsheet anytime from your dashboard.
        </div>
      </div>
    </div>
  )

  // ── BULK UPLOAD ───────────────────────────────────────────────
  if (step === 'bulk') return (
    <div style={wrap}>
      <div style={inner}>
        <button onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: '0.8rem', marginBottom: '1.5rem' }}>← Back</button>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.5rem' }}>Upload your properties</h2>
        <p style={{ color: D.text2, fontSize: '0.875rem', marginBottom: '1.5rem' }}>CSV or Excel. Any column names — Zahazi auto-detects your format.</p>

        <div style={card}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: D.teal, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            What Zahazi detects automatically
          </div>
          {[
            ['Price column', 'Supports ₦120M, 85000000, $180K formats'],
            ['Neighborhood', '"Lekki Ph 1", "LEKKI PHASE ONE" → normalized'],
            ['Property type', '"Semi detached duplex", "flat" → normalized'],
            ['Duplicates',    'Same property in multiple rows — flagged, not inserted twice'],
            ['Currency',      'NGN, USD, GHS auto-detected. USD prices stored separately.'],
          ].map(([t, d]) => (
            <div key={t} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: `1px solid ${D.border}`, fontSize: '0.8rem' }}>
              <span style={{ color: D.green, flexShrink: 0 }}>✓</span>
              <span><span style={{ color: D.text, fontWeight: 600 }}>{t}:</span>{' '}<span style={{ color: D.text2 }}>{d}</span></span>
            </div>
          ))}
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setBulkFile(f) }}
          onDragOver={e => e.preventDefault()}
          style={{ border: `2px dashed ${bulkFile ? D.green : D.border}`, borderRadius: 14, padding: '2.5rem', textAlign: 'center', cursor: 'pointer', marginBottom: '1rem', background: bulkFile ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{bulkFile ? '✓' : '📂'}</div>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: bulkFile ? D.green : D.text }}>
            {bulkFile ? bulkFile.name : 'Drop your spreadsheet here'}
          </div>
          <div style={{ fontSize: '0.75rem', color: D.text3 }}>CSV, Excel (.xlsx), or tab-separated</div>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.tsv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setBulkFile(f) }} />
        </div>

        {bulkStatus && <div style={{ color: D.green, fontSize: '0.82rem', marginBottom: '0.75rem' }}>{bulkStatus}</div>}
        {error && <div style={{ color: D.red, fontSize: '0.82rem', marginBottom: '0.75rem' }}>✗ {error}</div>}

        <button onClick={handleBulkUpload} disabled={!bulkFile || saving} style={{ ...btn(), width: '100%', opacity: !bulkFile || saving ? 0.5 : 1 }}>
          {saving ? 'Processing...' : 'Upload & Process →'}
        </button>
      </div>
    </div>
  )

  // ── SINGLE LISTING ────────────────────────────────────────────
  if (step === 'single') return (
    <div style={wrap}>
      <div style={inner}>
        <button onClick={() => setStep('choose')} style={{ background: 'none', border: 'none', color: D.text3, cursor: 'pointer', fontSize: '0.8rem', marginBottom: '1.5rem' }}>← Back</button>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '0.25rem' }}>Add a listing</h2>
        <p style={{ color: D.text2, fontSize: '0.875rem', marginBottom: '1.5rem' }}>It goes live on Zahazi immediately with intelligence applied.</p>

        <div style={card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Neighborhood *</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.neighborhood} onChange={e => setListing(l => ({ ...l, neighborhood: e.target.value }))}>
                <option value="">Select neighborhood</option>
                {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Property type *</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.property_type} onChange={e => setListing(l => ({ ...l, property_type: e.target.value }))}>
                <option value="">Select type</option>
                {PROP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Listing type</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.listing_type} onChange={e => setListing(l => ({ ...l, listing_type: e.target.value }))}>
                <option value="for-sale">For Sale</option>
                <option value="for-rent">For Rent</option>
                <option value="short-let">Short Let</option>
                <option value="off-plan">Off Plan</option>
              </select>
            </div>

            <div>
              <label style={lbl}>Price (₦) *</label>
              <input style={inp} placeholder="e.g. 120M, 85000000" value={listing.price} onChange={e => setListing(l => ({ ...l, price: e.target.value }))} />
              {listing.price && (() => { const p = parsePrice(listing.price); return p ? <div style={{ fontSize: '0.68rem', color: D.teal, marginTop: '0.3rem' }}>= ₦{(p/1_000_000).toFixed(0)}M</div> : null })()}
            </div>

            <div>
              <label style={lbl}>Bedrooms</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.bedrooms} onChange={e => setListing(l => ({ ...l, bedrooms: e.target.value }))}>
                <option value="">—</option>
                {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Bathrooms</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.bathrooms} onChange={e => setListing(l => ({ ...l, bathrooms: e.target.value }))}>
                <option value="">—</option>
                {[1,1.5,2,2.5,3,3.5,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Size (sqm)</label>
              <input style={inp} placeholder="e.g. 120" type="number" value={listing.size_sqm} onChange={e => setListing(l => ({ ...l, size_sqm: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Title document</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={listing.title_doc} onChange={e => setListing(l => ({ ...l, title_doc: e.target.value }))}>
                <option value="">Unknown / not specified</option>
                {TITLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>Description (optional)</label>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder="Key features, amenities, location details..." value={listing.description} onChange={e => setListing(l => ({ ...l, description: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Agent name</label>
              <input style={inp} placeholder="Agent full name" value={listing.agent_name} onChange={e => setListing(l => ({ ...l, agent_name: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Agent WhatsApp</label>
              <input style={inp} placeholder="+234 800 000 0000" value={listing.agent_phone} onChange={e => setListing(l => ({ ...l, agent_phone: e.target.value }))} />
            </div>
          </div>
        </div>

        {error && <div style={{ color: D.red, fontSize: '0.82rem', marginBottom: '0.75rem' }}>✗ {error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button onClick={handleSingleSave} disabled={saving} style={{ ...btn(), opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Add Listing →'}
          </button>
          <button onClick={() => setStep('choose')} style={{ ...btn('transparent'), border: `1px solid ${D.border}`, color: D.text2 }}>
            Upload CSV instead
          </button>
        </div>
      </div>
    </div>
  )

  // ── DONE ─────────────────────────────────────────────────────
  return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: D.green, letterSpacing: '-0.03em', marginBottom: '0.75rem' }}>
          {savedCount} {savedCount === 1 ? 'Listing' : 'Listings'} Live
        </h2>
        <p style={{ color: D.text2, lineHeight: 1.7, marginBottom: '2rem' }}>
          {agency.name}'s properties are now on Zahazi with real-time yield intelligence applied. Buyers can see and enquire immediately.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/neighborhood/lekki-phase-1" style={{ ...btn(), textDecoration: 'none' }}>View on Zahazi →</a>
          <button onClick={() => { setStep('single'); setListing(EMPTY_LISTING) }} style={{ ...btn(D.teal) }}>Add another listing</button>
          <a href="/agency/dashboard" style={{ ...btn('transparent'), border: `1px solid ${D.border}`, color: D.text2, textDecoration: 'none' }}>Go to Dashboard →</a>
        </div>
      </div>
    </div>
  )
}
