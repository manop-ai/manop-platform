// lib/development-presets.ts
//
// Development Presets — reusable starting configurations for a
// Development Scenario. A preset is never a planning approval and
// never becomes a hard-coded project; every value it supplies to a
// scenario is a SCENARIO ASSUMPTION the moment it's applied, not a
// fact about what any given site can support.
//
// Data-driven per the implementation brief (§38): presets live in
// the `development_presets` table (see sql/2026_site_studio_phase1.sql),
// not hard-coded into UI components. This file only holds the
// TypeScript shape and small display helpers — the same split
// lib/site-intelligence.ts already uses for its own DB-backed enums.

export type DevelopmentCategory =
  | 'multifamily_residential'
  | 'single_family_residential'
  | 'townhouse'
  | 'mixed_use'
  | 'commercial'

export interface UnitMixRow {
  label: string
  pct: number   // percentage of total units, rows should sum to 100
}

export interface DevelopmentPreset {
  id: string
  reference: string | null
  name: string
  development_category: DevelopmentCategory
  description: string | null
  default_coverage_pct: number | null
  default_storeys: number | null
  default_avg_unit_area_sqm: number | null
  default_parking_ratio: number | null
  default_open_space_pct: number | null
  default_unit_mix: UnitMixRow[] | null
  has_unit_mix: boolean
  active: boolean
}

export const DEVELOPMENT_CATEGORY_LABEL: Record<DevelopmentCategory, string> = {
  multifamily_residential: 'Multifamily Residential',
  single_family_residential: 'Single-Family Residential',
  townhouse: 'Townhouse',
  mixed_use: 'Mixed Use',
  commercial: 'Commercial',
}

// Turns a preset's defaults into the starting parameters for a new
// scenario. Every one of these values is a SCENARIO ASSUMPTION from
// the moment it lands on a scenario — this function does not, and
// must not, consult Site Intelligence evidence. If a caller has an
// evidence-backed value for a given site, it should override the
// relevant field itself, after this call, and tag it accordingly.
export function presetToScenarioDefaults(preset: DevelopmentPreset) {
  return {
    development_category: preset.development_category,
    coverage_pct: preset.default_coverage_pct,
    storeys: preset.default_storeys,
    avg_unit_area_sqm: preset.default_avg_unit_area_sqm,
    parking_ratio: preset.default_parking_ratio,
    open_space_pct: preset.default_open_space_pct,
    unit_mix: preset.default_unit_mix,
  }
}