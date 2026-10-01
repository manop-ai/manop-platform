// app/api/scenarios/[id]/buildings/route.ts
//
// POST creates a new building object (from Draw Building or
// Duplicate) on a scenario. Storage of the actual polygon uses
// PostGIS via an RPC (ST_GeomFromGeoJSON) — same reasoning as
// set_site_exploratory_boundary: geometry columns aren't writable
// through a plain PostgREST insert with a GeoJSON body.

import { NextRequest, NextResponse } from 'next/server'
import { recomputeAndPersistReadings } from '../../../../../lib/scenario-persist'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'

interface CreateBuildingBody {
  geojson: GeoJSON.Polygon
  footprint_sqm: number
  storeys?: number
  label?: string
  element_type?: 'building' | 'open_space'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json()) as CreateBuildingBody
  if (!body.geojson || body.geojson.type !== 'Polygon') {
    return NextResponse.json({ error: 'A closed polygon is required.' }, { status: 400 })
  }

  const elementType = body.element_type ?? 'building'
  const sb = sbFromRequest(req)

  const { count } = await sb
    .from('scenario_elements')
    .select('id', { count: 'exact', head: true })
    .eq('scenario_id', params.id)
    .eq('element_type', elementType)

  const label = body.label || (elementType === 'open_space'
    ? `Open Space ${String((count ?? 0) + 1).padStart(3, '0')}`
    : `Building ${String((count ?? 0) + 1).padStart(3, '0')}`)
  const storeys = body.storeys ?? 4

  const { data: element, error } = await sb.rpc('create_scenario_building', {
    p_scenario_id: params.id, p_geojson: body.geojson, p_label: label,
    p_footprint_sqm: body.footprint_sqm, p_storeys: storeys, p_element_type: elementType,
  })

  if (error || !element) return NextResponse.json({ error: error?.message || 'Could not create the element.' }, { status: 500 })

  const readings = await recomputeAndPersistReadings(sb, params.id)
  // Return the polygon the client already drew rather than the RPC's
  // raw (non-GeoJSON) geometry serialization — see
  // get_scenario_buildings_geojson for the general list case.
  return NextResponse.json({
    building: { id: element.id, label: element.label, footprint_sqm: element.footprint_sqm, storeys: element.storeys, height_m: element.height_m, orientation_deg: element.orientation_deg, value_status: element.value_status, geojson: body.geojson },
    readings,
  }, { status: 201 })
}