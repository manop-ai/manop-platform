// app/api/signals/route.ts
// Manop Demand Signal Collector
// Receives events from Zahazi client pages and logs to activity_log
// This is how user behavior becomes market intelligence

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../lib/cors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const WEIGHTS: Record<string, number> = {
  search_location: 1, search_filter: 1, property_view: 2,
  property_save: 5, contact_click: 10, phone_reveal: 20, enquiry_sent: 25,
}

export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { signal_type, neighborhood, city, property_id, partner_id, metadata } = body

    if (!signal_type) {
      const response = NextResponse.json({ error: 'signal_type required' }, { status: 400 })
      return addCORSHeaders(response)
    }

    await sb.from('activity_log').insert({
      event_type: signal_type,
      message:    `${signal_type}${neighborhood ? ` · ${neighborhood}` : ''}`,
      metadata: {
        neighborhood:  neighborhood  || null,
        city:          city          || null,
        property_id:   property_id   || null,
        partner_id:    partner_id    || null,
        weight:        WEIGHTS[signal_type] || 1,
        user_agent:    req.headers.get('user-agent')?.slice(0, 100) || null,
        ...metadata,
        logged_at: new Date().toISOString(),
      },
    })

    const response = NextResponse.json({ ok: true })
    return addCORSHeaders(response)
  } catch (err) {
    // Silently fail — never break the UI for analytics
    const response = NextResponse.json({ ok: false, error: String(err) }, { status: 200 })
    return addCORSHeaders(response)
  }
}