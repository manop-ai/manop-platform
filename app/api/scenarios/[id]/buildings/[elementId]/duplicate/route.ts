// app/api/scenarios/[id]/buildings/[elementId]/duplicate/route.ts
//
// Duplicates a building: same footprint/storeys, geometry offset 5m
// east so the copy is visibly distinct rather than stacked exactly
// on top of the original, matching the "I can actually arrange
// development on the site" goal — a duplicate you can't see isn't
// useful.

import { NextRequest, NextResponse } from 'next/server'
import { recomputeAndPersistReadings } from '../../../../../../../lib/scenario-persist'
import { translatePolygon } from '../../../../../../../lib/scenario-geometry'
import { sbFromRequest } from '../../../../../../../lib/supabase/route-client'

export async function POST(req: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const body = (await req.json()) as { geojson: GeoJSON.Polygon }
  if (!body.geojson) return NextResponse.json({ error: 'Original geometry is required to duplicate.' }, { status: 400 })

  const sb = sbFromRequest(req)

  const { data: original } = await sb
    .from('scenario_elements')
    .select('label, footprint_sqm, storeys')
    .eq('id', params.elementId)
    .single()

  if (!original) return NextResponse.json({ error: 'Building not found.' }, { status: 404 })

  const { count } = await sb
    .from('scenario_elements')
    .select('id', { count: 'exact', head: true })
    .eq('scenario_id', params.id)
    .eq('element_type', 'building')

  const label = `Building ${String((count ?? 0) + 1).padStart(3, '0')}`
  const movedPolygon = translatePolygon(body.geojson, 0, 5)

  const { data: element, error } = await sb.rpc('create_scenario_building', {
    p_scenario_id: params.id, p_geojson: movedPolygon, p_label: label,
    p_footprint_sqm: original.footprint_sqm, p_storeys: original.storeys,
  })

  if (error || !element) return NextResponse.json({ error: error?.message || 'Could not duplicate the building.' }, { status: 500 })

  const readings = await recomputeAndPersistReadings(sb, params.id)
  return NextResponse.json({
    building: { id: element.id, label: element.label, footprint_sqm: element.footprint_sqm, storeys: element.storeys, height_m: element.height_m, orientation_deg: element.orientation_deg, value_status: element.value_status, geojson: movedPolygon },
    readings,
  }, { status: 201 })
}