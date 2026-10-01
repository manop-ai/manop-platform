// lib/survey-geometry.ts
//
// Turns a beacon-by-beacon bearing/distance description (the classic
// Nigerian survey-plan format: "N61°12'E 48.90m" between consecutive
// beacons) into a LOCAL, unplaced polygon — plus a sanity check of
// its area against the plan's own stated area.
//
// WHY THIS STOPS SHORT OF A REAL MAP PLACEMENT, ON PURPOSE:
// Bearings and distances alone only describe the *shape* of the
// parcel in a local plane. Placing that shape at a real position on
// Earth (i.e. producing WGS84 lat/lng for every beacon, and therefore
// a real sites.boundary polygon) requires two things this kind of
// document does not supply: which direction is true north relative
// to the plan's grid, and one confirmed real-world anchor coordinate.
// A document whose own coordinate_reference_system is "UNSTATED" (as
// with the MANOP sandbox test survey) cannot supply either. Computing
// a placement anyway would be exactly the "invent a coordinate
// transform" failure mode the crs_status column exists to prevent.
//
// So: this file computes the shape confidently (pure trigonometry,
// no invented facts) and stops there. The result is good for two
// honest things — an unplaced schematic preview, and a consistency
// check against the plan's stated area — never for a real map
// polygon.

export interface BeaconEdge {
  fromLabel: string
  toLabel: string
  bearing: string     // as printed on the plan, e.g. "N61°12'E"
  distanceM: number
}

export interface LocalPoint {
  label: string
  x: number   // local plane, metres, arbitrary origin at the first beacon
  y: number
}

export interface SurveyShapeResult {
  points: LocalPoint[]
  computedAreaSqm: number
  closureErrorM: number          // distance between where the walk ends and where it started — 0 for a perfectly closed traverse
  statedAreaSqm: number | null
  areaDiscrepancyPct: number | null
}

/**
 * Parses a quadrant bearing like "N61°12'E" or "S66°40'W" into a
 * compass azimuth in degrees (0-360, clockwise from north).
 */
export function parseQuadrantBearing(bearing: string): number {
  const match = bearing.replace(/\s+/g, '').match(/^([NS])(\d+)°(\d+)'([EW])$/)
  if (!match) throw new Error(`Unrecognised bearing format: "${bearing}"`)
  const [, ns, degStr, minStr, ew] = match
  const angle = Number(degStr) + Number(minStr) / 60

  if (ns === 'N' && ew === 'E') return angle
  if (ns === 'S' && ew === 'E') return 180 - angle
  if (ns === 'S' && ew === 'W') return 180 + angle
  return 360 - angle // N...W
}

/**
 * Walks a closed traverse of beacon-to-beacon edges into local (x, y)
 * points, and cross-checks the result against the plan's own stated
 * area. Throws only on a genuinely malformed bearing string — never
 * silently drops an edge.
 */
export function buildLocalSurveyShape(edges: BeaconEdge[], statedAreaSqm: number | null): SurveyShapeResult {
  if (edges.length < 3) throw new Error('A survey shape needs at least 3 edges.')

  const points: LocalPoint[] = [{ label: edges[0].fromLabel, x: 0, y: 0 }]
  let x = 0, y = 0

  for (const edge of edges) {
    const azimuthRad = (parseQuadrantBearing(edge.bearing) * Math.PI) / 180
    x += edge.distanceM * Math.sin(azimuthRad)
    y += edge.distanceM * Math.cos(azimuthRad)
    points.push({ label: edge.toLabel, x, y })
  }

  const closureErrorM = Math.sqrt(x * x + y * y)

  // Shoelace formula for the polygon's own computed area, using every
  // point except the closing duplicate of the first beacon.
  const ring = points.slice(0, -1)
  let twiceArea = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    twiceArea += p.x * q.y - q.x * p.y
  }
  const computedAreaSqm = Math.abs(twiceArea) / 2

  const areaDiscrepancyPct = statedAreaSqm
    ? Math.round((Math.abs(computedAreaSqm - statedAreaSqm) / statedAreaSqm) * 1000) / 10
    : null

  return { points, computedAreaSqm: Math.round(computedAreaSqm * 100) / 100, closureErrorM: Math.round(closureErrorM * 100) / 100, statedAreaSqm, areaDiscrepancyPct }
}