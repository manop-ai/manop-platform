// app/api/agent-trust/route.ts
// Returns the trust level for an agency
// GET /api/agent-trust?agency=CW%20Real%20Estate

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

export async function GET(req: NextRequest) {
  try {
    const agency = req.nextUrl.searchParams.get('agency')
    if (!agency) {
      const response = NextResponse.json({ error: 'agency parameter required' }, { status: 400 })
      return addCORSHeaders(response)
    }

    const { data } = await sb.from('data_partners').select('trust_level').eq('name', agency).single()
    const trustLevel = data?.trust_level || null

    const response = NextResponse.json({ trustLevel })
    return addCORSHeaders(response)
  } catch (err) {
    const response = NextResponse.json({ error: String(err) }, { status: 500 })
    return addCORSHeaders(response)
  }
}