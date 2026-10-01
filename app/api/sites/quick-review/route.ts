// app/api/sites/quick-review/route.ts
//
// The "Quick Site Review" endpoint — instant, no MANOP staff
// involved. Creates a minimal `sites` row flagged `is_quick_review`,
// runs compute_site_planning_intersections() against whatever's
// currently in spatial_dataset_registry, and returns immediately.
//
// Deliberately reuses the `sites` table and the Site Intelligence
// Profile page as the result view, rather than a separate throwaway
// result type — a quick review IS a site, just one nobody's reviewed
// yet, and it can be upgraded into a full submission later via
// /api/sites/[id]/request-review without re-entering anything.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSiteSignal } from '../../../../lib/log-site-signal'

interface QuickReviewPayload {
  country_code: string
  state?: string
  city: string
  neighborhood?: string
  lat: number
  lng: number
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as QuickReviewPayload

  if (!body.city || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: 'City and coordinates are required for a quick review.' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    authHeader ? { global: { headers: { Authorization: authHeader } } } : undefined,
  )

  const { data: { user } } = await sb.auth.getUser()

  const { data: site, error: siteError } = await sb
    .from('sites')
    .insert({
      country_code: body.country_code || 'NG',
      state: body.state ?? null,
      city: body.city,
      neighborhood: body.neighborhood ?? null,
      lat: body.lat,
      lng: body.lng,
      entry_source: 'developer_self',
      submitted_by_user_id: user?.id ?? null,
      opportunity_type: 'vacant_land',
      site_status: 'draft',
      is_quick_review: true,
      coordinate_source: 'Quick Site Review — as entered by user, not from a survey document',
    })
    .select()
    .single()

  if (siteError || !site) {
    return NextResponse.json({ error: siteError?.message || 'Could not run quick review' }, { status: 500 })
  }

  await logSiteSignal(sb, 'site_quick_review', {
    siteId: site.id, city: body.city, neighborhood: body.neighborhood, countryCode: body.country_code,
  })

  const { data: matchCount, error: rpcError } = await sb.rpc('compute_site_planning_intersections', {
    p_site_id: site.id,
  })

  if (rpcError) {
    // The site still exists and is viewable — the intersection just
    // didn't run. Surface this rather than pretending it succeeded.
    return NextResponse.json(
      { site, warning: `Site created, but the spatial check failed: ${rpcError.message}` },
      { status: 207 },
    )
  }

  return NextResponse.json({ site, matches_found: matchCount ?? 0 }, { status: 201 })
}