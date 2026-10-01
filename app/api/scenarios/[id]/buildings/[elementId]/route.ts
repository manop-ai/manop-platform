// app/api/scenarios/[id]/buildings/[elementId]/route.ts
//
// PATCH handles two distinct kinds of change, both optional in the
// body so the client only sends what actually changed:
//   - geojson (+footprint_sqm, +orientation_deg): a move/resize/
//     rotate, routed through the geometry RPC.
//   - storeys: a plain scalar update, no RPC needed.
// DELETE removes the building outright.
// Both recompute and persist scenario_readings afterward.

import { NextRequest, NextResponse } from 'next/server'
import { recomputeAndPersistReadings } from '../../../../../../lib/scenario-persist'
import { sbFromRequest } from '../../../../../../lib/supabase/route-client'

interface PatchBuildingBody {
  geojson?: GeoJSON.Polygon
  footprint_sqm?: number
  orientation_deg?: number
  storeys?: number
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const body = (await req.json()) as PatchBuildingBody
  const sb = sbFromRequest(req)

  if (body.geojson) {
    const { error } = await sb.rpc('update_scenario_building_geometry', {
      p_element_id: params.elementId, p_geojson: body.geojson,
      p_footprint_sqm: body.footprint_sqm ?? null, p_orientation_deg: body.orientation_deg ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.storeys != null) {
    const { error } = await sb
      .from('scenario_elements')
      .update({ storeys: body.storeys, height_m: body.storeys * 3.2 })
      .eq('id', params.elementId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const readings = await recomputeAndPersistReadings(sb, params.id)
  return NextResponse.json({ ok: true, readings })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; elementId: string } }) {
  const sb = sbFromRequest(req)
  const { error } = await sb.from('scenario_elements').delete().eq('id', params.elementId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const readings = await recomputeAndPersistReadings(sb, params.id)
  return NextResponse.json({ ok: true, readings })
}