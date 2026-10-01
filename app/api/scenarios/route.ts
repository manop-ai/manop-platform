// app/api/scenarios/route.ts
//
// GET  /api/scenarios?site_id=...   — list scenarios for a site
// POST /api/scenarios               — create a scenario, run the
//                                      deterministic engine, persist
//                                      readings + the V1 massing element
//
// Open to run without login, matching Construction Appraisal and
// Quick Review's existing philosophy — Site Studio should be as easy
// to try as those already are.

import { NextRequest, NextResponse } from 'next/server'
import { computeScenarioReadings, computeMassing, overrideReadingsWithPlacedBuildings, overrideReadingWithPlacedOpenSpace, ScenarioParameters } from '../../../lib/scenario-engine'
import { generateStarterBuildings } from '../../../lib/scenario-templates'
import { DEVELOPMENT_CATEGORY_LABEL, DevelopmentCategory } from '../../../lib/development-presets'
import { sbFromRequest } from '../../../lib/supabase/route-client'

interface CreateScenarioBody {
  site_id: string
  preset_id?: string | null
  name?: string
  development_category: DevelopmentCategory
  coverage_pct?: number | null
  storeys?: number | null
  avg_unit_area_sqm?: number | null
  parking_ratio?: number | null
  open_space_pct?: number | null
  unit_mix?: { label: string; pct: number }[] | null
  has_unit_mix?: boolean
}

// Reading keys surfaced on the scenario manager cards. Each keeps its own
// value_status so the card can show FACT / DERIVED / ESTIMATE / UNKNOWN —
// summarising a scenario must never launder an estimate into a plain number.
const SUMMARY_READING_KEYS = ['indicative_gfa_sqm', 'indicative_unit_count', 'building_count', 'indicative_parking_count'] as const

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('site_id')
  if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })
  const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'

  const sb = sbFromRequest(req)
  let query = sb.from('development_scenarios').select('*').eq('site_id', siteId)
  if (!includeArchived) query = query.neq('status', 'archived')
  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const ids = (data || []).map(s => s.id)
  const summaries: Record<string, Record<string, { value: number | null; unit: string | null; value_status: string }>> = {}
  if (ids.length > 0) {
    const { data: readings } = await sb
      .from('scenario_readings')
      .select('scenario_id, reading_key, numeric_value, unit, value_status')
      .in('scenario_id', ids)
      .in('reading_key', [...SUMMARY_READING_KEYS])
    for (const r of readings || []) {
      (summaries[r.scenario_id] ||= {})[r.reading_key] = { value: r.numeric_value, unit: r.unit, value_status: r.value_status }
    }
  }
  return NextResponse.json({ scenarios: (data || []).map(s => ({ ...s, summary: summaries[s.id] || {} })) })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateScenarioBody

  if (!body.site_id || !body.development_category) {
    return NextResponse.json({ error: 'site_id and development_category are required.' }, { status: 400 })
  }

  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()

  // Site area is the one FACT input this engine ever uses — sourced
  // directly from the site record, never guessed. Prefer the
  // confirmed survey/area_sqm value; fall back to the PostGIS-derived
  // boundary_area_sqm when a polygon exists but no separate area was
  // recorded. Neither present → the engine correctly reports
  // site_area_sqm as unknown downstream.
  const { data: site, error: siteError } = await sb
    .from('sites')
    .select('lat, lng, area_sqm, boundary_area_sqm, exploratory_boundary_area_sqm')
    .eq('id', body.site_id)
    .single()

  if (siteError || !site) {
    return NextResponse.json({ error: 'Site not found.' }, { status: 404 })
  }

  const hasUnitMix = body.has_unit_mix ?? true
  const params: ScenarioParameters = {
    site_area_sqm: site.area_sqm ?? site.boundary_area_sqm ?? site.exploratory_boundary_area_sqm ?? null,
    site_area_status: (site.area_sqm ?? site.boundary_area_sqm) != null ? 'fact' : 'estimate',
    coverage_pct: body.coverage_pct ?? null,
    storeys: body.storeys ?? null,
    avg_unit_area_sqm: body.avg_unit_area_sqm ?? null,
    parking_ratio: body.parking_ratio ?? null,
    open_space_pct: body.open_space_pct ?? null,
    unit_mix: body.unit_mix ?? null,
    has_unit_mix: hasUnitMix,
  }

  const readings = computeScenarioReadings(params)
  const massing = computeMassing(params)

  const { data: scenario, error: scenarioError } = await sb
    .from('development_scenarios')
    .insert({
      site_id: body.site_id,
      preset_id: body.preset_id ?? null,
      name: body.name || `${DEVELOPMENT_CATEGORY_LABEL[body.development_category]} Scenario`,
      development_category: body.development_category,
      coverage_pct: body.coverage_pct ?? null,
      storeys: body.storeys ?? null,
      avg_unit_area_sqm: body.avg_unit_area_sqm ?? null,
      parking_ratio: body.parking_ratio ?? null,
      open_space_pct: body.open_space_pct ?? null,
      unit_mix: body.unit_mix ?? null,
      created_by_user_id: user?.id ?? null,
    })
    .select()
    .single()

  if (scenarioError || !scenario) {
    return NextResponse.json({ error: scenarioError?.message || 'Could not create scenario.' }, { status: 500 })
  }

  const readingRows = readings.map(r => ({ scenario_id: scenario.id, ...r }))
  const { error: readingsError } = await sb.from('scenario_readings').insert(readingRows)
  if (readingsError) {
    return NextResponse.json(
      { scenario, warning: `Scenario created, but readings failed to save: ${readingsError.message}` },
      { status: 207 },
    )
  }

  // Starter massing — a real, category-specific set of editable
  // buildings (Mixed Use gets a residential block + a lower
  // commercial block, Townhouse gets three smaller blocks, etc.),
  // not one undifferentiated auto-footprint. Every one of these is
  // an ordinary 'building' element from the moment it's created —
  // movable, resizable, rotatable, duplicable, deletable — exactly
  // like a hand-drawn one. Only created when there's a real centre
  // point and a real footprint/storeys to build from; otherwise the
  // scenario is left with no starter geometry rather than a guess.
  let finalReadings = readings
  if (site.lat != null && site.lng != null && massing.footprint_sqm != null && massing.storeys != null) {
    const starters = generateStarterBuildings({
      category: body.development_category,
      center: { lat: site.lat, lng: site.lng },
      totalFootprintSqm: massing.footprint_sqm,
      storeys: massing.storeys,
    })

    for (const b of starters.buildings) {
      await sb.rpc('create_scenario_building', {
        p_scenario_id: scenario.id, p_geojson: b.polygon, p_label: b.label,
        p_footprint_sqm: b.footprint_sqm, p_storeys: b.storeys,
      })
    }
    // The courtyard (or any other starter open space a template
    // generates) is a real 'open_space' element from the moment the
    // scenario is created — not just implied by the gap between
    // buildings. This is what lets it render as landscaped ground
    // with trees rather than empty site around a box.
    for (const o of starters.openSpaces) {
      await sb.rpc('create_scenario_building', {
        p_scenario_id: scenario.id, p_geojson: o.polygon, p_label: o.label,
        p_footprint_sqm: o.footprint_sqm, p_storeys: 0, p_element_type: 'open_space',
      })
    }

    finalReadings = overrideReadingsWithPlacedBuildings(readings, starters.buildings.map(b => ({ footprint_sqm: b.footprint_sqm, storeys: b.storeys })))
    if (starters.openSpaces.length > 0) {
      finalReadings = overrideReadingWithPlacedOpenSpace(finalReadings, starters.openSpaces.map(o => o.footprint_sqm))
    }
    await sb.from('scenario_readings').upsert(
      finalReadings.map(r => ({ scenario_id: scenario.id, ...r })),
      { onConflict: 'scenario_id,reading_key' },
    )
  } else {
    // No usable centre point (point-only site with no coordinates at
    // all, or the coverage formula couldn't compute a footprint yet)
    // — fall back to the single auto-mass preview, same as before,
    // so Draw Site / a scenario without full parameters still shows
    // something once those are filled in and recalculated.
    await sb.from('scenario_elements').insert({
      scenario_id: scenario.id, element_type: 'building_mass', label: 'Building Mass',
      footprint_sqm: massing.footprint_sqm, storeys: massing.storeys, height_m: massing.height_m,
      value_status: massing.value_status,
    })
  }

  return NextResponse.json({ scenario, readings: finalReadings }, { status: 201 })
}