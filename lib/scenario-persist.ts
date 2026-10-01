// lib/scenario-persist.ts
//
// Server-only helper shared by every API route that changes a
// scenario's building objects (create/move/resize/rotate/duplicate/
// delete). Each of those routes needs the exact same three steps —
// refetch the scenario's parameters and placed buildings, recompute
// readings, upsert — so it lives here once rather than being
// duplicated per route.

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeScenarioReadings, overrideReadingsWithPlacedBuildings, overrideReadingWithPlacedOpenSpace, ScenarioParameters } from './scenario-engine'

export async function recomputeAndPersistReadings(sb: SupabaseClient, scenarioId: string) {
  const { data: scenario } = await sb
    .from('development_scenarios')
    .select('*, sites!inner(area_sqm, boundary_area_sqm, exploratory_boundary_area_sqm)')
    .eq('id', scenarioId)
    .single()

  if (!scenario) return

  const site = (scenario as any).sites as { area_sqm: number | null; boundary_area_sqm: number | null; exploratory_boundary_area_sqm: number | null }

  const params: ScenarioParameters = {
    site_area_sqm: site.area_sqm ?? site.boundary_area_sqm ?? site.exploratory_boundary_area_sqm ?? null,
    site_area_status: (site.area_sqm ?? site.boundary_area_sqm) != null ? 'fact' : 'estimate',
    coverage_pct: scenario.coverage_pct,
    storeys: scenario.storeys,
    avg_unit_area_sqm: scenario.avg_unit_area_sqm,
    parking_ratio: scenario.parking_ratio,
    open_space_pct: scenario.open_space_pct,
    unit_mix: scenario.unit_mix,
    has_unit_mix: Array.isArray(scenario.unit_mix) && scenario.unit_mix.length > 0,
  }

  const { data: buildings } = await sb
    .from('scenario_elements')
    .select('footprint_sqm, storeys')
    .eq('scenario_id', scenarioId)
    .eq('element_type', 'building')

  const { data: openSpaces } = await sb
    .from('scenario_elements')
    .select('footprint_sqm')
    .eq('scenario_id', scenarioId)
    .eq('element_type', 'open_space')

  const baseReadings = computeScenarioReadings(params)
  const withBuildings = overrideReadingsWithPlacedBuildings(baseReadings, (buildings || []).map(b => ({
    footprint_sqm: b.footprint_sqm, storeys: b.storeys,
  })))
  const readings = overrideReadingWithPlacedOpenSpace(
    withBuildings, (openSpaces || []).map(o => o.footprint_sqm ?? 0).filter(a => a > 0),
  )

  await sb.from('scenario_readings').upsert(
    readings.map(r => ({ scenario_id: scenarioId, ...r })),
    { onConflict: 'scenario_id,reading_key' },
  )

  return readings
}