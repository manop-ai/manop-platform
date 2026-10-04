// app/api/signals/route.ts
// Records current MANOP activity events in activity_log.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addCORSHeaders, handleCORSPreflight } from '../../../lib/cors'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

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
      message:    `${signal_type}${neighborhood ? ` · ${neighborhood}` : ''}`,
      metadata: {
        neighborhood:  neighborhood  || null,
        city:          city          || null,
        partner_id:    partner_id    || null,
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