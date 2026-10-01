// lib/scenario-engine.ts
//
// The deterministic Development Scenario engine. Pure functions —
// no I/O — same shape as lib/construction-appraisal.ts, so the API
// route can call this and store the result, and any future consumer
// (batch recompute, a "what changed" diff) reuses it without
// duplicating the math.
//
// THE CENTRAL RULE OF THIS FILE: every output is tagged with a
// value_status. The engine NEVER upgrades an input it wasn't given
// into a fact, and it NEVER invents a planning rule (FAR, setback,
// height limit, density cap, parking requirement) that Site
// Intelligence hasn't actually established for the site. If a
// required input is missing, the corresponding output's status is
// 'unknown' and its numeric_value is null — never a guessed number,
// never silently omitted from the reading set (an omitted reading
// looks like "nothing to say"; an explicit unknown reading looks
// like "we checked, and this isn't known yet," which is the correct
// message).
//
// AI (or a human typing into the parameter form) may SUPPLY these
// parameters. Nothing in this file, and nothing that calls it,
// should let an LLM compute the numbers itself — see the Site Studio
// engineering brief §12/§41: AI interprets intent into structured
// parameters; this file is the only thing allowed to turn those
// parameters into geometry/quantities.

export type ValueStatus =
  | 'fact' | 'assumption' | 'derived' | 'estimate' | 'professional_opinion' | 'unknown'

export interface UnitMixRow {
  label: string
  pct: number
}

export interface ScenarioParameters {
  // FACT, when available — sourced from the site record, never
  // guessed here. Pass null when Site Intelligence doesn't have it.
  // FACT when sourced from a confirmed site record (area_sqm /
  // boundary_area_sqm). When the caller only has an exploratory
  // (user-drawn) shape, pass site_area_status: 'estimate' instead —
  // the engine will tag the reading accordingly rather than always
  // defaulting to 'fact'. See Part 5 of the Draw Site directive:
  // drawn geometry must never be indistinguishable from evidence.
  site_area_sqm: number | null
  site_area_status?: 'fact' | 'estimate'

  // Everything below is a SCENARIO ASSUMPTION unless the caller has
  // separately confirmed it against Site Intelligence evidence and
  // relabels it before display — this engine has no way to know that
  // and always treats these as assumptions in its own output.
  coverage_pct: number | null
  storeys: number | null
  avg_unit_area_sqm: number | null
  parking_ratio: number | null       // spaces per unit
  open_space_pct: number | null
  unit_mix: UnitMixRow[] | null
  has_unit_mix: boolean
}

export interface ScenarioReading {
  reading_key: string
  label: string
  numeric_value: number | null
  unit: string | null
  value_status: ValueStatus
  derivation_note: string | null
  source: string | null
}

const FLOOR_TO_FLOOR_M = 3.2   // illustrative default, not a building code figure — see note below

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function unknown(reading_key: string, label: string, unit: string | null): ScenarioReading {
  return { reading_key, label, numeric_value: null, unit, value_status: 'unknown', derivation_note: null, source: null }
}

/**
 * Computes the full set of scenario readings from structured
 * parameters. Every reading is present in the returned array even
 * when its value is unknown — an intentionally "complete but honest"
 * output, per the brief's "NOT_CALCULATED is better than an invented
 * number" rule.
 */
export function computeScenarioReadings(params: ScenarioParameters): ScenarioReading[] {
  const readings: ScenarioReading[] = []

  // ── Site area — FACT from a confirmed site record, ESTIMATE when
  // it came from an exploratory (user-drawn) shape instead ─────────
  if (params.site_area_sqm != null) {
    const status = params.site_area_status ?? 'fact'
    readings.push({
      reading_key: 'site_area_sqm', label: 'Site Area', numeric_value: params.site_area_sqm,
      unit: 'sqm', value_status: status,
      derivation_note: status === 'estimate' ? 'From an exploratory, user-drawn boundary — not surveyed' : null,
      source: status === 'estimate' ? 'User-drawn exploratory geometry' : 'Site record',
    })
  } else {
    readings.push(unknown('site_area_sqm', 'Site Area', 'sqm'))
  }

  // ── Indicative footprint — DERIVED only if area + coverage known ─
  let footprint: number | null = null
  if (params.site_area_sqm != null && params.coverage_pct != null) {
    footprint = round2(params.site_area_sqm * (params.coverage_pct / 100))
    readings.push({
      reading_key: 'indicative_footprint_sqm', label: 'Indicative Footprint', numeric_value: footprint,
      unit: 'sqm', value_status: 'derived',
      derivation_note: `${params.site_area_sqm.toLocaleString()} sqm × ${params.coverage_pct}% coverage`,
      source: null,
    })
  } else {
    readings.push(unknown('indicative_footprint_sqm', 'Indicative Footprint', 'sqm'))
  }

  // ── Indicative GFA — DERIVED only if footprint + storeys known ──
  let gfa: number | null = null
  if (footprint != null && params.storeys != null) {
    gfa = round2(footprint * params.storeys)
    readings.push({
      reading_key: 'indicative_gfa_sqm', label: 'Indicative GFA', numeric_value: gfa,
      unit: 'sqm', value_status: 'derived',
      derivation_note: `${footprint.toLocaleString()} sqm footprint × ${params.storeys} storeys`,
      source: null,
    })
  } else {
    readings.push(unknown('indicative_gfa_sqm', 'Indicative GFA', 'sqm'))
  }

  // ── Indicative unit count — only for presets with a unit mix ────
  let unitCount: number | null = null
  if (params.has_unit_mix) {
    if (gfa != null && params.avg_unit_area_sqm) {
      unitCount = Math.floor(gfa / params.avg_unit_area_sqm)
      readings.push({
        reading_key: 'indicative_unit_count', label: 'Indicative Unit Count', numeric_value: unitCount,
        unit: 'units', value_status: 'derived',
        derivation_note: `${gfa.toLocaleString()} sqm ÷ ${params.avg_unit_area_sqm} sqm average unit`,
        source: null,
      })
    } else {
      readings.push(unknown('indicative_unit_count', 'Indicative Unit Count', 'units'))
    }
  }

  // ── Indicative parking — only where unit count is meaningful ────
  if (params.has_unit_mix) {
    if (unitCount != null && params.parking_ratio != null) {
      const parking = Math.ceil(unitCount * params.parking_ratio)
      readings.push({
        reading_key: 'indicative_parking_count', label: 'Indicative Parking', numeric_value: parking,
        unit: 'spaces', value_status: 'derived',
        derivation_note: `${unitCount} units × ${params.parking_ratio} spaces/unit`,
        source: null,
      })
    } else {
      readings.push(unknown('indicative_parking_count', 'Indicative Parking', 'spaces'))
    }
  }

  // ── Indicative open space — DERIVED if area + pct known ─────────
  if (params.site_area_sqm != null && params.open_space_pct != null) {
    const openSpace = round2(params.site_area_sqm * (params.open_space_pct / 100))
    readings.push({
      reading_key: 'indicative_open_space_sqm', label: 'Indicative Open Space', numeric_value: openSpace,
      unit: 'sqm', value_status: 'derived',
      derivation_note: `${params.site_area_sqm.toLocaleString()} sqm × ${params.open_space_pct}%`,
      source: null,
    })
  } else {
    readings.push(unknown('indicative_open_space_sqm', 'Indicative Open Space', 'sqm'))
  }

  // ── Unit mix breakdown — per-type indicative counts ─────────────
  if (params.has_unit_mix && params.unit_mix && unitCount != null) {
    for (const row of params.unit_mix) {
      const count = Math.round(unitCount * (row.pct / 100))
      readings.push({
        reading_key: `unit_mix_${slug(row.label)}`, label: `${row.label} Units`, numeric_value: count,
        unit: 'units', value_status: 'derived',
        derivation_note: `${unitCount} total units × ${row.pct}%`,
        source: null,
      })
    }
  }

  return readings
}

/**
 * Massing metadata for a scenario's single V1 building-mass element.
 * FLOOR_TO_FLOOR_M is an illustrative default, exactly like the
 * viability thresholds in construction-appraisal.ts — no source
 * document specifies a universal floor height, so this is a
 * reasonable round number, not a recovered building-code figure.
 * height is 'estimate', not 'derived', to keep that distinction
 * visible: it depends on an assumption this file supplies, not one
 * the user or Site Intelligence provided.
 */
export function computeMassing(params: ScenarioParameters): {
  footprint_sqm: number | null
  storeys: number | null
  height_m: number | null
  value_status: ValueStatus
} {
  const readings = computeScenarioReadings(params)
  const footprintReading = readings.find(r => r.reading_key === 'indicative_footprint_sqm')
  const footprint = footprintReading?.numeric_value ?? null

  if (footprint == null || params.storeys == null) {
    return { footprint_sqm: footprint, storeys: params.storeys, height_m: null, value_status: 'unknown' }
  }

  return {
    footprint_sqm: footprint,
    storeys: params.storeys,
    height_m: round2(params.storeys * FLOOR_TO_FLOOR_M),
    value_status: 'estimate',
  }
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
}

export interface PlacedBuilding {
  footprint_sqm: number | null
  storeys: number | null
}

/**
 * Once a scenario has real placed buildings (Phase D — Draw Building,
 * multiple scenario_elements rows), the readings should reflect what
 * was actually placed, not the single coverage-derived guess.
 * Footprint/GFA become the SUM across buildings, tagged 'derived'
 * with a note naming the real source, replacing (never silently
 * alongside) the coverage-formula readings. Called AFTER
 * computeScenarioReadings(); returns a new array rather than
 * mutating, same purity contract as every other function here.
 */
export function overrideReadingsWithPlacedBuildings(
  readings: ScenarioReading[], buildings: PlacedBuilding[],
): ScenarioReading[] {
  if (buildings.length === 0) return readings

  const totalFootprint = buildings.reduce((sum, b) => sum + (b.footprint_sqm ?? 0), 0)
  const totalGfa = buildings.reduce((sum, b) => sum + (b.footprint_sqm ?? 0) * (b.storeys ?? 1), 0)
  const maxStoreys = buildings.reduce((max, b) => Math.max(max, b.storeys ?? 0), 0)

  const next = readings.filter(r =>
    r.reading_key !== 'indicative_footprint_sqm' && r.reading_key !== 'indicative_gfa_sqm',
  )

  next.push({
    reading_key: 'indicative_footprint_sqm', label: 'Indicative Footprint', numeric_value: round2(totalFootprint),
    unit: 'sqm', value_status: 'derived',
    derivation_note: `Sum of ${buildings.length} placed building${buildings.length === 1 ? '' : 's'}`, source: null,
  })
  next.push({
    reading_key: 'indicative_gfa_sqm', label: 'Indicative GFA', numeric_value: round2(totalGfa),
    unit: 'sqm', value_status: 'derived',
    derivation_note: `Sum of each building's footprint × its own storeys`, source: null,
  })
  next.push({
    reading_key: 'building_count', label: 'Buildings Placed', numeric_value: buildings.length,
    unit: 'buildings', value_status: 'fact', derivation_note: null, source: 'Scenario spatial objects',
  })
  next.push({
    reading_key: 'tallest_building_storeys', label: 'Tallest Building', numeric_value: maxStoreys || null,
    unit: 'storeys', value_status: maxStoreys ? 'fact' : 'unknown', derivation_note: null, source: 'Scenario spatial objects',
  })

  return next
}

/**
 * Same idea as overrideReadingsWithPlacedBuildings, for real
 * open-space ("green land") objects instead of the open_space_pct
 * formula. Kept as a separate function rather than folded into the
 * one above — buildings and open space are placed independently and
 * a scenario may have one without the other.
 */
export function overrideReadingWithPlacedOpenSpace(
  readings: ScenarioReading[], openSpaceAreasSqm: number[],
): ScenarioReading[] {
  if (openSpaceAreasSqm.length === 0) return readings
  const total = openSpaceAreasSqm.reduce((sum, a) => sum + a, 0)
  const next = readings.filter(r => r.reading_key !== 'indicative_open_space_sqm')
  next.push({
    reading_key: 'indicative_open_space_sqm', label: 'Indicative Open Space', numeric_value: round2(total),
    unit: 'sqm', value_status: 'derived',
    derivation_note: `Sum of ${openSpaceAreasSqm.length} placed open space area${openSpaceAreasSqm.length === 1 ? '' : 's'}`,
    source: null,
  })
  return next
}