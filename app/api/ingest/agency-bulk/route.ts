// app/api/ingest/agency-bulk/route.ts
// Zahazi Agency Bulk Upload API
// Accepts CSV or Excel file, parses it server-side, inserts into Supabase
// This is what the agency onboard page calls — it MUST exist or you get HTML 404

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../../lib/cors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

// ─── Live FX with timeout ─────────────────────────────────────
async function getNGNRate(): Promise<number> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const r = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 3600 },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    
    const d = await r.json()
    return d?.rates?.NGN || 1570
  } catch { return 1570 }
}

// ─── Neighborhood normalizer ──────────────────────────────────
const HOOD_MAP: Record<string, { display: string; city: string }> = {
  'lekki phase 1':  { display: 'Lekki Phase 1',   city: 'Lagos' },
  'lekki phase one':{ display: 'Lekki Phase 1',   city: 'Lagos' },
  'lekki ph 1':     { display: 'Lekki Phase 1',   city: 'Lagos' },
  'lekki ph1':      { display: 'Lekki Phase 1',   city: 'Lagos' },
  'lekki phase1':   { display: 'Lekki Phase 1',   city: 'Lagos' },
  'lekki phase 2':  { display: 'Lekki Phase 2',   city: 'Lagos' },
  'lekki':          { display: 'Lekki',            city: 'Lagos' },
  'ikoyi':          { display: 'Ikoyi',            city: 'Lagos' },
  'victoria island':{ display: 'Victoria Island',  city: 'Lagos' },
  'vi':             { display: 'Victoria Island',  city: 'Lagos' },
  'eko atlantic':   { display: 'Eko Atlantic',     city: 'Lagos' },
  'banana island':  { display: 'Banana Island',    city: 'Lagos' },
  'ikota':          { display: 'Ikota',            city: 'Lagos' },
  'chevron':        { display: 'Chevron',          city: 'Lagos' },
  'ajah':           { display: 'Ajah',             city: 'Lagos' },
  'sangotedo':      { display: 'Sangotedo',        city: 'Lagos' },
  'osapa london':   { display: 'Osapa London',     city: 'Lagos' },
  'osapa':          { display: 'Osapa London',     city: 'Lagos' },
  'gbagada':        { display: 'Gbagada',          city: 'Lagos' },
  'yaba':           { display: 'Yaba',             city: 'Lagos' },
  'ikeja':          { display: 'Ikeja',            city: 'Lagos' },
  'ikeja gra':      { display: 'Ikeja GRA',        city: 'Lagos' },
  'surulere':       { display: 'Surulere',         city: 'Lagos' },
  'magodo':         { display: 'Magodo',           city: 'Lagos' },
  'maitama':        { display: 'Maitama',          city: 'Abuja' },
  'asokoro':        { display: 'Asokoro',          city: 'Abuja' },
  'wuse 2':         { display: 'Wuse 2',           city: 'Abuja' },
  'gwarinpa':       { display: 'Gwarinpa',         city: 'Abuja' },
  'east legon':     { display: 'East Legon',       city: 'Accra' },
  'cantonments':    { display: 'Cantonments',      city: 'Accra' },
  'westlands':      { display: 'Westlands',        city: 'Nairobi' },
  'karen':          { display: 'Karen',            city: 'Nairobi' },
  'kilimani':       { display: 'Kilimani',         city: 'Nairobi' },
}

function normNeighborhood(raw: string): { neighborhood: string; city: string; confidence: string } {
  const s = raw.toLowerCase().trim()
  if (HOOD_MAP[s]) return { neighborhood: HOOD_MAP[s].display, city: HOOD_MAP[s].city, confidence: 'exact' }
  for (const [key, val] of Object.entries(HOOD_MAP)) {
    if (s.includes(key)) return { neighborhood: val.display, city: val.city, confidence: 'fuzzy' }
  }
  return { neighborhood: raw.trim(), city: '', confidence: 'unknown' }
}

// ─── Price parser ─────────────────────────────────────────────
function parsePrice(raw: unknown): { value: number | null; currency: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null, currency: 'NGN' }
  if (typeof raw === 'number') {
    const v = raw < 10_000 ? raw * 1_000_000 : raw
    return { value: v > 0 ? Math.round(v) : null, currency: 'NGN' }
  }
  const s = String(raw).toLowerCase().replace(/,/g, '').trim()
  const currency = s.includes('$') || s.includes('usd') ? 'USD' : 'NGN'
  const m = s.match(/([\d.]+)\s*(b|m|k)?/)
  if (!m) return { value: null, currency }
  let n = parseFloat(m[1])
  const sfx = m[2] || ''
  if (sfx.startsWith('b')) n *= 1_000_000_000
  else if (sfx.startsWith('m')) n *= 1_000_000
  else if (sfx.startsWith('k')) n *= 1_000
  if (currency === 'NGN' && n < 10_000) n *= 1_000_000
  return { value: n > 0 ? Math.round(n) : null, currency }
}

// ─── Property type normalizer ─────────────────────────────────
const PROP_TYPES: Record<string, string> = {
  'detached duplex': 'detached-duplex', 'semi detached duplex': 'semi-detached-duplex',
  'terraced duplex': 'terraced-duplex', 'detached bungalow': 'detached-bungalow',
  'duplex': 'duplex', 'bungalow': 'bungalow', 'flat': 'apartment',
  'apartment': 'apartment', 'studio': 'studio', 'penthouse': 'penthouse',
  'maisonette': 'maisonette', 'terraced': 'terraced-house', 'detached': 'detached-house',
  'land': 'land', 'commercial': 'commercial',
}
function normPropType(raw: unknown): string | null {
  if (!raw) return null
  const s = String(raw).toLowerCase()
  for (const [k, v] of Object.entries(PROP_TYPES)) { if (s.includes(k)) return v }
  return String(raw).trim()
}

// ─── Column guesser ───────────────────────────────────────────
function guessCol(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const needle = c.toLowerCase().replace(/[\s_()\/]/g, '')
    const found = headers.find(h => {
      const hay = h.toLowerCase().replace(/[\s_()\/]/g, '')
      return hay === needle || hay.includes(needle) || needle.includes(hay)
    })
    if (found) return found
  }
  return null
}

// ─── CSV parser ───────────────────────────────────────────────
function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const delim = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const vals = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => { row[h] = vals[i] || null })
    return row
  })
}

// ─── Main handler ─────────────────────────────────────────────
export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function POST(req: NextRequest) {
  try {
    const form      = await req.formData()
    const file      = form.get('file') as File | null
    const partnerId = form.get('partner_id') as string || ''
    const agencyName = form.get('agency_name') as string || 'Unknown Agency'

    if (!file) {
      const response = NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
      return addCORSHeaders(response)
    }

    const fileName = file.name.toLowerCase()
    const text     = await file.text()
    let rows: Record<string, unknown>[] = []

    // Parse based on file type
    if (fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
      rows = parseCSV(text)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // For Excel: return helpful error — browser can't parse binary Excel
      // Agency should save as CSV first, or use the Python script
      return NextResponse.json({
        error: 'Excel files need to be saved as CSV first. In Excel: File → Save As → CSV (Comma delimited). Then upload the CSV.',
        tip: 'Or use our Python ingest script for Excel files: manop_ingest_cw.py'
      }, { status: 400 })
    } else {
      return addCORSHeaders(NextResponse.json({
        error: `Unsupported file type: ${fileName}`
      }, { status: 400 }))
    }

    if (rows.length === 0) {
      return addCORSHeaders(NextResponse.json({ error: 'File appears empty or could not be parsed' }, { status: 400 }))
    }

    const headers = Object.keys(rows[0])
    const ngnRate = await getNGNRate()

    // Detect columns
    const colPrice    = guessCol(headers, ['price ngn', 'price (ngn)', 'annual rent', 'price', 'amount', 'asking price', 'rent'])
    const colArea     = guessCol(headers, ['area', 'neighborhood', 'neighbourhood', 'location'])
    const colCity     = guessCol(headers, ['city', 'city state', 'city/state'])
    const colBeds     = guessCol(headers, ['bedrooms', 'bedroom', 'beds'])
    const colBaths    = guessCol(headers, ['bathrooms', 'bathroom'])
    const colType     = guessCol(headers, ['property type', 'propertytype', 'type'])
    const colListing  = guessCol(headers, ['listing type', 'purpose', 'for', 'status'])
    const colTitle    = guessCol(headers, ['land title', 'title document', 'title', 'cofo'])
    const colUrl      = guessCol(headers, ['listing url', 'url', 'link'])
    const colDesc     = guessCol(headers, ['description', 'notes', 'details', 'features'])
    const colAgent    = guessCol(headers, ['agent name', 'agent', 'contact'])
    const colPlatform = guessCol(headers, ['platform source', 'platform', 'source'])

    const inserted: string[] = []
    const skipped: { row: number; reason: string }[] = []
    const seenHashes = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i]
      const rowNum = i + 2

      // Skip empty rows
      const vals = Object.values(row).filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      if (vals.length === 0) continue

      // Price
      const priceRaw = colPrice ? row[colPrice] : null
      const { value: price, currency } = parsePrice(priceRaw)
      if (!price) { skipped.push({ row: rowNum, reason: `No valid price (raw: ${priceRaw})` }); continue }

      // Location
      const areaRaw = colArea ? String(row[colArea] || '').trim() : ''
      const { neighborhood, city: detectedCity, confidence } = normNeighborhood(areaRaw)

      const cityRaw = colCity ? String(row[colCity] || '').split('/')[0].trim() : ''
      const city    = detectedCity || cityRaw || 'Lagos'

      // Listing type
      let listingType = 'for-sale'
      if (colListing) {
        const lt = String(row[colListing] || '').toLowerCase()
        if (lt.includes('rent') || lt.includes('let')) listingType = 'for-rent'
        else if (lt.includes('short')) listingType = 'short-let'
        else if (lt.includes('off') && lt.includes('plan')) listingType = 'off-plan'
      }

      // Other fields
      const bedrooms  = colBeds  ? parseInt(String(row[colBeds] || '')) || null : null
      const bathrooms = colBaths ? parseFloat(String(row[colBaths] || '')) || null : null
      const propType  = normPropType(colType ? row[colType] : null)
      const titleDoc  = colTitle ? String(row[colTitle] || '').trim() || null : null
      const srcUrl    = colUrl   ? String(row[colUrl] || '').trim() || null : null
      const desc      = colDesc  ? String(row[colDesc] || '').slice(0, 2000) || null : null
      const agentName = colAgent ? String(row[colAgent] || '').trim() || null : null
      const platform  = colPlatform ? String(row[colPlatform] || '').trim() || null : null

      const priceUSD = Math.round(price / ngnRate)

      // Simple dedup hash
      const hashKey = `${neighborhood}|${bedrooms}|${Math.round(price / 1_000_000)}`
      if (seenHashes.has(hashKey)) { skipped.push({ row: rowNum, reason: 'duplicate' }); continue }
      seenHashes.add(hashKey)

      const record = {
        data_partner_id:     partnerId || null,
        source_type:         'agent-direct',
        country_code:        'NG',
        city,
        neighborhood:        neighborhood || null,
        property_type:       propType,
        listing_type:        listingType,
        bedrooms,
        bathrooms,
        price_local:         price,
        currency_code:       currency,
        price_usd:           priceUSD,
        title_document_type: titleDoc,
        agent_phone:         null,
        confidence:          confidence === 'exact' ? 0.90 : confidence === 'fuzzy' ? 0.75 : 0.60,
        raw_data: {
          source_agency:        agencyName,
          source_url:           srcUrl,
          description:          desc,
          agent_name:           agentName,
          platform_source:      platform,
          location_confidence:  confidence,
          intel: { price_usd: priceUSD, fx_rate: ngnRate, fx_source: 'open.er-api.com', computed_at: new Date().toISOString() },
          imported_via:         'agency-bulk-upload',
          imported_at:          new Date().toISOString(),
        },
      }

      const { error } = await sb.from('properties').insert(record)
      if (error) {
        skipped.push({ row: rowNum, reason: error.message.slice(0, 80) })
      } else {
        inserted.push(`${bedrooms || '?'}bed ${neighborhood}`)
      }
    }

    const response = NextResponse.json({
      success:  true,
      inserted: inserted.length,
      skipped:  skipped.length,
      total:    rows.length,
      summary: {
        columns_detected: { price: colPrice, area: colArea, beds: colBeds, type: colType },
        inserted_sample:  inserted.slice(0, 5),
        skipped_detail:   skipped.slice(0, 10),
      },
    })
    return addCORSHeaders(response)

  } catch (err: unknown) {
    console.error('Agency bulk upload error:', err)
    const response = NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
    return addCORSHeaders(response)
  }
}