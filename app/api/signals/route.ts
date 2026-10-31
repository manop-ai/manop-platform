// app/api/signals/route.ts
// Records current MANOP activity events in activity_log.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../lib/cors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const RATE = new Map<string, number[]>()

export async function OPTIONS() {
  return handleCORSPreflight()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { signal_type, neighborhood, city, partner_id, metadata } = body

    if (!signal_type) {
      const response = NextResponse.json({ error: 'signal_type required' }, { status: 400 })
      return addCORSHeaders(response)
    }

    await sb.from('activity_log').insert({
      event_type: signal_type,
      message:    `${signal_type}${typeof neighborhood === 'string' && neighborhood ? ` · ${neighborhood.slice(0, 80)}` : ''}`,
      metadata: {
        ...metadata,
        neighborhood:  typeof neighborhood === 'string' ? neighborhood.slice(0, 80) : null,
        city:          typeof city === 'string' ? city.slice(0, 80) : null,
        partner_id:    typeof partner_id === 'string' ? partner_id.slice(0, 64) : null,
        user_agent:    req.headers.get('user-agent')?.slice(0, 100) || null,
        logged_at: new Date().toISOString(),
      },
    })

    const response = NextResponse.json({ ok: true })
    return addCORSHeaders(response)
  } catch (err) {
    // Silently fail — never break the UI for analytics
    const response = NextResponse.json({ ok: false }, { status: 200 })
    return addCORSHeaders(response)
  }
}
