// app/api/signals/site-view/route.ts
//
// Fired client-side on mount from the Review page, not during server
// render — a GET request rendering a page shouldn't also be writing
// to the database as a side effect of being loaded/cached/prefetched.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSiteSignal } from '../../../../lib/log-site-signal'

export async function POST(req: NextRequest) {
  const { siteId, city, neighborhood, countryCode } = await req.json()
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  await logSiteSignal(sb, 'site_viewed', { siteId, city, neighborhood, countryCode })
  return NextResponse.json({ ok: true })
}