// lib/building-forms.ts
//
// The building-form grammar from the Site Studio composable-scenario
// redesign: BAR / L / U / COURTYARD as TOGGLEABLE forms, not one-shot
// generators. A building's "form" is its footprint shape — nothing
// more — so toggling form needs no new database column and no schema
// change: it's a pure geometry transform over the scenario's current
// total building footprint (and storeys), producing a new set of
// StarterBuilding/StarterOpenSpace shapes that the caller replaces
// the current building elements with via the EXISTING create/delete
// building endpoints (POST /api/scenarios/[id]/buildings,
// DELETE .../buildings/[elementId]). See lib/scenario-composition.ts
// for that replace operation.
//
// Deliberately four forms this pass, not the full BAR/L/U/COURTYARD/
// WRAP/PODIUM+TOWER/MULTI-BUILDING list from the brief:
//   - PODIUM+TOWER is already a real, distinct 3D treatment today —
//     it's driven by development CATEGORY (mixed_use) in
//     massing-geometry.ts, not by footprint shape, so it isn't a gap
//     this file needs to fill.
//   - MULTI-BUILDING is already possible today — Draw Building /
//     Duplicate already produce more than one independent building.
//   - WRAP is deliberately deferred rather than shipped as a
//     cosmetic copy of COURTYARD with no real geometric difference —
//     a genuine wrap (near-continuous perimeter block with a service/
//     access break) is a real next increment, not this one.
//
// All four functions here take the SAME total footprint and storeys
// so that toggling form is honestly "reshape what you have", not
// "generate a different-sized building" — GFA before and after a
// toggle should match (subject to the usual rounding).

import { buildRectangleFootprintPolygon, buildIndicativeFootprintPolygon, translatePolygon, rotatePolygon } from './scenario-geometry'

export type BuildingForm = 'bar' | 'l' | 'u' | 'courtyard'

export const BUILDING_FORM_LABEL: Record<BuildingForm, string> = {
  bar: 'Bar',
  l: 'L-Shape',
  u: 'U-Shape',
  courtyard: 'Courtyard',
}

export interface FormBuilding {
  label: string
  polygon: GeoJSON.Polygon
  footprint_sqm: number
  storeys: number
}
export interface FormOpenSpace {
  label: string
  polygon: GeoJSON.Polygon
  footprint_sqm: number
}
export interface FormResult {
  form: BuildingForm
  buildings: FormBuilding[]
  openSpaces: FormOpenSpace[]
}

interface FormInput {
  center: { lat: number; lng: number }
  totalFootprintSqm: number
  storeys: number
}

const WING_RATIO = 1 / 3.2 // width:length for a single bar wing — matches the existing multifamily starter

function bar({ center, totalFootprintSqm, storeys }: FormInput): FormResult {
  const polygon = buildRectangleFootprintPolygon(center, totalFootprintSqm, WING_RATIO)
  return {
    form: 'bar',
    buildings: [{ label: 'Building 001', polygon, footprint_sqm: Math.round(totalFootprintSqm), storeys }],
    openSpaces: [],
  }
}

function lShape({ center, totalFootprintSqm, storeys }: FormInput): FormResult {
  const wingAFootprint = Math.round(totalFootprintSqm * 0.55)
  const wingBFootprint = Math.round(totalFootprintSqm * 0.45)

  const wingA = buildRectangleFootprintPolygon(center, wingAFootprint, WING_RATIO)
  const wingALengthM = Math.sqrt(wingAFootprint / WING_RATIO)
  const wingAWidthM = wingALengthM * WING_RATIO

  const wingBRaw = buildRectangleFootprintPolygon(center, wingBFootprint, WING_RATIO)
  const wingB = rotatePolygon(wingBRaw, 90)
  const wingBLengthM = Math.sqrt(wingBFootprint / WING_RATIO)
  const wingBWidthM = wingBLengthM * WING_RATIO

  const placedA = translatePolygon(wingA, -wingAWidthM * 0.4, wingALengthM * 0.15)
  const placedB = translatePolygon(wingB, wingBLengthM * 0.15, -wingBWidthM * 0.4)

  const courtyardFootprint = Math.round(totalFootprintSqm * 0.5)
  const courtyard = translatePolygon(
    buildIndicativeFootprintPolygon(center, courtyardFootprint),
    wingAWidthM * 0.5, wingBWidthM * 0.5,
  )

  return {
    form: 'l',
    buildings: [
      { label: 'Building 001', polygon: placedA, footprint_sqm: wingAFootprint, storeys },
      { label: 'Building 002', polygon: placedB, footprint_sqm: wingBFootprint, storeys },
    ],
    openSpaces: [{ label: 'Courtyard', polygon: courtyard, footprint_sqm: courtyardFootprint }],
  }
}

/** Three wings around three sides of a courtyard — the L-shape's two
 * wings plus a third bar closing one open side, so the courtyard
 * reads as enclosed on three sides rather than a corner. */
function uShape({ center, totalFootprintSqm, storeys }: FormInput): FormResult {
  const each = Math.round(totalFootprintSqm / 3)

  const wingA = buildRectangleFootprintPolygon(center, each, WING_RATIO) // south, runs east-west
  const wingALen = Math.sqrt(each / WING_RATIO), wingAWid = wingALen * WING_RATIO

  const wingBRaw = buildRectangleFootprintPolygon(center, each, WING_RATIO)
  const wingB = rotatePolygon(wingBRaw, 90) // west, runs north-south
  const wingBLen = Math.sqrt(each / WING_RATIO), wingBWid = wingBLen * WING_RATIO

  const wingCRaw = buildRectangleFootprintPolygon(center, each, WING_RATIO)
  const wingC = rotatePolygon(wingCRaw, 90) // east, runs north-south, mirrors B
  const wingCLen = wingBLen, wingCWid = wingBWid

  const courtyardSideM = wingALen * 0.6
  const placedA = translatePolygon(wingA, -wingALen * 0.35, 0)
  const placedB = translatePolygon(wingB, wingBLen * 0.15, -courtyardSideM * 0.5 - wingBWid * 0.5)
  const placedC = translatePolygon(wingC, wingCLen * 0.15, courtyardSideM * 0.5 + wingCWid * 0.5)

  const courtyardFootprint = Math.round(courtyardSideM * courtyardSideM)
  const courtyard = translatePolygon(
    buildIndicativeFootprintPolygon(center, courtyardFootprint),
    wingALen * 0.15, 0,
  )

  return {
    form: 'u',
    buildings: [
      { label: 'Building 001', polygon: placedA, footprint_sqm: each, storeys },
      { label: 'Building 002', polygon: placedB, footprint_sqm: each, storeys },
      { label: 'Building 003', polygon: placedC, footprint_sqm: each, storeys },
    ],
    openSpaces: [{ label: 'Courtyard', polygon: courtyard, footprint_sqm: courtyardFootprint }],
  }
}

/** Four wings fully enclosing a central courtyard — the U-shape's
 * three wings plus a fourth closing the last open side. */
function courtyardShape({ center, totalFootprintSqm, storeys }: FormInput): FormResult {
  const each = Math.round(totalFootprintSqm / 4)

  const wingN = buildRectangleFootprintPolygon(center, each, WING_RATIO)
  const wingNLen = Math.sqrt(each / WING_RATIO), wingNWid = wingNLen * WING_RATIO
  const wingS = wingN
  const wingE = rotatePolygon(buildRectangleFootprintPolygon(center, each, WING_RATIO), 90)
  const wingELen = Math.sqrt(each / WING_RATIO), wingEWid = wingELen * WING_RATIO
  const wingW = wingE

  const courtyardSideM = wingNLen * 0.7
  const halfSpan = courtyardSideM * 0.5

  const placedN = translatePolygon(wingN, halfSpan + wingNWid * 0.5, 0)
  const placedS = translatePolygon(wingS, -(halfSpan + wingNWid * 0.5), 0)
  const placedE = translatePolygon(wingE, 0, halfSpan + wingEWid * 0.5)
  const placedW = translatePolygon(wingW, 0, -(halfSpan + wingEWid * 0.5))

  const courtyardFootprint = Math.round(courtyardSideM * courtyardSideM)
  const courtyard = buildIndicativeFootprintPolygon(center, courtyardFootprint)

  return {
    form: 'courtyard',
    buildings: [
      { label: 'Building 001', polygon: placedN, footprint_sqm: each, storeys },
      { label: 'Building 002', polygon: placedS, footprint_sqm: each, storeys },
      { label: 'Building 003', polygon: placedE, footprint_sqm: each, storeys },
      { label: 'Building 004', polygon: placedW, footprint_sqm: each, storeys },
    ],
    openSpaces: [{ label: 'Courtyard', polygon: courtyard, footprint_sqm: courtyardFootprint }],
  }
}

const GENERATORS: Record<BuildingForm, (input: FormInput) => FormResult> = {
  bar, l: lShape, u: uShape, courtyard: courtyardShape,
}

/** The single entry point: given a form and the scenario's current
 * total footprint/storeys, produce the new building/open-space
 * layout. Callers are responsible for actually replacing the
 * scenario's elements with this result (delete the old, create the
 * new) — this function only computes geometry, exactly like
 * scenario-templates.ts's generateStarterBuildings, which this
 * supersedes for anything reachable through the form toggle. */
export function generateFormLayout(form: BuildingForm, input: FormInput): FormResult {
  return GENERATORS[form](input)
}
