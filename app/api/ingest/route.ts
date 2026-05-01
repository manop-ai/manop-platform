// app/api/ingest/route.ts
// Receives cleaned records from the upload tool and saves to Supabase

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../lib/cors'
import type { CleanRecord } from '../../../lib/manop-cleaner'

export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    )

    const { records, source_agency }: { records: CleanRecord[]; source_agency: string } = await req.json()

    if (!records || !Array.isArray(records) || records.length === 0) {
      const response = NextResponse.json({ error: 'No records provided' }, { status: 400 })
      return addCORSHeaders(response)
    }

    // Map CleanRecord to properties table schema
    const rows = records.map(r => ({
      property_type:       r.property_type?.toLowerCase().replace(/ \/ /g, '-').replace(/\s+/g, '-') || null,
      bedrooms:            r.bedrooms,
      bathrooms:           r.bathrooms,
      city:                r.city,
      neighborhood:        r.neighborhood,
      country_code:        r.country === 'Nigeria' ? 'NG' : r.country === 'Ghana' ? 'GH' : r.country === 'Kenya' ? 'KE' : r.country === 'South Africa' ? 'ZA' : null,
      price_local:         r.price,
      currency_code:       r.currency || 'NGN',
      listing_type:        r.listing_type || 'for-sale',
      title_document_type: r.title_document,
      size_sqm:            r.size_sqm,
      source_type:         'agency-partner',
      raw_data: {
        source_agency,
        description:  r.description,
        source_url:   r.source_url,
        dedup_key:    r.dedup_key,
        raw_input:    r.raw,
        location_confidence: r.location_confidence,
        imported_at:  new Date().toISOString(),
      },
      confidence: r.location_confidence === 'exact' ? 0.95 : r.location_confidence === 'fuzzy' ? 0.80 : 0.60,
    }))

    // Batch insert
    const { data, error } = await supabase
      .from('properties')
      .insert(rows)
      .select('id')

    if (error) {
      console.error('Supabase insert error:', error)
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      return addCORSHeaders(response)
    }

    const response = NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      message: `${data?.length || 0} records saved to Manop database`,
    })
    return addCORSHeaders(response)

  } catch (err) {
    console.error('Ingest route error:', err)
    const response = NextResponse.json({ error: String(err) }, { status: 500 })
    return addCORSHeaders(response)
  }
}
