// app/api/scenarios/[id]/duplicate/route.ts
//
// Duplicates a scenario so a user can branch off an existing
// exploration ("Scenario A" → "Scenario B, 6 storeys instead of 4")
// without losing the original — the iterative workflow the brief
// describes in §29.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()

  const [{ data: original, error: origError }, { data: readings }, { data: elements }] = await Promise.all([
    sb.from('development_scenarios').select('*').eq('id', params.id).single(),
    sb.from('scenario_readings').select('*').eq('scenario_id', params.id),
    sb.from('scenario_elements').select('*').eq('scenario_id', params.id),
  ])

  if (origError || !original) return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 })

  const { data: copy, error: copyError } = await sb
    .from('development_scenarios')
    .insert({
      site_id: original.site_id,
      preset_id: original.preset_id,
      name: `${original.name} (copy)`,
      development_category: original.development_category,
      coverage_pct: original.coverage_pct,
      storeys: original.storeys,
      avg_unit_area_sqm: original.avg_unit_area_sqm,
      parking_ratio: original.parking_ratio,
      open_space_pct: original.open_space_pct,
      unit_mix: original.unit_mix,
      parameters_json: original.parameters_json,
      duplicated_from_id: original.id,
      created_by_user_id: user?.id ?? null,
    })
    .select()
    .single()

  if (copyError || !copy) return NextResponse.json({ error: copyError?.message || 'Duplicate failed.' }, { status: 500 })

  if (readings && readings.length > 0) {
    await sb.from('scenario_readings').insert(
      readings.map(r => ({
        scenario_id: copy.id, reading_key: r.reading_key, label: r.label, numeric_value: r.numeric_value,
        unit: r.unit, value_status: r.value_status, derivation_note: r.derivation_note, source: r.source,
      })),
    )
  }

  if (elements && elements.length > 0) {
    await sb.from('scenario_elements').insert(
      elements.map(e => ({
        scenario_id: copy.id, element_type: e.element_type, label: e.label, geometry: e.geometry,
        footprint_sqm: e.footprint_sqm, storeys: e.storeys, height_m: e.height_m,
        orientation_deg: e.orientation_deg, value_status: e.value_status,
      })),
    )
  }

  return NextResponse.json({ scenario: copy }, { status: 201 })
}