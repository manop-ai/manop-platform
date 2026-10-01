// lib/scenario-templates.ts
//
// When a scenario is first created, instead of a single undifferentiated
// auto-footprint, generate a small, sensible STARTER set of real
// building objects — arranged the way that development category
// typically actually is (a mixed-use scheme has a taller residential
// block plus a lower commercial block, not one box), split from the
// scenario's own coverage-derived total footprint. Every building
// this produces is a real, immediately editable scenario_elements
// row (element_type = 'building') — move it, resize it, duplicate
// it, delete it. This is the "automatic indicative massing" the
// engineering brief describes, made real rather than a single shape.
//
// Deliberately conservative: 1-3 buildings, simple rectangular
// footprints, a small real gap between them (never overlapping) —
// a genuine starting point to build on, not a finished design.

import { buildIndicativeFootprintPolygon, buildRectangleFootprintPolygon, translatePolygon, rotatePolygon } from './scenario-geometry'

export interface StarterBuilding {
  label: string
  polygon: GeoJSON.Polygon
  footprint_sqm: number
  storeys: number
}

export interface StarterOpenSpace {
  label: string
  polygon: GeoJSON.Polygon
  footprint_sqm: number
}

interface TemplateInput {
  category: string
  center: { lat: number; lng: number }
  totalFootprintSqm: number
  storeys: number
}

interface TemplateResult {
  buildings: StarterBuilding[]
  openSpaces: StarterOpenSpace[]
}

/**
 * Multifamily's starter arrangement — two slender bar wings meeting
 * at a corner around a shared courtyard, rather than one square
 * block. This is the difference between "an extrusion" and
 * "recognizable multifamily massing": the courtyard relationship is
 * immediately legible, and each wing is a real, independently
 * editable building.
 */
function multifamilyLShape(center: { lat: number; lng: number }, totalFootprintSqm: number, storeys: number): TemplateResult {
  const wingAFootprint = Math.round(totalFootprintSqm * 0.55)
  const wingBFootprint = Math.round(totalFootprintSqm * 0.45)

  // Wing A runs east-west (a "bar" ~1:3.2 width:length), wing B runs
  // north-south (rotated 90°), offset so their near corners meet and
  // the concave interior forms the courtyard.
  const wingA = buildRectangleFootprintPolygon(center, wingAFootprint, 1 / 3.2)
  const wingALengthM = Math.sqrt(wingAFootprint * 3.2)
  const wingAWidthM = wingALengthM / 3.2

  const wingBRaw = buildRectangleFootprintPolygon(center, wingBFootprint, 1 / 3.2)
  const wingB = rotatePolygon(wingBRaw, 90)
  const wingBLengthM = Math.sqrt(wingBFootprint * 3.2)
  const wingBWidthM = wingBLengthM / 3.2

  // Place wing A along the south edge, wing B along the west edge —
  // their corner overlap area is small and deliberate (reads as a
  // shared corner/lobby), the courtyard opens to the northeast.
  const placedA = translatePolygon(wingA, -wingAWidthM * 0.4, wingALengthM * 0.15)
  const placedB = translatePolygon(wingB, wingBLengthM * 0.15, -wingBWidthM * 0.4)

  const courtyardFootprint = Math.round(totalFootprintSqm * 0.5)
  const courtyard = buildIndicativeFootprintPolygon(center, courtyardFootprint)
  const courtyardPlaced = translatePolygon(courtyard, wingAWidthM * 0.5, wingBWidthM * 0.5)

  return {
    buildings: [
      { label: 'Building 001', polygon: placedA, footprint_sqm: wingAFootprint, storeys },
      { label: 'Building 002', polygon: placedB, footprint_sqm: wingBFootprint, storeys },
    ],
    openSpaces: [
      { label: 'Courtyard', polygon: courtyardPlaced, footprint_sqm: courtyardFootprint },
    ],
  }
}

/**
 * Split ratios and per-block storey adjustments for the categories
 * that stay as a simple side-by-side layout (not yet given their own
 * spatial grammar the way multifamily now has — townhouse's "three
 * blocks" is a real start, but a true attached-row arrangement with
 * individually legible units is the next honest step, not this one).
 */
function templateForCategory(category: string, totalStoreys: number): { splits: number[]; storeyFactors: number[] } {
  switch (category) {
    case 'mixed_use':
      return { splits: [0.7, 0.3], storeyFactors: [1, Math.max(1, Math.round(totalStoreys * 0.4))] }
    case 'townhouse':
      return { splits: [0.36, 0.34, 0.3], storeyFactors: [1, 1, 1] }
    case 'commercial':
    case 'single_family_residential':
    default:
      return { splits: [1], storeyFactors: [1] }
  }
}

export function generateStarterBuildings({ category, center, totalFootprintSqm, storeys }: TemplateInput): TemplateResult {
  if (category === 'multifamily_residential') {
    return multifamilyLShape(center, totalFootprintSqm, storeys)
  }

  const { splits, storeyFactors } = templateForCategory(category, storeys)

  // Lay blocks out side by side (east-west) with a small real gap
  // between them, each sized by its own share of the total footprint.
  const GAP_M = 6
  const results: StarterBuilding[] = []
  let cursorOffsetM = -((splits.length - 1) * GAP_M) / 2

  splits.forEach((share, i) => {
    const footprint = Math.max(20, Math.round(totalFootprintSqm * share))
    const polygon = buildIndicativeFootprintPolygon(center, footprint)
    const sideM = Math.sqrt(footprint)
    const placed = translatePolygon(polygon, 0, cursorOffsetM)
    cursorOffsetM += sideM / 2 + GAP_M + sideM / 2 // advance past this block + gap for the next

    results.push({
      label: `Building ${String(i + 1).padStart(3, '0')}`,
      polygon: placed,
      footprint_sqm: footprint,
      storeys: Math.max(1, storeyFactors[i] === 1 ? storeys : storeyFactors[i]),
    })
  })

  return { buildings: results, openSpaces: [] }
}