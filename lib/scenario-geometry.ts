// lib/scenario-geometry.ts
//
// Turns a scenario's numeric footprint (from scenario-engine.ts) into
// a placeable GeoJSON polygon for the map, and a Mapbox fill-extrusion
// height for the simple massing view. Kept separate from
// scenario-engine.ts on purpose: that file is the numeric source of
// truth; this file is presentation geometry derived from it, and is
// allowed to make a placement choice the numeric engine never should.
//
// IMPORTANT DISTINCTION FROM SiteBoundaryMap's OWN RULE:
// SiteBoundaryMap never fabricates a SITE's boundary — a site with no
// confirmed polygon shows "Coordinates unavailable" / a bare point,
// never a manufactured parcel. That rule is about the site's own
// surveyed geometry, which this file does not touch.
//
// A scenario's indicative footprint is different in kind: the whole
// point of Site Studio is to show what an assumed building footprint
// COULD look like at a given size, centred on the site. It is
// explicitly labelled "Indicative Footprint" everywhere it renders,
// exactly as the engineering brief expects (§17, §25) — a generated
// shape used to communicate an assumption, not a claim about
// surveyed reality.
//
// No real placement algorithm exists yet (setbacks, actual building
// orientation, multiple massing elements) — this generates a single
// centred square as the simplest honest shape for a given area. This
// is exactly the seam Phase 9 (real 3D massing) will replace without
// touching the numeric engine or the scenario_elements schema.

const METERS_PER_DEGREE_LAT = 111_320

/** — the Draw
 * Site and Measure tools. Deliberately separate from
 * buildIndicativeFootprintPolygon above: that function GENERATES a
 * shape from a number; these two functions go the other way,
 * measuring a shape the user actually drew. Same equirectangular
 * approximation (fine at parcel scale, ~tens to low hundreds of
 * metres) — not survey-grade, which is exactly why drawn geometry is
 * always labelled "exploratory," never "confirmed."
 */
export function metersPerDegreeLng(atLat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180)
}

export function computeDrawnPolygonAreaSqm(points: { lat: number; lng: number }[]): number {
  if (points.length < 3) return 0
  const lat0 = points[0].lat
  const mLng = metersPerDegreeLng(lat0)
  const local = points.map(p => ({
    x: (p.lng - points[0].lng) * mLng,
    y: (p.lat - points[0].lat) * METERS_PER_DEGREE_LAT,
  }))
  let twiceArea = 0
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length]
    twiceArea += a.x * b.y - b.x * a.y
  }
  return Math.round((Math.abs(twiceArea) / 2) * 100) / 100
}

export function computeDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const mLng = metersPerDegreeLng((a.lat + b.lat) / 2)
  const dx = (b.lng - a.lng) * mLng
  const dy = (b.lat - a.lat) * METERS_PER_DEGREE_LAT
  return Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10
}

/**
 * Centre point for placing the indicative footprint: the centroid of
 * a confirmed boundary polygon if one exists, otherwise the site's
 * lat/lng point. Returns null if neither is available (a scenario on
 * a site with no coordinates at all cannot be placed — the caller
 * should render "Site location unavailable" rather than guess one).
 */
export function resolveSiteCenter(
  lat: number | null,
  lng: number | null,
  boundary: GeoJSON.Polygon | null,
): { lat: number; lng: number } | null {
  if (boundary) {
    const ring = boundary.coordinates[0]
    if (ring && ring.length > 0) {
      const sum = ring.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0])
      return { lng: sum[0] / ring.length, lat: sum[1] / ring.length }
    }
  }
  if (lat != null && lng != null) return { lat, lng }
  return null
}

/**
 * Builds a simple square GeoJSON polygon of the given area (sqm),
 * centred on (lat, lng). Rotation is fixed at 0deg — orientation is
 * explicitly out of scope until scenario_elements.orientation_deg is
 * actually populated by a real placement step.
 */
export function buildIndicativeFootprintPolygon(
  center: { lat: number; lng: number },
  footprintSqm: number,
): GeoJSON.Polygon {
  const sideM = Math.sqrt(Math.max(footprintSqm, 0))
  const halfSideM = sideM / 2

  const dLat = halfSideM / METERS_PER_DEGREE_LAT
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180)
  const dLng = halfSideM / metersPerDegreeLng

  const { lat, lng } = center
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
      [lng - dLng, lat - dLat],
    ]],
  }
}

/**
 * Same idea as buildIndicativeFootprintPolygon, but an elongated
 * rectangle rather than a square — for "bar" building wings (the
 * multifamily L/courtyard layout) where a slender rectangular
 * volume reads architecturally correctly and a square block doesn't.
 * `widthToLengthRatio` < 1 produces a rectangle longer along the
 * local X (east-west) axis before any rotation is applied.
 */
export function buildRectangleFootprintPolygon(
  center: { lat: number; lng: number },
  footprintSqm: number,
  widthToLengthRatio: number,
): GeoJSON.Polygon {
  const lengthM = Math.sqrt(Math.max(footprintSqm, 0) / widthToLengthRatio)
  const widthM = lengthM * widthToLengthRatio
  const halfLen = lengthM / 2, halfWid = widthM / 2

  const dLatWid = halfWid / METERS_PER_DEGREE_LAT
  const mLngLocal = metersPerDegreeLng(center.lat)
  const dLngLen = halfLen / mLngLocal

  const { lat, lng } = center
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - dLngLen, lat - dLatWid],
      [lng + dLngLen, lat - dLatWid],
      [lng + dLngLen, lat + dLatWid],
      [lng - dLngLen, lat + dLatWid],
      [lng - dLngLen, lat - dLatWid],
    ]],
  }
}

/**
 * Building-object transforms — Move/Resize/Rotate/Duplicate for
 * Phase D. All operate in a local metres-at-centroid plane (same
 * equirectangular approximation used throughout this file) and
 * return a new GeoJSON.Polygon — none of these ever mutate an input,
 * and none of them touch sites.boundary or any evidence field.
 * These act purely on a scenario's OWN building_mass elements, which
 * are already exploratory/derived by definition.
 */
export function polygonCentroid(polygon: GeoJSON.Polygon): { lat: number; lng: number } {
  const ring = polygon.coordinates[0]
  const pts = ring.slice(0, -1)
  const sum = pts.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
  return { lng: sum[0] / pts.length, lat: sum[1] / pts.length }
}

export function polygonAreaSqm(polygon: GeoJSON.Polygon): number {
  const ring = polygon.coordinates[0].slice(0, -1)
  return computeDrawnPolygonAreaSqm(ring.map(([lng, lat]) => ({ lat, lng })))
}

export function translatePolygon(polygon: GeoJSON.Polygon, dLatM: number, dLngM: number): GeoJSON.Polygon {
  const centroid = polygonCentroid(polygon)
  const mLng = metersPerDegreeLng(centroid.lat)
  const dLat = dLatM / METERS_PER_DEGREE_LAT
  const dLng = dLngM / mLng
  return {
    type: 'Polygon',
    coordinates: [polygon.coordinates[0].map(([lng, lat]) => [lng + dLng, lat + dLat])],
  }
}

export function rotatePolygon(polygon: GeoJSON.Polygon, degrees: number): GeoJSON.Polygon {
  const centroid = polygonCentroid(polygon)
  const mLng = metersPerDegreeLng(centroid.lat)
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad), sin = Math.sin(rad)

  const coords = polygon.coordinates[0].map(([lng, lat]) => {
    const xM = (lng - centroid.lng) * mLng
    const yM = (lat - centroid.lat) * METERS_PER_DEGREE_LAT
    const xR = xM * cos - yM * sin
    const yR = xM * sin + yM * cos
    return [centroid.lng + xR / mLng, centroid.lat + yR / METERS_PER_DEGREE_LAT]
  })
  return { type: 'Polygon', coordinates: [coords] }
}

export function scalePolygon(polygon: GeoJSON.Polygon, factor: number): GeoJSON.Polygon {
  const centroid = polygonCentroid(polygon)
  const coords = polygon.coordinates[0].map(([lng, lat]) => [
    centroid.lng + (lng - centroid.lng) * factor,
    centroid.lat + (lat - centroid.lat) * factor,
  ])
  return { type: 'Polygon', coordinates: [coords] }
}

/**
 * An assumed area per surface parking space (one stall + its share of
 * a drive aisle) — an illustrative default, exactly like
 * FLOOR_TO_FLOOR_M in scenario-engine.ts, not a recovered parking-
 * design standard. ~25 sqm/space is a common rough figure for surface
 * (non-structured) parking; MANOP does not claim a code-compliant
 * bay-packing calculation from this.
 */
const INDICATIVE_SQM_PER_PARKING_SPACE = 25

/**
 * Builds an INDICATIVE parking area placed near (but offset from) the
 * site centre, sized for a given stall count. Exactly parallel to
 * buildIndicativeFootprintPolygon: a generated preview shape used to
 * make "Indicative Parking: N spaces" visible and spatial, not a
 * claim about where parking would actually go — there is no
 * persisted parking scenario_elements row yet (see the Site Studio
 * audit, "Parking spatialisation"). Offset south-east of centre by a
 * fixed fraction of its own footprint so it doesn't simply sit on top
 * of the indicative building footprint preview when both are shown
 * for a scenario with no real placed buildings yet.
 */
export function buildIndicativeParkingPolygon(
  center: { lat: number; lng: number },
  stallCount: number,
): GeoJSON.Polygon {
  const areaSqm = Math.max(stallCount, 0) * INDICATIVE_SQM_PER_PARKING_SPACE
  const raw = buildRectangleFootprintPolygon(center, areaSqm, 0.45)
  const sideM = Math.sqrt(areaSqm / 0.45)
  return translatePolygon(raw, -sideM * 0.65, sideM * 0.65)
}

/** A small rectangular default footprint for a freshly-drawn or
 * duplicated building when no explicit shape is given — same style
 * as buildIndicativeFootprintPolygon, reused for a new building
 * placed near an existing one. */
export function buildDefaultBuildingPolygon(center: { lat: number; lng: number }, footprintSqm = 400): GeoJSON.Polygon {
  return buildIndicativeFootprintPolygon(center, footprintSqm)
}