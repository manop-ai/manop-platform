// app/api/sites/[id]/exploratory-boundary/route.ts
//
// POST saves a user-drawn polygon via the SECURITY DEFINER RPC
// (scoped to only the exploratory_* columns — see
// sql/2026_site_studio_exploratory_boundary.sql). DELETE clears it.
// Open access, matching Quick Review / Appraisal / Scenario creation.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as { geojson: GeoJSON.Polygon }
  if (!body.geojson || body.geojson.type !== 'Polygon') {
    return NextResponse.json({ error: 'A closed polygon is required.' }, { status: 400 })
  }

  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()

  const { data, error } = await sb.rpc('set_site_exploratory_boundary', {
    p_site_id: params.id,
    p_geojson: body.geojson,
    p_drawn_by: user?.id ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data?.success) return NextResponse.json({ error: data?.error || 'Could not save the drawn boundary.' }, { status: 400 })

  return NextResponse.json({ area_sqm: data.area_sqm })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { error } = await sb.rpc('clear_site_exploratory_boundary', { p_site_id: params.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}