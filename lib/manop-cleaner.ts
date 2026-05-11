// lib/manop-cleaner.ts
// Manop Data Cleaning & Intelligence Engine
// Runs entirely client-side — no backend needed for cleaning
// Sends clean records to Supabase via API route

// ─── Neighborhood Normalizer ──────────────────────────────────────────────

const NEIGHBORHOOD_MAP: Record<string, { display: string; city: string; country: string }> = {
  // Lekki corridor variants
  'lekki phase 1': { display: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria' },
  'lekki phase one': { display: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria' },
  'lekki ph 1': { display: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria' },
  'lekki ph1': { display: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria' },
  'lekki phase1': { display: 'Lekki Phase 1', city: 'Lagos', country: 'Nigeria' },
  'lekki phase 2': { display: 'Lekki Phase 2', city: 'Lagos', country: 'Nigeria' },
  'lekki phase two': { display: 'Lekki Phase 2', city: 'Lagos', country: 'Nigeria' },
  'lekki': { display: 'Lekki', city: 'Lagos', country: 'Nigeria' },
  'ikota': { display: 'Ikota', city: 'Lagos', country: 'Nigeria' },
  'ikota villa': { display: 'Ikota Villa', city: 'Lagos', country: 'Nigeria' },
  'chevron': { display: 'Chevron', city: 'Lagos', country: 'Nigeria' },
  'chevron drive': { display: 'Chevron', city: 'Lagos', country: 'Nigeria' },
  'ajah': { display: 'Ajah', city: 'Lagos', country: 'Nigeria' },
  'sangotedo': { display: 'Sangotedo', city: 'Lagos', country: 'Nigeria' },
  'agungi': { display: 'Agungi', city: 'Lagos', country: 'Nigeria' },
  'osapa': { display: 'Osapa London', city: 'Lagos', country: 'Nigeria' },
  'osapa london': { display: 'Osapa London', city: 'Lagos', country: 'Nigeria' },
  'orchid': { display: 'Orchid Road', city: 'Lagos', country: 'Nigeria' },
  'orchid road': { display: 'Orchid Road', city: 'Lagos', country: 'Nigeria' },
  'badore': { display: 'Badore', city: 'Lagos', country: 'Nigeria' },
  'thomas estate': { display: 'Thomas Estate', city: 'Lagos', country: 'Nigeria' },
  'ikoyi': { display: 'Ikoyi', city: 'Lagos', country: 'Nigeria' },
  'banana island': { display: 'Banana Island', city: 'Lagos', country: 'Nigeria' },
  'victoria island': { display: 'Victoria Island', city: 'Lagos', country: 'Nigeria' },
  'vi': { display: 'Victoria Island', city: 'Lagos', country: 'Nigeria' },
  'v.i': { display: 'Victoria Island', city: 'Lagos', country: 'Nigeria' },
  'v.i.': { display: 'Victoria Island', city: 'Lagos', country: 'Nigeria' },
  'eko atlantic': { display: 'Eko Atlantic', city: 'Lagos', country: 'Nigeria' },
  'gbagada': { display: 'Gbagada', city: 'Lagos', country: 'Nigeria' },
  'maryland': { display: 'Maryland', city: 'Lagos', country: 'Nigeria' },
  'yaba': { display: 'Yaba', city: 'Lagos', country: 'Nigeria' },
  'ikeja': { display: 'Ikeja', city: 'Lagos', country: 'Nigeria' },
  'ikeja gra': { display: 'Ikeja GRA', city: 'Lagos', country: 'Nigeria' },
  'gra ikeja': { display: 'Ikeja GRA', city: 'Lagos', country: 'Nigeria' },
  'surulere': { display: 'Surulere', city: 'Lagos', country: 'Nigeria' },
  'magodo': { display: 'Magodo', city: 'Lagos', country: 'Nigeria' },
  'ojodu': { display: 'Ojodu', city: 'Lagos', country: 'Nigeria' },
  'festac': { display: 'Festac', city: 'Lagos', country: 'Nigeria' },
  'ikorodu': { display: 'Ikorodu', city: 'Lagos', country: 'Nigeria' },
  // Abuja
  'maitama': { display: 'Maitama', city: 'Abuja', country: 'Nigeria' },
  'asokoro': { display: 'Asokoro', city: 'Abuja', country: 'Nigeria' },
  'wuse 2': { display: 'Wuse 2', city: 'Abuja', country: 'Nigeria' },
  'wuse': { display: 'Wuse', city: 'Abuja', country: 'Nigeria' },
  'gwarinpa': { display: 'Gwarinpa', city: 'Abuja', country: 'Nigeria' },
  'jabi': { display: 'Jabi', city: 'Abuja', country: 'Nigeria' },
  'katampe': { display: 'Katampe', city: 'Abuja', country: 'Nigeria' },
  // Ghana
  'east legon': { display: 'East Legon', city: 'Accra', country: 'Ghana' },
  'airport residential': { display: 'Airport Residential', city: 'Accra', country: 'Ghana' },
  'cantonments': { display: 'Cantonments', city: 'Accra', country: 'Ghana' },
  'labone': { display: 'Labone', city: 'Accra', country: 'Ghana' },
  'spintex': { display: 'Spintex', city: 'Accra', country: 'Ghana' },
  'tema': { display: 'Tema', city: 'Accra', country: 'Ghana' },
  // Kenya
  'westlands': { display: 'Westlands', city: 'Nairobi', country: 'Kenya' },
  'karen': { display: 'Karen', city: 'Nairobi', country: 'Kenya' },
  'kilimani': { display: 'Kilimani', city: 'Nairobi', country: 'Kenya' },
  'lavington': { display: 'Lavington', city: 'Nairobi', country: 'Kenya' },
  'parklands': { display: 'Parklands', city: 'Nairobi', country: 'Kenya' },
  'muthaiga': { display: 'Muthaiga', city: 'Nairobi', country: 'Kenya' },
}

// ─── Property Type Normalizer ─────────────────────────────────────────────

const PROPERTY_TYPES: Record<string, string> = {
  'detached duplex': 'Detached Duplex',
  'semi detached duplex': 'Semi-Detached Duplex',
  'semi-detached duplex': 'Semi-Detached Duplex',
  'terraced duplex': 'Terraced Duplex',
  'detached bungalow': 'Detached Bungalow',
  'semi detached bungalow': 'Semi-Detached Bungalow',
  'duplex': 'Duplex',
  'bungalow': 'Bungalow',
  'flat': 'Flat / Apartment',
  'apartment': 'Flat / Apartment',
  'studio': 'Studio Apartment',
  'penthouse': 'Penthouse',
  'mansion': 'Mansion',
  'terraced': 'Terraced House',
  'detached': 'Detached House',
  'land': 'Land',
  'commercial': 'Commercial',
  'office': 'Office Space',
  'shop': 'Shop / Retail',
  'warehouse': 'Warehouse',
}

// ─── Title Document Normalizer ────────────────────────────────────────────

const TITLE_TYPES: Record<string, string> = {
  'c of o': 'C of O',
  'cofo': 'C of O',
  'c.o.f.o': 'C of O',
  'certificate of occupancy': 'C of O',
  "governor's consent": "Governor's Consent",
  'governors consent': "Governor's Consent",
  'gov consent': "Governor's Consent",
  'deed of assignment': 'Deed of Assignment',
  'deed': 'Deed of Assignment',
  'gazette': 'Gazette',
  'gazetted': 'Gazette',
  'registered': 'Registered Title',
  'freehold': 'Freehold',
  'leasehold': 'Leasehold',
  'survey': 'Survey Plan',
  'excision': 'Excision',
  'r of o': 'Right of Occupancy',
  'right of occupancy': 'Right of Occupancy',
}

// ─── Price Parser ─────────────────────────────────────────────────────────

function parsePrice(raw: string | number | null | undefined): {
  value: number | null
  currency: string
} {
  if (raw === null || raw === undefined || raw === '') return { value: null, currency: 'NGN' }
  if (typeof raw === 'number') return { value: raw, currency: 'NGN' }

  const s = String(raw).trim().toLowerCase().replace(/,/g, '')

  // Detect currency
  let currency = 'NGN'
  if (s.includes('$') || s.includes('usd')) currency = 'USD'
  else if (s.includes('ghs') || s.includes('gh₵') || s.includes('ghc')) currency = 'GHS'
  else if (s.includes('kes') || s.includes('ksh')) currency = 'KES'
  else if (s.includes('zar') || s.includes('rand')) currency = 'ZAR'

  // Extract number
  const match = s.match(/([\d.]+)\s*(b|billion|m|million|k|thousand)?/)
  if (!match) return { value: null, currency }

  let num = parseFloat(match[1])
  const suffix = match[2] || ''

  if (suffix.startsWith('b')) num *= 1_000_000_000
  else if (suffix.startsWith('m')) num *= 1_000_000
  else if (suffix.startsWith('k') || suffix.startsWith('th')) num *= 1_000

  return { value: isNaN(num) ? null : Math.round(num), currency }
}

// ─── Neighborhood Resolver ────────────────────────────────────────────────

function resolveNeighborhood(raw: string | null | undefined): {
  neighborhood: string | null
  city: string | null
  country: string | null
  confidence: 'exact' | 'fuzzy' | 'unknown'
} {
  if (!raw) return { neighborhood: null, city: null, country: null, confidence: 'unknown' }

  const s = raw.trim().toLowerCase()

  // Exact match
  if (NEIGHBORHOOD_MAP[s]) {
    const m = NEIGHBORHOOD_MAP[s]
    return { neighborhood: m.display, city: m.city, country: m.country, confidence: 'exact' }
  }

  // Try partial match — find the longest matching key contained in the string
  let bestKey = ''
  let bestMatch: typeof NEIGHBORHOOD_MAP[string] | null = null
  for (const [key, val] of Object.entries(NEIGHBORHOOD_MAP)) {
    if (s.includes(key) && key.length > bestKey.length) {
      bestKey = key
      bestMatch = val
    }
  }

  if (bestMatch) {
    return {
      neighborhood: bestMatch.display,
      city: bestMatch.city,
      country: bestMatch.country,
      confidence: 'fuzzy',
    }
  }

  // Can't resolve — keep original but flag
  return {
    neighborhood: raw.trim(),
    city: null,
    country: null,
    confidence: 'unknown',
  }
}

// ─── Property Type Resolver ───────────────────────────────────────────────

function resolvePropertyType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  for (const [key, val] of Object.entries(PROPERTY_TYPES)) {
    if (s.includes(key)) return val
  }
  return raw.trim()
}

// ─── Title Resolver ───────────────────────────────────────────────────────

function resolveTitle(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().toLowerCase()
  for (const [key, val] of Object.entries(TITLE_TYPES)) {
    if (s.includes(key)) return val
  }
  return raw.trim()
}

// ─── Bedroom/Bathroom Parser ──────────────────────────────────────────────

function parseBedrooms(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return raw > 0 && raw <= 20 ? raw : null
  const s = String(raw)
  const match = s.match(/(\d+)/)
  if (!match) return null
  const n = parseInt(match[1])
  return n > 0 && n <= 20 ? n : null
}

// ─── Listing Type Resolver ────────────────────────────────────────────────

function resolveListingType(raw: string | null | undefined): string {
  if (!raw) return 'for-sale'
  const s = raw.toLowerCase()
  if (s.includes('short') || s.includes('airbnb') || s.includes('vacation')) return 'short-let'
  if (s.includes('rent') || s.includes('let') || s.includes('lease')) return 'for-rent'
  if (s.includes('off') && s.includes('plan')) return 'off-plan'
  return 'for-sale'
}

// ─── Price Plausibility Check ─────────────────────────────────────────────

interface PriceRange {
  min: number
  max: number
}

const PLAUSIBLE_RANGES: Record<string, Record<number, PriceRange>> = {
  'Lekki Phase 1': {
    1: { min: 25_000_000, max: 80_000_000 },
    2: { min: 45_000_000, max: 120_000_000 },
    3: { min: 70_000_000, max: 200_000_000 },
    4: { min: 100_000_000, max: 300_000_000 },
    5: { min: 150_000_000, max: 500_000_000 },
  },
  'Ikoyi': {
    2: { min: 100_000_000, max: 350_000_000 },
    3: { min: 150_000_000, max: 500_000_000 },
    4: { min: 200_000_000, max: 800_000_000 },
    5: { min: 300_000_000, max: 2_000_000_000 },
  },
  'Victoria Island': {
    2: { min: 80_000_000, max: 280_000_000 },
    3: { min: 120_000_000, max: 400_000_000 },
    4: { min: 180_000_000, max: 600_000_000 },
  },
  'Lekki': {
    1: { min: 15_000_000, max: 60_000_000 },
    2: { min: 30_000_000, max: 100_000_000 },
    3: { min: 50_000_000, max: 150_000_000 },
    4: { min: 80_000_000, max: 220_000_000 },
    5: { min: 100_000_000, max: 350_000_000 },
  },
  'Ajah': {
    2: { min: 20_000_000, max: 70_000_000 },
    3: { min: 35_000_000, max: 100_000_000 },
    4: { min: 60_000_000, max: 150_000_000 },
  },
}

function checkPricePlausibility(
  price: number,
  neighborhood: string | null,
  bedrooms: number | null,
): { flag: boolean; reason: string } {
  if (!neighborhood || !bedrooms) return { flag: false, reason: '' }

  const ranges = PLAUSIBLE_RANGES[neighborhood]
  if (!ranges) return { flag: false, reason: '' }

  const range = ranges[bedrooms] || ranges[3]
  if (!range) return { flag: false, reason: '' }

  if (price < range.min) {
    return {
      flag: true,
      reason: `Price ₦${(price / 1_000_000).toFixed(1)}M is significantly below expected range for ${bedrooms}-bed in ${neighborhood} (min ₦${(range.min / 1_000_000).toFixed(0)}M). Verify or this may be rental not sale price.`,
    }
  }
  if (price > range.max) {
    return {
      flag: true,
      reason: `Price ₦${(price / 1_000_000).toFixed(1)}M is significantly above expected range for ${bedrooms}-bed in ${neighborhood} (max ₦${(range.max / 1_000_000).toFixed(0)}M). Verify or possible data error.`,
    }
  }

  return { flag: false, reason: '' }
}

// ─── Deduplication Key ────────────────────────────────────────────────────

function makeDedupKey(record: CleanRecord): string {
  const parts = [
    record.neighborhood?.toLowerCase() || '',
    String(record.bedrooms || ''),
    record.property_type?.toLowerCase() || '',
    String(Math.round((record.price || 0) / 5_000_000) * 5_000_000), // round to nearest 5M
  ]
  return parts.join('|')
}

// ─── Main Types ───────────────────────────────────────────────────────────

export interface RawRow {
  [key: string]: string | number | null | undefined
}

export interface CleanRecord {
  // Core fields
  neighborhood:        string | null
  city:                string | null
  country:             string | null
  property_type:       string | null
  bedrooms:            number | null
  bathrooms:           number | null
  price:               number | null
  currency:            string
  listing_type:        string
  title_document:      string | null
  size_sqm:            number | null
  description:         string | null
  source_agency:       string | null
  source_url:          string | null

  // Computed
  location_confidence: 'exact' | 'fuzzy' | 'unknown'
  price_flagged:       boolean
  price_flag_reason:   string
  dedup_key:           string

  // Raw preservation
  raw:                 RawRow
}

export interface ProcessingResult {
  clean:      CleanRecord[]
  flagged:    CleanRecord[]
  duplicates: { kept: CleanRecord; duplicate: CleanRecord }[]
  summary: {
    total:      number
    clean:      number
    flagged:    number
    duplicates: number
    neighborhoods: Record<string, number>
    price_range: { min: number; max: number } | null
    median_price: number | null
  }
}

// ─── Column Name Guesser ──────────────────────────────────────────────────
// Handles messy column names from any agency spreadsheet

function guessColumn(row: RawRow, candidates: string[]): string | number | null | undefined {
  const keys = Object.keys(row)
  for (const candidate of candidates) {
    const found = keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '').includes(candidate.toLowerCase().replace(/[\s_-]/g, '')))
    if (found !== undefined) return row[found]
  }
  return null
}

// ─── Main Cleaner Function ────────────────────────────────────────────────

export function processRawData(
  rows: RawRow[],
  options: {
    source_agency?: string
    default_listing_type?: string
    default_country?: string
    default_city?: string
  } = {}
): ProcessingResult {
  const cleaned: CleanRecord[] = []
  const dedupMap = new Map<string, CleanRecord>()
  const duplicates: ProcessingResult['duplicates'] = []

  for (const row of rows) {
    // Skip completely empty rows
    const values = Object.values(row).filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    if (values.length === 0) continue

    // Extract fields using flexible column name matching
    const rawPrice       = guessColumn(row, ['price', 'amount', 'cost', 'value', 'asking'])
    const rawLocation    = guessColumn(row, ['location', 'neighborhood', 'area', 'address', 'neighbourhood', 'estate'])
    const rawBeds        = guessColumn(row, ['bedroom', 'bed', 'rooms', 'br'])
    const rawBaths       = guessColumn(row, ['bathroom', 'bath', 'toilet'])
    const rawType        = guessColumn(row, ['type', 'property type', 'propertytype', 'category', 'kind'])
    const rawTitle       = guessColumn(row, ['title', 'document', 'deed', 'cofo', 'legal'])
    const rawListing     = guessColumn(row, ['listing', 'purpose', 'sale', 'rent', 'status', 'for'])
    const rawSize        = guessColumn(row, ['size', 'sqm', 'area sqm', 'floor area', 'plot size', 'land size'])
    const rawDesc        = guessColumn(row, ['description', 'details', 'features', 'notes', 'remarks'])
    const rawUrl         = guessColumn(row, ['url', 'link', 'source', 'listing url', 'property url'])

    // Parse price
    const { value: price, currency } = parsePrice(rawPrice)

    // Resolve location
    const locationStr = String(rawLocation || options.default_city || '').trim()
    const { neighborhood, city, country, confidence } = resolveNeighborhood(locationStr)

    // Resolve property type
    const property_type = resolvePropertyType(String(rawType || ''))

    // Parse bedrooms/bathrooms
    const bedrooms  = parseBedrooms(rawBeds)
    const bathrooms = parseBedrooms(rawBaths)

    // Title document
    const title_document = resolveTitle(String(rawTitle || ''))

    // Listing type
    const listing_type = resolveListingType(String(rawListing || options.default_listing_type || ''))

    // Size
    const sizeRaw = rawSize ? parseFloat(String(rawSize).replace(/[^0-9.]/g, '')) : null
    const size_sqm = sizeRaw && !isNaN(sizeRaw) && sizeRaw > 0 && sizeRaw < 100_000 ? sizeRaw : null

    // Price plausibility
    const { flag: price_flagged, reason: price_flag_reason } = checkPricePlausibility(
      price || 0,
      neighborhood,
      bedrooms,
    )

    const record: CleanRecord = {
      neighborhood:        neighborhood || (options.default_city ? locationStr : null),
      city:                city || options.default_city || null,
      country:             country || options.default_country || null,
      property_type,
      bedrooms,
      bathrooms,
      price,
      currency,
      listing_type,
      title_document,
      size_sqm,
      description:         rawDesc ? String(rawDesc).slice(0, 2000) : null,
      source_agency:       options.source_agency || null,
      source_url:          rawUrl ? String(rawUrl) : null,
      location_confidence: confidence,
      price_flagged,
      price_flag_reason,
      dedup_key:           '',
      raw:                 row,
    }

    record.dedup_key = makeDedupKey(record)

    // Deduplication check
    if (dedupMap.has(record.dedup_key)) {
      duplicates.push({ kept: dedupMap.get(record.dedup_key)!, duplicate: record })
    } else {
      dedupMap.set(record.dedup_key, record)
      cleaned.push(record)
    }
  }

  // Separate flagged from clean
  const clean   = cleaned.filter(r => !r.price_flagged && r.location_confidence !== 'unknown')
  const flagged = cleaned.filter(r => r.price_flagged  || r.location_confidence === 'unknown')

  // Summary stats
  const prices = clean.map(r => r.price).filter((p): p is number => p !== null).sort((a, b) => a - b)
  const neighborhoods: Record<string, number> = {}
  for (const r of clean) {
    const n = r.neighborhood || 'Unknown'
    neighborhoods[n] = (neighborhoods[n] || 0) + 1
  }

  const median_price = prices.length
    ? prices[Math.floor(prices.length / 2)]
    : null

  return {
    clean,
    flagged,
    duplicates,
    summary: {
      total:      rows.length,
      clean:      clean.length,
      flagged:    flagged.length,
      duplicates: duplicates.length,
      neighborhoods,
      price_range: prices.length ? { min: prices[0], max: prices[prices.length - 1] } : null,
      median_price,
    },
  }
}

// ─── CSV Parser ───────────────────────────────────────────────────────────

export function parseCSV(text: string): RawRow[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Detect delimiter
  const firstLine = lines[0]
  const delimiter = firstLine.includes('\t') ? '\t' : ','

  const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, '').trim())

  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, '').trim())
    const row: RawRow = {}
    headers.forEach((h, i) => {
      row[h] = values[i] || null
    })
    return row
  })
}

// ─── Format helpers ───────────────────────────────────────────────────────

export function fmtClean(n: number | null, currency = 'NGN'): string {
  if (!n) return '—'
  const sym = currency === 'USD' ? '$' : currency === 'GHS' ? 'GH₵' : currency === 'KES' ? 'KSh' : '₦'
  if (n >= 1_000_000_000) return `${sym}${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${sym}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${sym}${(n / 1_000).toFixed(0)}K`
  return `${sym}${n}`
}
