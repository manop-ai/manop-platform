// app/api/partner/listings/route.ts
// Manop Partner Ingestion API
//
// Portal partners POST their listings here.
// Manop normalizes, converts to USD, computes basic intel, stores.
// Supports both single listing and batch (up to 500 per request).
//
// Auth: partner API key in header X-Partner-Key
// POST /api/partner/listings

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../../lib/cors'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

// ─── USD exchange rates (update weekly via cron) ──────────────
// In production: fetch from exchangerate-api or similar
const FX_RATES: Record<string, number> = {
  NGN: 1620,   // 1 USD = 1620 NGN  (update regularly)
  GHS: 15.2,   // 1 USD = 15.2 GHS
  KES: 129,    // 1 USD = 129 KES
  ZAR: 18.5,   // 1 USD = 18.5 ZAR
  USD: 1,
}

function toUSD(amount: number, currency: string): number {
  const rate = FX_RATES[currency.toUpperCase()] || 1
  return Math.round((amount / rate) * 100) / 100
}

// ─── Basic intel computation ──────────────────────────────────
// Free-tier intel computed on every property at ingest time
function computeBasicIntel(p: PartnerListing) {
  const priceUSD = toUSD(p.price_local, p.currency_code || 'NGN')

  // Traditional yield (annual rent / price)
  let traditional_yield_pct: number | null = null
  if (p.listing_type === 'for-rent' && p.price_local > 0) {
    // Annual rent as % of estimated property value
    // We use a market-standard multiplier per tier
    const annualRent = p.price_local
    const estimatedValue = annualRent * 15 // rough: yield = 1/15 ≈ 6.7%
    traditional_yield_pct = Math.round((annualRent / estimatedValue) * 1000) / 10
  }

  // ROI signal (simple: based on location tier + bedroom count)
  // Will be replaced by real benchmark data once market_benchmarks populates
  const roi_signal = priceUSD < 150000 ? 'mid-range' :
                     priceUSD < 500000 ? 'premium' : 'ultra-premium'

  return {
    price_usd: priceUSD,
    traditional_yield_pct,
    roi_signal,
    investment_score: null, // computed later from benchmarks
  }
}

// ─── Neighborhood normalizer (shared with manop-cleaner) ──────
const HOOD_MAP: Record<string, { display: string; city: string }> = {
  'lekki phase 1': { display: 'Lekki Phase 1', city: 'Lagos' },
  'lekki phase one': { display: 'Lekki Phase 1', city: 'Lagos' },
  'lekki ph 1': { display: 'Lekki Phase 1', city: 'Lagos' },
  'lekki': { display: 'Lekki', city: 'Lagos' },
  'ikoyi': { display: 'Ikoyi', city: 'Lagos' },
  'victoria island': { display: 'Victoria Island', city: 'Lagos' },
  'vi': { display: 'Victoria Island', city: 'Lagos' },
  'v.i': { display: 'Victoria Island', city: 'Lagos' },
  'eko atlantic': { display: 'Eko Atlantic', city: 'Lagos' },
  'ajah': { display: 'Ajah', city: 'Lagos' },
  'chevron': { display: 'Chevron', city: 'Lagos' },
  'ikota': { display: 'Ikota', city: 'Lagos' },
  'sangotedo': { display: 'Sangotedo', city: 'Lagos' },
  'gbagada': { display: 'Gbagada', city: 'Lagos' },
  'yaba': { display: 'Yaba', city: 'Lagos' },
  'ikeja': { display: 'Ikeja', city: 'Lagos' },
  'ikeja gra': { display: 'Ikeja GRA', city: 'Lagos' },
  'surulere': { display: 'Surulere', city: 'Lagos' },
  'maitama': { display: 'Maitama', city: 'Abuja' },
  'asokoro': { display: 'Asokoro', city: 'Abuja' },
  'wuse 2': { display: 'Wuse 2', city: 'Abuja' },
  'east legon': { display: 'East Legon', city: 'Accra' },
  'cantonments': { display: 'Cantonments', city: 'Accra' },
  'westlands': { display: 'Westlands', city: 'Nairobi' },
  'karen': { display: 'Karen', city: 'Nairobi' },
  'kilimani': { display: 'Kilimani', city: 'Nairobi' },
}

function normalizeNeighborhood(raw: string): { neighborhood: string; city: string | null } {
  const s = raw.toLowerCase().trim()
  if (HOOD_MAP[s]) return { neighborhood: HOOD_MAP[s].display, city: HOOD_MAP[s].city }
  for (const [key, val] of Object.entries(HOOD_MAP)) {
    if (s.includes(key)) return { neighborhood: val.display, city: val.city }
  }
  return { neighborhood: raw.trim(), city: null }
}

// ─── Dedup key ────────────────────────────────────────────────
function makeDedupHash(p: PartnerListing, partnerShortCode: string): string {
  const key = [
    partnerShortCode,
    p.external_id || '',
    (p.neighborhood || '').toLowerCase(),
    String(p.bedrooms || ''),
    String(Math.round((p.price_local || 0) / 1_000_000)),
  ].join('|')
  // Simple hash — good enough for dedup
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i)
    hash |= 0
  }
  return `${partnerShortCode}-${Math.abs(hash).toString(36)}`
}

// ─── Types ────────────────────────────────────────────────────
export interface PartnerListing {
  // Required
  external_id:    string       // partner's own ID — used for dedup + updates
  listing_type:   'for-sale' | 'for-rent' | 'short-let' | 'off-plan'
  price_local:    number
  currency_code:  string
  neighborhood:   string
  city?:          string
  country_code?:  string

  // Strongly recommended
  property_type?: string
  bedrooms?:      number
  bathrooms?:     number
  size_sqm?:      number
  title_document_type?: string

  // Rich content — shown on Zahazi property card
  title?:         string
  description?:   string
  images?:        string[]     // array of image URLs from partner's CDN
  source_url?:    string       // deep link back to listing on partner platform

  // Agent info — for lead routing
  agent_name?:    string
  agent_phone?:   string
  agent_email?:   string

  // Dates
  listing_date?:  string       // ISO date string
}

interface PartnerPayload {
  listings:  PartnerListing[]
  sync_mode: 'upsert' | 'append'  // upsert: update existing by external_id; append: insert only new
}

// ─── Auth helper ──────────────────────────────────────────────
async function authenticatePartner(apiKey: string) {
  const { data, error } = await supabase
    .from('data_partners')
    .select('id, name, short_code, trust_level, active')
    .eq('api_key', apiKey)
    .eq('active', true)
    .single()

  if (error || !data) return null
  return data
}

// ─── Main handler ─────────────────────────────────────────────
export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    const apiKey = req.headers.get('X-Partner-Key')
    if (!apiKey) {
      const response = NextResponse.json({ error: 'Missing X-Partner-Key header' }, { status: 401 })
      return addCORSHeaders(response)
    }

    const partner = await authenticatePartner(apiKey)
    if (!partner) {
      const response = NextResponse.json({ error: 'Invalid or inactive partner key' }, { status: 403 })
      return addCORSHeaders(response)
    }

    // Parse body
    let payload: PartnerPayload
    try {
      payload = await req.json()
    } catch {
      const response = NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      return addCORSHeaders(response)
    }

    const { listings, sync_mode = 'upsert' } = payload

    if (!Array.isArray(listings) || listings.length === 0) {
      const response = NextResponse.json({ error: 'listings array is required and must not be empty' }, { status: 400 })
      return addCORSHeaders(response)
    }

    if (listings.length > 500) {
      const response = NextResponse.json({ error: 'Maximum 500 listings per request. Use multiple requests for larger batches.' }, { status: 400 })
      return addCORSHeaders(response)
    }

    // Process each listing
    const inserted: string[] = []
    const updated: string[] = []
    const skipped: { id: string; reason: string }[] = []

    for (const listing of listings) {
      // Validate required fields
      if (!listing.external_id || !listing.price_local || !listing.neighborhood) {
        skipped.push({ id: listing.external_id || 'unknown', reason: 'Missing required fields: external_id, price_local, neighborhood' })
        continue
      }

      if (!listing.listing_type) {
        skipped.push({ id: listing.external_id, reason: 'Missing listing_type' })
        continue
      }

      // Normalize location
      const { neighborhood, city } = normalizeNeighborhood(listing.neighborhood)

      // Compute intel
      const intel = computeBasicIntel(listing)

      // Build dedup hash
      const raw_hash = makeDedupHash(listing, partner.short_code)

      // Map to properties table schema
      const row = {
        // Source attribution
        data_partner_id:      partner.id,
        source_type:          'agent-direct',
        confidence:           0.85,

        // Location
        country_code:         listing.country_code || 'NG',
        city:                 listing.city || city || 'Unknown',
        neighborhood,

        // Classification
        property_type:        listing.property_type || null,
        listing_type:         listing.listing_type,
        bedrooms:             listing.bedrooms || null,
        bathrooms:            listing.bathrooms || null,
        size_sqm:             listing.size_sqm || null,
        furnishing:           null,

        // Pricing — store both local and USD
        price_local:          listing.price_local,
        currency_code:        listing.currency_code || 'NGN',
        price_usd:            intel.price_usd,

        // Title / legal
        title_document_type:  listing.title_document_type || null,

        // Agent / lead routing
        agent_phone:          listing.agent_phone || null,

        // Rich content
        raw_data: {
          // Partner source fields
          external_id:    listing.external_id,
          partner_id:     partner.id,
          partner_name:   partner.name,
          source_url:     listing.source_url || null,
          title:          listing.title || null,
          description:    listing.description || null,
          images:         listing.images || [],
          agent_name:     listing.agent_name || null,
          agent_email:    listing.agent_email || null,
          listing_date:   listing.listing_date || null,

          // Intel computed at ingest
          intel: {
            traditional_yield_pct: intel.traditional_yield_pct,
            roi_signal:            intel.roi_signal,
            price_usd:             intel.price_usd,
            fx_rate_used:          FX_RATES[listing.currency_code] || 1,
            fx_rate_currency:      listing.currency_code,
            computed_at:           new Date().toISOString(),
          },
        },

        // Dedup
        raw_hash,
        last_updated: new Date().toISOString(),
      }

      if (sync_mode === 'upsert') {
        // Check if this listing already exists by external_id + partner
        const { data: existing } = await supabase
          .from('properties')
          .select('id')
          .eq('raw_hash', raw_hash)
          .single()

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('properties')
            .update(row)
            .eq('id', existing.id)

          if (error) {
            skipped.push({ id: listing.external_id, reason: error.message })
          } else {
            updated.push(listing.external_id)
          }
        } else {
          // Insert new
          const { error } = await supabase
            .from('properties')
            .insert(row)

          if (error) {
            skipped.push({ id: listing.external_id, reason: error.message })
          } else {
            inserted.push(listing.external_id)
          }
        }
      } else {
        // append: skip if hash exists
        const { error } = await supabase
          .from('properties')
          .insert(row)

        if (error?.code === '23505') {
          skipped.push({ id: listing.external_id, reason: 'duplicate' })
        } else if (error) {
          skipped.push({ id: listing.external_id, reason: error.message })
        } else {
          inserted.push(listing.external_id)
        }
      }
    }

    // Log to activity_log
    await supabase.from('activity_log').insert({
      event_type: 'partner_ingest',
      message:    `${partner.name} pushed ${listings.length} listings`,
      metadata: {
        partner_id:   partner.id,
        partner_name: partner.name,
        sync_mode,
        inserted:     inserted.length,
        updated:      updated.length,
        skipped:      skipped.length,
      },
    })

    const response = NextResponse.json({
      success:  true,
      partner:  partner.name,
      summary: {
        received: listings.length,
        inserted: inserted.length,
        updated:  updated.length,
        skipped:  skipped.length,
      },
      skipped_detail: skipped.length > 0 ? skipped : undefined,
    })
    return addCORSHeaders(response)

  } catch (err) {
    console.error('Partner listing POST error:', err)
    const response = NextResponse.json({ error: String(err) }, { status: 500 })
    return addCORSHeaders(response)
  }
}

// ─── GET: partner health check + stats ───────────────────────
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('X-Partner-Key')
    if (!apiKey) {
      const response = NextResponse.json({ error: 'Missing X-Partner-Key' }, { status: 401 })
      return addCORSHeaders(response)
    }

    const partner = await authenticatePartner(apiKey)
    if (!partner) {
      const response = NextResponse.json({ error: 'Invalid key' }, { status: 403 })
      return addCORSHeaders(response)
    }

    const { count } = await supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('data_partner_id', partner.id)

    const response = NextResponse.json({
      partner:        partner.name,
      short_code:     partner.short_code,
      trust_level:    partner.trust_level,
      listing_count:  count || 0,
      status:         'active',
      api_version:    '1.0',
      endpoints: {
        push_listings:  'POST /api/partner/listings',
        health_check:   'GET /api/partner/listings',
        lead_webhook:   'Configure in partner dashboard (coming soon)',
      },
    })
    return addCORSHeaders(response)
  } catch (err) {
    console.error('Partner listing GET error:', err)
    const response = NextResponse.json({ error: String(err) }, { status: 500 })
    return addCORSHeaders(response)
  }
}