'use client'
// components/ListingForm.tsx
// ─────────────────────────────────────────────────────────────────────────────
// MANOP Structured Listing Form — v2
//
// ARCHITECTURE CHANGE FROM v1:
//
// v1 used a static cascading taxonomy dropdown.
// Problem: You cannot predict every street, estate, road, or micro-location
// across Lagos, Abuja, Accra, and Nairobi. New estates are built constantly.
// A static list fails the moment an agent lists something not in the tree.
//
// v2 uses Mapbox Forward Geocoding as the location engine:
//
//   1. Agent types their location freely — estate name, street, landmark
//   2. Mapbox returns the best match with coordinates and a confidence score
//   3. If geocode confidence is high → coordinates saved, MAPE points awarded
//   4. If geocode confidence is low (unrecognized) → listing still saves,
//      but location MAPE points are withheld until verified
//   5. The neighborhood field is resolved from the geocode result context,
//      not from a hardcoded dropdown list
//
// WHY THIS IS CORRECT FOR AFRICAN REAL ESTATE:
//   - No standardized address system exists at scale
//   - Mapbox has strong coverage for Lagos, Abuja, Accra, Nairobi
//   - Agents think in estate names and landmarks, not formal addresses
//   - The taxonomy (country/city) still exists for filtering/benchmarks
//   - But the MICRO level (estate, street, landmark) is freeform + geocoded
//
// MAPE LOCATION SCORING:
//   - Geocode match found, high confidence (≥ 0.7) → +40 pts (M-dimension)
//   - Geocode match found, medium confidence (0.4–0.7) → +20 pts
//   - No geocode match → 0 pts, admin flag for manual review
//   - This is stored in raw_data.location_confidence for cron to read
//
// USAGE:
//   import ListingForm from '../../../components/ListingForm'
//   <ListingForm partnerId={partner.id} onSuccess={(id) => { ... }} />
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import ImageUploader from './ImageUploader'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// ─── Theme ───────────────────────────────────────────────────────────────────
const T = {
  bg:     '#0F172A',
  bg2:    '#1E293B',
  bg3:    '#162032',
  text:   '#F8FAFC',
  text2:  'rgba(248,250,252,0.65)',
  text3:  'rgba(248,250,252,0.35)',
  border: 'rgba(248,250,252,0.08)',
  purple: '#5B2EFF',
  teal:   '#14B8A6',
  green:  '#22C55E',
  amber:  '#F59E0B',
  red:    '#EF4444',
}

// ─── Supported markets — taxonomy anchor ─────────────────────────────────────
// The COUNTRY and CITY level stays structured (for benchmarks and filtering).
// Below city level everything is freeform + geocoded.
const COUNTRIES = [
  { id: 'NG', label: '🇳🇬 Nigeria',      currency: 'NGN', symbol: '₦',   bbox: [2.676932,4.240594,14.680073,13.885645] },
  { id: 'GH', label: '🇬🇭 Ghana',        currency: 'GHS', symbol: 'GH₵', bbox: [-3.260786,4.737842,1.060122,11.174847] },
  { id: 'KE', label: '🇰🇪 Kenya',        currency: 'KES', symbol: 'KSh', bbox: [33.908859,-4.720006,41.899578,4.623053] },
]

const CITIES: Record<string, Array<{ id: string; label: string; lat: number; lng: number }>> = {
  NG: [
    { id: 'lagos',         label: 'Lagos',         lat: 6.5244,  lng: 3.3792  },
    { id: 'abuja',         label: 'Abuja',         lat: 9.0765,  lng: 7.3986  },
    { id: 'port-harcourt', label: 'Port Harcourt', lat: 4.8156,  lng: 7.0498  },
    { id: 'kano',          label: 'Kano',          lat: 12.0022, lng: 8.5920  },
    { id: 'ibadan',        label: 'Ibadan',        lat: 7.3775,  lng: 3.9470  },
  ],
  GH: [
    { id: 'accra',  label: 'Accra',  lat: 5.6037, lng: -0.1870 },
    { id: 'kumasi', label: 'Kumasi', lat: 6.6885, lng: -1.6244 },
    { id: 'tema',   label: 'Tema',   lat: 5.6702, lng: -0.0138 },
  ],
  KE: [
    { id: 'nairobi', label: 'Nairobi', lat: -1.2921, lng: 36.8219 },
    { id: 'mombasa', label: 'Mombasa', lat: -4.0435, lng: 39.6682 },
    { id: 'kisumu',  label: 'Kisumu',  lat: -0.1022, lng: 34.7617 },
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface GeoResult {
  place_name:  string
  center:      [number, number]  // [lng, lat]
  relevance:   number            // 0-1 confidence
  context?:    Array<{ id: string; text: string }>
  place_type?: string[]
}

interface LocationState {
  raw_input:     string           // what the agent typed
  place_name:    string           // what Mapbox returned
  lat:           number | null
  lng:           number | null
  confidence:    number           // 0-1
  neighborhood:  string           // resolved from geocode context
  verified:      boolean          // true if confidence >= 0.7
  mape_pts:      number           // 0, 20, or 40
}

interface ListingDraft {
  country_id:          string
  city_id:             string
  location:            LocationState
  property_type:       string
  bedrooms:            string
  bathrooms:           string
  listing_type:        string
  price_local:         string
  currency_code:       string
  currency_symbol:     string
  agency_fee_pct:      string
  legal_fee_pct:       string
  service_charge:      string
  title_document_type: string
  size_sqm:            string
  description:         string
  furnishing:          string
}

const EMPTY_LOC: LocationState = {
  raw_input: '', place_name: '', lat: null, lng: null,
  confidence: 0, neighborhood: '', verified: false, mape_pts: 0,
}

const EMPTY: ListingDraft = {
  country_id: 'NG', city_id: '',
  location: EMPTY_LOC,
  property_type: '', bedrooms: '', bathrooms: '',
  listing_type: '', price_local: '', currency_code: 'NGN', currency_symbol: '₦',
  agency_fee_pct: '', legal_fee_pct: '', service_charge: '',
  title_document_type: '', size_sqm: '', description: '', furnishing: '',
}

const PROPERTY_TYPES = [
  'Apartment / Flat', 'Duplex', 'Terrace', 'Detached House',
  'Semi-Detached', 'Land', 'Commercial', 'Penthouse', 'Bungalow',
]

const LISTING_TYPES = [
  { id: 'for-sale',  label: 'For Sale'  },
  { id: 'for-rent',  label: 'For Rent'  },
  { id: 'short-let', label: 'Shortlet'  },
]

const TITLE_TYPES = [
  'C of O (Certificate of Occupancy)',
  'Deed of Assignment',
  'Governors Consent',
  'Registered Survey',
  'Building Approval',
  'Letter of Allocation',
  'Global C of O',
  'Leasehold',
  'Freehold',
  'Other',
  'Not Available',
]

const FURNISHING_TYPES = ['Fully Furnished', 'Semi-Furnished', 'Unfurnished']

// ─── MAPE point allocations ────────────────────────────────────────────────
// These are what the listing contributes to the agency's MAPE M-score (Market Quality)
// The cron reads raw_data.location_confidence and awards these when it runs
const MAPE = {
  location_high:   40,  // geocode confidence >= 0.7 → location is trustworthy
  location_medium: 20,  // geocode confidence 0.4-0.7 → probably right
  location_none:    0,  // no match → manual review needed
  title_doc:       20,  // title document type disclosed
  agency_fee:      15,  // agency fee disclosed
  legal_fee:       15,  // legal fee disclosed
  service_charge:  10,  // service charge disclosed
  size_sqm:        10,  // size provided
  description:      5,  // description written
  photos_5plus:    25,  // 5+ photos (tracked after save)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtPrice(val: string, symbol: string): string {
  const n = parseFloat(val.replace(/,/g, ''))
  if (isNaN(n)) return ''
  if (n >= 1_000_000_000) return `${symbol}${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000)     return `${symbol}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${symbol}${(n / 1_000).toFixed(0)}K`
  return `${symbol}${n}`
}

function extractNeighborhood(result: GeoResult): string {
  // Pull neighborhood/locality from geocode context chain
  if (!result.context) return ''
  const priority = ['neighborhood', 'locality', 'place', 'district']
  for (const p of priority) {
    const match = result.context.find(c => c.id.startsWith(p))
    if (match) return match.text
  }
  return ''
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHead({ label, required, theme = T }: { label: string; required?: boolean; theme?: { border: string; teal: string; text3: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1.5rem 0 0.875rem' }}>
      <div style={{ height: 1, flex: 1, background: theme.border }} />
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: required ? theme.teal : theme.text3, textTransform: 'uppercase' as const, letterSpacing: '0.14em', whiteSpace: 'nowrap' }}>
        {label}{required ? ' · required' : ' · optional (+MAPE)'}
      </span>
      <div style={{ height: 1, flex: 1, background: theme.border }} />
    </div>
  )
}

function MapeBar({ draft, theme }: { draft: ListingDraft; theme: typeof T }) {
  let pts = 0
  if (draft.country_id)                       pts += 5
  if (draft.city_id)                          pts += 5
  pts += draft.location.mape_pts               // 0, 20, or 40 from geocode
  if (draft.property_type)                    pts += 5
  if (draft.listing_type)                     pts += 5
  if (draft.price_local)                      pts += 10
  if (draft.bedrooms)                         pts += 5
  if (draft.title_document_type)              pts += MAPE.title_doc
  if (draft.agency_fee_pct)                   pts += MAPE.agency_fee
  if (draft.legal_fee_pct)                    pts += MAPE.legal_fee
  if (draft.service_charge)                   pts += MAPE.service_charge
  if (draft.size_sqm)                         pts += MAPE.size_sqm
  if (draft.description && draft.description.length > 30) pts += MAPE.description
  // NOTE: imageUrls not accessible in MapeBar (separate component).
  // Photo credit is shown inline in the image section below.

  const max  = 145
  const pct  = Math.min(100, Math.round((pts / max) * 100))
  const col  = pts >= 90 ? theme.green : pts >= 55 ? theme.amber : theme.teal

  return (
    <div style={{ background: theme.bg3, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: theme.teal, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
          MAPE listing contribution
        </span>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: col }}>+{pts} pts</span>
      </div>
      <div style={{ height: 4, background: theme.border, borderRadius: 2 }}>
        <div style={{ height: 4, width: `${pct}%`, background: col, borderRadius: 2, transition: 'width 0.35s ease' }} />
      </div>
      <div style={{ marginTop: '0.45rem', fontSize: '0.62rem', color: theme.text3 }}>
        Location accuracy is the biggest single factor — the more precisely mapped, the higher your score.
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
interface Props {
  partnerId:    string
  dark?:        boolean   // theme — matches the agency dashboard's dark prop
  onSuccess?:   (propertyId: string, meta?: { neighborhood?: string; city?: string }) => void
  onCancel?:    () => void
  initialData?: Partial<ListingDraft>
}

export default function ListingForm({ partnerId, dark: darkProp, onSuccess, onCancel, initialData }: Props) {
  // If dark is not passed, default to true (MANOP default theme)
  // This means the component works standalone AND when embedded in the dark agency dashboard
  const isDark = darkProp !== undefined ? darkProp : true

  // Override the T (theme) constants based on the dark prop
  const T_text   = isDark ? '#F8FAFC'                       : '#0F172A'
  const T_text2  = isDark ? 'rgba(248,250,252,0.65)'        : 'rgba(15,23,42,0.65)'
  const T_text3  = isDark ? 'rgba(248,250,252,0.35)'        : 'rgba(15,23,42,0.35)'
  const T_bg3    = isDark ? '#162032'                       : '#FFFFFF'
  const T_bg2    = isDark ? '#1E293B'                       : '#F1F5F9'
  const T_border = isDark ? 'rgba(248,250,252,0.08)'        : 'rgba(15,23,42,0.08)'
  const theme = { ...T, text: T_text, text2: T_text2, text3: T_text3, bg3: T_bg3, bg2: T_bg2, border: T_border }
  const INP = (focus = false): React.CSSProperties => ({
    width: '100%', padding: '0.65rem 0.875rem',
    background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
    border: `1.5px solid ${focus ? theme.purple : theme.border}`,
    borderRadius: 8, color: theme.text, fontSize: '0.875rem',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  })

  const LBL: React.CSSProperties = {
    display: 'block', fontSize: '0.68rem', fontWeight: 600,
    color: theme.text2, marginBottom: '0.35rem', letterSpacing: '0.02em',
  }

  const [draft,   setDraft]   = useState<ListingDraft>({ ...EMPTY, ...initialData })
  const [saving,  setSaving]  = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  // Geocoding state
  const [geoInput,     setGeoInput]     = useState('')
  const [geoResults,   setGeoResults]   = useState<GeoResult[]>([])
  const [geoLoading,   setGeoLoading]   = useState(false)
  const [geoOpen,      setGeoOpen]      = useState(false)
  const [geoFocused,   setGeoFocused]   = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cities = CITIES[draft.country_id] || []

  // When country changes, reset city + location + currency
  function setCountry(id: string) {
    const c = COUNTRIES.find(x => x.id === id)
    setDraft(d => ({
      ...d,
      country_id:      id,
      city_id:         '',
      location:        EMPTY_LOC,
      currency_code:   c?.currency || 'NGN',
      currency_symbol: c?.symbol   || '₦',
    }))
    setGeoInput('')
    setGeoResults([])
  }

  // ── Geocode: call Mapbox forward geocoding ────────────────────────────────
  // Proximity is biased to the selected city center so results are locally relevant
  async function geocode(query: string) {
    if (!query.trim() || query.length < 3) { setGeoResults([]); return }

    const city = cities.find(c => c.id === draft.city_id)
    const proximity = city ? `${city.lng},${city.lat}` : undefined
    const country   = draft.country_id.toLowerCase()
    const token     = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

    if (!token) {
      console.error('[ListingForm] NEXT_PUBLIC_MAPBOX_TOKEN not set')
      return
    }

    setGeoLoading(true)
    try {
      const params = new URLSearchParams({
        access_token: token,
        country,
        limit:        '5',
        types:        'address,poi,neighborhood,locality,place',
        language:     'en',
        ...(proximity ? { proximity } : {}),
      })

      const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`)
      const data = await res.json()
      setGeoResults(data.features || [])
      setGeoOpen(true)
    } catch (err) {
      console.error('[ListingForm] geocode error:', err)
    } finally {
      setGeoLoading(false)
    }
  }

  // Debounce geocoding while user types
  function handleGeoInput(val: string) {
    setGeoInput(val)
    // Update raw_input immediately but clear confidence until confirmed
    setDraft(d => ({ ...d, location: { ...d.location, raw_input: val, verified: false, mape_pts: 0, lat: null, lng: null } }))

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => geocode(val), 500)
  }

  // Agent selects a geocode result from the dropdown
  function selectGeoResult(result: GeoResult) {
    const [lng, lat] = result.center
    const conf       = result.relevance

    // MAPE location points based on geocode confidence
    const mape_pts = conf >= 0.7 ? MAPE.location_high
                   : conf >= 0.4 ? MAPE.location_medium
                   : MAPE.location_none

    const neighborhood = extractNeighborhood(result) || result.place_name.split(',')[0]

    const loc: LocationState = {
      raw_input:    geoInput,
      place_name:   result.place_name,
      lat,
      lng,
      confidence:   conf,
      neighborhood,
      verified:     conf >= 0.7,
      mape_pts,
    }

    setDraft(d => ({ ...d, location: loc }))
    setGeoInput(result.place_name)
    setGeoResults([])
    setGeoOpen(false)
  }

  // Agent typed something that returned no results — still allow save
  // but zero location MAPE points, flagged for manual review
  function confirmRawLocation() {
    if (!geoInput.trim()) return
    const loc: LocationState = {
      raw_input:   geoInput,
      place_name:  geoInput,
      lat:         null,
      lng:         null,
      confidence:  0,
      neighborhood: geoInput.split(',')[0].trim(),
      verified:    false,
      mape_pts:    0,
    }
    setDraft(d => ({ ...d, location: loc }))
    setGeoOpen(false)
  }

  function set<K extends keyof ListingDraft>(key: K, value: ListingDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }))
  }

  function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = theme.purple
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.target.style.borderColor = theme.border
  }

  // ── Select helper ─────────────────────────────────────────────────────────
  function Sel({
    value, onChange, options, placeholder, disabled,
  }: {
    value: string
    onChange: (v: string) => void
    options: Array<{ id: string; label: string }>
    placeholder: string
    disabled?: boolean
  }) {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => { e.target.style.borderColor = theme.purple }}
        onBlur={e => { e.target.style.borderColor = theme.border }}
        disabled={disabled}
        style={{
          ...INP(), cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          appearance: 'none' as const, WebkitAppearance: 'none' as const,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2394A3B8' d='M6 8L0 0h12z'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center',
          paddingRight: '2.25rem',
        }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    )
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (!draft.country_id)        return 'Select a country'
    if (!draft.city_id)           return 'Select a city'
    if (!draft.location.raw_input.trim()) return 'Enter a location — estate name, street, or landmark'
    if (!draft.property_type)     return 'Select a property type'
    if (!draft.listing_type)      return 'Select a transaction type'
    const price = parseFloat(draft.price_local.replace(/,/g, ''))
    if (!draft.price_local || isNaN(price) || price <= 0) return 'Enter a valid asking price'
    return null
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setSaving(true)

    try {
      const price      = parseFloat(draft.price_local.replace(/,/g, ''))
      const cityObj    = cities.find(c => c.id === draft.city_id)
      const countryObj = COUNTRIES.find(c => c.id === draft.country_id)

      const row = {
        data_partner_id: partnerId,
        source_type:     'agent-direct',
        confidence:      draft.location.verified ? 0.9 : 0.6,

        // Structured location
        country_code:  draft.country_id,
        city:          cityObj?.label || '',
        neighborhood:  draft.location.neighborhood,

        // Geocoordinates — null if not resolved
        lat: draft.location.lat,
        lng: draft.location.lng,

        // Classification
        property_type: draft.property_type || null,
        listing_type:  draft.listing_type,
        bedrooms:      draft.bedrooms  ? parseInt(draft.bedrooms)  : null,
        bathrooms:     draft.bathrooms ? parseInt(draft.bathrooms) : null,
        size_sqm:      draft.size_sqm  ? parseFloat(draft.size_sqm) : null,
        furnishing:    draft.furnishing || null,

        // Pricing
        price_local:   price,
        currency_code: draft.currency_code,

        // Ownership
        title_document_type: draft.title_document_type || null,

        // All location intelligence + transparency data in raw_data
        raw_data: {
          // Location
          source_agency:      null,   // set by system, not agent
          sub_location:       draft.location.raw_input,
          geocoded_place:     draft.location.place_name,
          location_confidence: draft.location.confidence,
          location_verified:  draft.location.verified,
          location_mape_pts:  draft.location.mape_pts,

          // Transparency (feeds E-score in MAPE)
          fees: {
            agency_fee_pct:  draft.agency_fee_pct  ? parseFloat(draft.agency_fee_pct)  : null,
            legal_fee_pct:   draft.legal_fee_pct   ? parseFloat(draft.legal_fee_pct)   : null,
            service_charge:  draft.service_charge  ? parseFloat(draft.service_charge)  : null,
          },

          description: draft.description || null,
          images:      imageUrls,

          // MAPE tracking — cron reads this to award points without recomputing
          listing_mape_contribution: {
            location:       draft.location.mape_pts,
            title:          draft.title_document_type ? 20 : 0,
            agency_fee:     draft.agency_fee_pct      ? 15 : 0,
            legal_fee:      draft.legal_fee_pct       ? 15 : 0,
            service_charge: draft.service_charge      ? 10 : 0,
            size:           draft.size_sqm            ? 10 : 0,
            description:    draft.description && draft.description.length > 30 ? 5 : 0,
            photos:         imageUrls.length >= 5 ? MAPE.photos_5plus : Math.round(imageUrls.length / 5 * MAPE.photos_5plus),
            total_so_far:   draft.location.mape_pts
              + (draft.title_document_type ? 20 : 0)
              + (draft.agency_fee_pct      ? 15 : 0)
              + (draft.legal_fee_pct       ? 15 : 0)
              + (draft.service_charge      ? 10 : 0)
              + (draft.size_sqm            ? 10 : 0)
              + (draft.description && draft.description.length > 30 ? 5 : 0)
              + (imageUrls.length >= 5 ? MAPE.photos_5plus : Math.round(imageUrls.length / 5 * MAPE.photos_5plus)),
          },

          listing_date:    new Date().toISOString(),
          requires_review: !draft.location.verified,  // flag for admin if location unverified
        },

        last_updated: new Date().toISOString(),
      }

      const { data, error: dbErr } = await sb
        .from('properties')
        .insert(row)
        .select('id')
        .maybeSingle()

      if (dbErr) throw new Error(dbErr.message)

      setSuccess(
        draft.location.verified
          ? '✓ Listing published — location verified by map.'
          : '✓ Listing saved — location could not be auto-verified and will be reviewed.'
      )

      setTimeout(() => {
        setDraft({ ...EMPTY })
        setGeoInput('')
        setGeoResults([])
        setImageUrls([])
        setSuccess('')
        if (data?.id) onSuccess?.(data.id, {
          neighborhood: draft.location.neighborhood || undefined,
          city:         cityObj?.label || undefined,
        })
      }, 2200)

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      <MapeBar draft={draft} theme={theme} />

      {/* ── SECTION 1: LOCATION ─────────────────────────── */}
      <SectionHead label="Location" required theme={theme} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
        <div>
          <label style={LBL}>Country *</label>
          <Sel
            value={draft.country_id}
            onChange={setCountry}
            options={COUNTRIES.map(c => ({ id: c.id, label: c.label }))}
            placeholder="— Country —"
          />
        </div>
        <div>
          <label style={LBL}>City *</label>
          <Sel
            value={draft.city_id}
            onChange={v => set('city_id', v)}
            options={cities.map(c => ({ id: c.id, label: c.label }))}
            placeholder="— City —"
            disabled={!draft.country_id}
          />
        </div>
      </div>

      {/* Smart location input — the key innovation */}
      <div style={{ marginBottom: '0.875rem', position: 'relative' }}>
        <label style={LBL}>Estate / Street / Landmark *</label>
        <div style={{ position: 'relative' }}>
          <input
            style={{ ...INP(geoFocused), paddingRight: geoLoading ? '2.5rem' : '0.875rem' }}
            placeholder='e.g. "Lekki Phase 1", "Pinnock Beach Estate", "Behind Shoprite Ajah"'
            value={geoInput}
            onChange={e => handleGeoInput(e.target.value)}
            onFocus={() => { setGeoFocused(true); if (geoResults.length > 0) setGeoOpen(true) }}
            onBlur={() => {
              setGeoFocused(false)
              // Short delay so click on dropdown result fires before close
              setTimeout(() => setGeoOpen(false), 180)
            }}
          />
          {geoLoading && (
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid rgba(91,46,255,0.2)', borderTopColor: theme.purple, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          )}
        </div>

        {/* Geocode results dropdown */}
        {geoOpen && geoResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 8, marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            {geoResults.map((r, i) => (
              <button
                key={i}
                onMouseDown={() => selectGeoResult(r)}
                style={{ width: '100%', padding: '0.65rem 0.875rem', background: 'transparent', border: 'none', borderBottom: i < geoResults.length - 1 ? `1px solid ${theme.border}` : 'none', color: theme.text, fontSize: '0.8rem', textAlign: 'left' as const, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column' as const, gap: 2 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(91,46,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontWeight: 600 }}>{r.place_name.split(',')[0]}</span>
                <span style={{ fontSize: '0.7rem', color: theme.text3 }}>{r.place_name.split(',').slice(1).join(',').trim()}</span>
                <span style={{ fontSize: '0.62rem', color: r.relevance >= 0.7 ? theme.green : r.relevance >= 0.4 ? theme.amber : theme.text3 }}>
                  {r.relevance >= 0.7 ? '✓ High confidence' : r.relevance >= 0.4 ? '~ Medium confidence' : '? Low confidence'}
                  {' '}· {Math.round(r.relevance * 100)}%
                </span>
              </button>
            ))}
            <button
              onMouseDown={confirmRawLocation}
              style={{ width: '100%', padding: '0.55rem 0.875rem', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)', border: 'none', borderTop: `1px solid ${theme.border}`, color: theme.text3, fontSize: '0.72rem', textAlign: 'left' as const, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Use "{geoInput}" as-is (unverified — 0 location MAPE pts)
            </button>
          </div>
        )}

        {/* No results state */}
        {geoOpen && !geoLoading && geoResults.length === 0 && geoInput.length >= 3 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 8, marginTop: 4, padding: '0.75rem 0.875rem', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: '0.78rem', color: theme.amber, fontWeight: 600, marginBottom: 4 }}>Location not found on map</div>
            <div style={{ fontSize: '0.7rem', color: theme.text3, lineHeight: 1.5, marginBottom: '0.5rem' }}>
              This estate or street may not be in Mapbox yet. You can still save the listing — it will be flagged for manual location review. Location MAPE points will be awarded after verification.
            </div>
            <button
              onMouseDown={confirmRawLocation}
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: theme.amber, padding: '0.4rem 0.875rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Save with unverified location →
            </button>
          </div>
        )}

        {/* Confirmed location badge */}
        {draft.location.lat && (
          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: draft.location.verified ? theme.green : theme.amber }}>
            <span>{draft.location.verified ? '✓' : '~'}</span>
            <span>
              {draft.location.verified
                ? `Verified on map · +${draft.location.mape_pts} MAPE pts · ${draft.location.lat.toFixed(4)}, ${draft.location.lng?.toFixed(4)}`
                : `Medium confidence · +${draft.location.mape_pts} MAPE pts`}
            </span>
          </div>
        )}
        {!draft.location.lat && draft.location.raw_input && !geoLoading && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.68rem', color: theme.text3 }}>
            Type to search — select a result to verify location and earn MAPE points
          </div>
        )}
      </div>

      {/* ── SECTION 2: PROPERTY TYPE ─────────────────────── */}
      <SectionHead label="Property" required theme={theme} />

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={LBL}>Property category *</label>
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
          {PROPERTY_TYPES.map(pt => {
            const active = draft.property_type === pt
            return (
              <button key={pt} onClick={() => set('property_type', active ? '' : pt)} style={{ padding: '0.35rem 0.85rem', borderRadius: 20, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${active ? theme.purple : theme.border}`, background: active ? 'rgba(91,46,255,0.12)' : 'transparent', color: active ? '#A78BFA' : theme.text2, fontWeight: active ? 600 : 400, transition: 'all 0.12s' }}>
                {pt}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
        <div>
          <label style={LBL}>Bedrooms</label>
          <Sel value={draft.bedrooms} onChange={v => set('bedrooms', v)}
            options={['Studio','1','2','3','4','5','6','7+'].map(b => ({ id: b === 'Studio' ? '0' : b, label: b === 'Studio' ? 'Studio' : `${b} bed${b==='1'?'':'s'}` }))}
            placeholder="— Beds —" />
        </div>
        <div>
          <label style={LBL}>Bathrooms</label>
          <Sel value={draft.bathrooms} onChange={v => set('bathrooms', v)}
            options={['1','2','3','4','5','6+'].map(b => ({ id: b, label: `${b} bath${b==='1'?'':'s'}` }))}
            placeholder="— Baths —" />
        </div>
        <div>
          <label style={LBL}>Furnishing</label>
          <Sel value={draft.furnishing} onChange={v => set('furnishing', v)}
            options={FURNISHING_TYPES.map(f => ({ id: f, label: f }))}
            placeholder="— Select —" />
        </div>
      </div>

      {/* ── SECTION 3: FINANCIALS ────────────────────────── */}
      <SectionHead label="Financials" required />

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={LBL}>Transaction type *</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {LISTING_TYPES.map(lt => {
            const active = draft.listing_type === lt.id
            return (
              <button key={lt.id} onClick={() => set('listing_type', active ? '' : lt.id)}
                style={{ flex: 1, padding: '0.65rem', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 700 : 400, border: `1.5px solid ${active ? theme.teal : theme.border}`, background: active ? 'rgba(20,184,166,0.1)' : 'transparent', color: active ? theme.teal : theme.text2, transition: 'all 0.12s' }}>
                {lt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.875rem', marginBottom: '0.875rem' }}>
        <div>
          <label style={LBL}>Asking price *</label>
          <input style={INP()} type="text" placeholder="e.g. 250000000"
            value={draft.price_local}
            onChange={e => set('price_local', e.target.value.replace(/[^0-9.]/g, ''))}
            onFocus={e => (e.target.style.borderColor = theme.purple)}
            onBlur={e => (e.target.style.borderColor = theme.border)}
          />
          {draft.price_local && (
            <div style={{ fontSize: '0.72rem', color: theme.green, marginTop: '0.3rem', fontWeight: 600 }}>
              {fmtPrice(draft.price_local, draft.currency_symbol)}
            </div>
          )}
        </div>
        <div>
          <label style={LBL}>Currency</label>
          <Sel value={draft.currency_code} onChange={v => {
            const c = COUNTRIES.find(x => x.currency === v)
            set('currency_code', v)
            set('currency_symbol', c?.symbol || '₦')
          }}
            options={[
              { id: 'NGN', label: '₦ Naira'   },
              { id: 'GHS', label: 'GH₵ Cedi'  },
              { id: 'KES', label: 'KSh Shilling' },
              { id: 'USD', label: '$ Dollar'  },
            ]}
            placeholder="" />
        </div>
      </div>

      {/* Transparency — optional but rewarded */}
      <div style={{ background: 'rgba(20,184,166,0.04)', border: '1px solid rgba(20,184,166,0.15)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.62rem', color: theme.teal, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
          Transparency — earn +{MAPE.agency_fee + MAPE.legal_fee + MAPE.service_charge} MAPE pts
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          {[
            { key: 'agency_fee_pct',  label: 'Agency fee (%)',       placeholder: 'e.g. 5'      },
            { key: 'legal_fee_pct',   label: 'Legal fee (%)',        placeholder: 'e.g. 2.5'    },
            { key: 'service_charge',  label: 'Service charge (p.a)', placeholder: 'e.g. 500000' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ ...LBL, color: theme.teal }}>{f.label}</label>
              <input style={INP()} type="number" placeholder={f.placeholder}
                value={(draft as unknown as Record<string, string>)[f.key]}
                onChange={e => set(f.key as keyof ListingDraft, e.target.value)}
                onFocus={e => (e.target.style.borderColor = theme.teal)}
                onBlur={e => (e.target.style.borderColor = theme.border)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: OWNERSHIP ────────────────────────── */}
      <SectionHead label="Title / Ownership" required />

      <div style={{ marginBottom: '0.875rem' }}>
        <label style={LBL}>Title document type *</label>
        <Sel value={draft.title_document_type} onChange={v => set('title_document_type', v)}
          options={TITLE_TYPES.map(t => ({ id: t, label: t }))}
          placeholder="— Select title type —" />
        {draft.title_document_type && draft.title_document_type !== 'Not Available' && (
          <div style={{ fontSize: '0.65rem', color: theme.green, marginTop: '0.3rem' }}>
            ✓ +{MAPE.title_doc} MAPE pts · Buyers see this — it directly builds trust
          </div>
        )}
      </div>

      {/* ── SECTION 5: DETAIL ───────────────────────────── */}
      <SectionHead label="Additional detail" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
        <div>
          <label style={LBL}>Size (sqm)</label>
          <input style={INP()} type="number" min="0" placeholder="e.g. 180"
            value={draft.size_sqm}
            onChange={e => set('size_sqm', e.target.value)}
            onFocus={onFocus} onBlur={onBlur}
          />
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={LBL}>Description</label>
        <textarea
          style={{ ...INP(), minHeight: 80, resize: 'vertical' as const, lineHeight: 1.6 }}
          placeholder="Describe key features, finishing, views, amenities..."
          value={draft.description}
          onChange={e => set('description', e.target.value)}
          onFocus={onFocus} onBlur={onBlur}
        />
      </div>

      {/* Photos — upload directly during listing creation */}
      <div style={{ marginBottom: '1.5rem' }}>
        <ImageUploader
          onImagesChange={setImageUrls}
          maxImages={10}
          dark={isDark}
          label="Property photos (add at least 5 for full MAPE credit)"
          hint="JPG, PNG, or WebP — drag and drop or click to select"
        />
        {imageUrls.length > 0 && imageUrls.length < 5 && (
          <div style={{ fontSize: 11, color: theme.amber, marginTop: 6 }}>
            Add {5 - imageUrls.length} more photo{5 - imageUrls.length !== 1 ? 's' : ''} for full +{MAPE.photos_5plus} MAPE credit
          </div>
        )}
        {imageUrls.length >= 5 && (
          <div style={{ fontSize: 11, color: theme.green, marginTop: 6 }}>
            ✓ {imageUrls.length} photos — full MAPE credit on next cron run
          </div>
        )}
      </div>

      {/* Errors / Success */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '0.75rem', fontSize: '0.82rem', color: theme.red, marginBottom: '1rem', lineHeight: 1.5 }}>
          ✗ {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '0.75rem', fontSize: '0.82rem', color: theme.green, marginBottom: '1rem', lineHeight: 1.5 }}>
          {success}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {onCancel && (
          <button onClick={onCancel} style={{ flex: 1, padding: '0.875rem', background: 'transparent', border: `1.5px solid ${theme.border}`, borderRadius: 10, color: theme.text2, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{ flex: 3, padding: '0.875rem', background: theme.purple, border: 'none', borderRadius: 10, color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.75 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          {saving ? (
            <>
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
              Publishing…
            </>
          ) : 'Publish listing →'}
        </button>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}