// app/api/scenarios/[id]/route.ts
//
// GET    — full scenario detail: parameters, readings, elements
// PATCH  — update parameters, recompute readings + massing
// DELETE — archive (status = 'archived'), never a hard delete —
//          per the brief's "do not silently overwrite meaningful
//          historical intelligence" (§30)

import { NextRequest, NextResponse } from 'next/server'
import { computeMassing, ScenarioParameters } from '../../../../lib/scenario-engine'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { recomputeAndPersistReadings } from '../../../../lib/scenario-persist'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)

  const [{ data: scenario, error: scenarioError }, { data: readings }, { data: elements }, { data: buildings }, { data: openSpaces }] = await Promise.all([
    sb.from('development_scenarios').select('*').eq('id', params.id).single(),
    sb.from('scenario_readings').select('*').eq('scenario_id', params.id),
    sb.from('scenario_elements').select('*').eq('scenario_id', params.id),
    sb.rpc('get_scenario_buildings_geojson', { p_scenario_id: params.id }),
    sb.rpc('get_scenario_elements_geojson', { p_scenario_id: params.id, p_element_type: 'open_space' }),
  ])

  if (scenarioError || !scenario) return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 })
  return NextResponse.json({ scenario, readings: readings || [], elements: elements || [], buildings: buildings || [], openSpaces: openSpaces || [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const sb = sbFromRequest(req)

  const { data: existing, error: fetchError } = await sb
    .from('development_scenarios')
    .select('*, sites!inner(area_sqm, boundary_area_sqm, exploratory_boundary_area_sqm)')
    .eq('id', params.id)
    .single()

  if (fetchError || !existing) return NextResponse.json({ error: 'Scenario not found.' }, { status: 404 })

  const updatable = ['name', 'coverage_pct', 'storeys', 'avg_unit_area_sqm', 'parking_ratio', 'open_space_pct', 'unit_mix', 'status'] as const
  const patch: Record<string, unknown> = {}
  for (const key of updatable) if (key in body) patch[key] = body[key]

  const { data: scenario, error: updateError } = await sb
    .from('development_scenarios')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (updateError || !scenario) return NextResponse.json({ error: updateError?.message || 'Update failed.' }, { status: 400 })

  // Recompute readings against the (possibly changed) parameters. This
  // MUST go through the shared helper rather than a private
  // computeScenarioReadings() call: a scenario with real placed
  // buildings/open space (element_type 'building' / 'open_space') has
  // its footprint/GFA/building_count/open-space readings OVERRIDDEN
  // from those placed objects (see overrideReadingsWithPlacedBuildings
  // in lib/scenario-engine.ts). Recomputing with the plain
  // coverage-formula numbers here — the previous behaviour — silently
  // discarded that placed-object data on every parameter edit, which
  // is exactly the "converting a real reading back into a guess"
  // outcome the evidence rules in §9 forbid.
  const readings = await recomputeAndPersistReadings(sb, params.id)

  // The single auto-mass 'building_mass' fallback element (used only
  // when a scenario has no real placed buildings yet, e.g. a
  // point-only site with no starter geometry) still needs its own
  // dimensions refreshed from the edited parameters. Placed
  // 'building'/'open_space' elements are untouched here — the user's
  // own drawn/moved objects are never overwritten by a parameter edit.
  const site = (existing as { sites: { area_sqm: number | null; boundary_area_sqm: number | null; exploratory_boundary_area_sqm: number | null } }).sites
  const engineParams: ScenarioParameters = {
    site_area_sqm: site.area_sqm ?? site.boundary_area_sqm ?? site.exploratory_boundary_area_sqm ?? null,
    site_area_status: (site.area_sqm ?? site.boundary_area_sqm) != null ? 'fact' as const : 'estimate' as const,
    coverage_pct: scenario.coverage_pct,
    storeys: scenario.storeys,
    avg_unit_area_sqm: scenario.avg_unit_area_sqm,
    parking_ratio: scenario.parking_ratio,
    open_space_pct: scenario.open_space_pct,
    unit_mix: scenario.unit_mix,
    has_unit_mix: Array.isArray(scenario.unit_mix) && scenario.unit_mix.length > 0,
  }
  const massing = computeMassing(engineParams)

  await sb
    .from('scenario_elements')
    .update({
      footprint_sqm: massing.footprint_sqm,
      storeys: massing.storeys,
      height_m: massing.height_m,
      value_status: massing.value_status,
    })
    .eq('scenario_id', scenario.id)
    .eq('element_type', 'building_mass')

  return NextResponse.json({ scenario, readings })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { error } = await sb
    .from('development_scenarios')
    .update({ status: 'archived' })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}