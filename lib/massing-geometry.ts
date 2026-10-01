// lib/massing-geometry.ts
//
// Builds STYLIZED CONCEPTUAL massing, not architectural rendering —
// per the 3D directive: floor separation, façade rhythm, balconies
// where appropriate, recognizable roof forms, podium/tower
// distinction for mixed use. Not photorealistic, not per-window
// modeled, computationally cheap (a handful of box/extrude
// primitives per building, instanced trees). Every function here
// takes real dimensions (metres) and a local 2D footprint already
// converted to a flat X/Z plane — it knows nothing about lng/lat,
// Mapbox, or the scene bridge. components/ThreeMassingLayer.ts is
// the only thing that talks to Mapbox; this file only builds shapes.
//
// Coordinate convention used throughout: X = east, Z = south (so
// -Z = north), Y = up. This matches Three.js's default Y-up frame
// and the standard Mapbox custom-layer local-ENU technique.

import * as THREE from 'three'

export type MassingCategory = 'multifamily_residential' | 'single_family_residential' | 'townhouse' | 'mixed_use' | 'commercial' | 'other'

export interface LocalPoint2D { x: number; z: number } // metres, relative to the layer's origin

const FLOOR_HEIGHT_M = 3.2

/** A repeating window-grid texture painted directly on the wall
 * material — this is the detail the real TestFit reference frames
 * confirm matters (a printed window pattern on a flat-shaded volume,
 * not a modeled window per unit). Cached per color pair since the
 * same few facade tones repeat across every building in a scenario. */
const wallTextureCache = new Map<string, THREE.CanvasTexture>()

function wallTexture(baseHex: number, windowHex: number): THREE.CanvasTexture {
  const key = `${baseHex}-${windowHex}`
  const cached = wallTextureCache.get(key)
  if (cached) return cached

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = `#${baseHex.toString(16).padStart(6, '0')}`
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = `#${windowHex.toString(16).padStart(6, '0')}`
  const cols = 5, rows = 3
  const cellW = size / cols, cellH = size / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pad = cellW * 0.18
      ctx.fillRect(c * cellW + pad, r * cellH + pad * 1.3, cellW - pad * 2, cellH - pad * 2.4)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1, 1)
  wallTextureCache.set(key, texture)
  return texture
}

function wallMaterial(baseHex: number, windowHex: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: wallTexture(baseHex, windowHex) })
}


function footprintShape(points: LocalPoint2D[]): THREE.Shape {
  // BUG FIX (see Site Studio orientation audit): ExtrudeGeometry
  // builds in the shape's own (x, y) plane, then every caller below
  // applies geometry.rotateX(-Math.PI / 2) to stand it up so the
  // extrusion runs along local Y (up). That rotation silently negates
  // whatever was fed in as the shape's Y coordinate — it maps
  // (x, y, 0) → (x, 0, -y). Every OTHER object in this file that is
  // placed directly via mesh.position.set(x, y, z) (balconies, trees)
  // uses the true, un-negated local z (south-positive, see
  // ThreeMassingLayer.toLocal). Feeding p.z straight into shape.moveTo
  // — the previous code — meant every extruded object (floor slabs,
  // roof, ground, parking) ended up mirrored north-south relative to
  // balconies/trees attached to the very same building. Negating here
  // cancels the rotation's own negation, so extruded and
  // directly-positioned objects finally agree on which side is which.
  const shape = new THREE.Shape()
  points.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  return shape
}

function footprintCentroid(points: LocalPoint2D[]): LocalPoint2D {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 })
  return { x: sum.x / points.length, z: sum.z / points.length }
}

/** A single storey slab: the floor plate extruded up one storey,
 * inset very slightly at each floor line so the seams between
 * floors actually read visually instead of looking like one
 * unbroken box — this is most of what turns a "box" into a
 * "building" at this level of abstraction. Walls carry the printed
 * window-grid texture; windowHex defaults to a lighter tint of the
 * base color when not given explicitly. */
function floorSlab(points: LocalPoint2D[], color: number, windowHex?: number): THREE.Mesh {
  const shape = footprintShape(points)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_HEIGHT_M - 0.18, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2) // extrude along Z by default; rotate so it extrudes along Y (up)
  const material = wallMaterial(color, windowHex ?? lighten(color))
  return new THREE.Mesh(geometry, material)
}

function lighten(hex: number): number {
  const r = Math.min(255, ((hex >> 16) & 0xff) + 70)
  const g = Math.min(255, ((hex >> 8) & 0xff) + 70)
  const b = Math.min(255, (hex & 0xff) + 70)
  return (r << 16) | (g << 8) | b
}

function darken(hex: number, amount = 45): number {
  const r = Math.max(0, ((hex >> 16) & 0xff) - amount)
  const g = Math.max(0, ((hex >> 8) & 0xff) - amount)
  const b = Math.max(0, (hex & 0xff) - amount)
  return (r << 16) | (g << 8) | b
}

/** A thin balcony ledge running along one edge of the footprint,
 * protruding slightly outward — cheap, and it's the single detail
 * that reads as "residential" fastest at this scale. Alternates
 * which edge it favours by floor index so the façade isn't a flat
 * repeated pattern. */
function balconyLedge(points: LocalPoint2D[], floorIndex: number, color: number): THREE.Mesh {
  const centroid = footprintCentroid(points)
  const edgeIndex = floorIndex % points.length
  const a = points[edgeIndex]
  const b = points[(edgeIndex + 1) % points.length]
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
  const outward = { x: mid.x - centroid.x, z: mid.z - centroid.z }
  const len = Math.hypot(outward.x, outward.z) || 1
  const dir = { x: outward.x / len, z: outward.z / len }
  const edgeLen = Math.hypot(b.x - a.x, b.z - a.z)

  const depth = 1.1 // how far the balcony protrudes, metres
  const geometry = new THREE.BoxGeometry(Math.max(1.5, edgeLen * 0.5), 0.12, depth)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }))
  mesh.position.set(mid.x + dir.x * depth * 0.5, floorIndex * FLOOR_HEIGHT_M + 0.05, mid.z + dir.z * depth * 0.5)
  mesh.lookAt(mesh.position.x + dir.x, mesh.position.y, mesh.position.z + dir.z)
  return mesh
}

function roofParapet(points: LocalPoint2D[], topY: number, color: number): THREE.Mesh {
  const shape = footprintShape(points)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.45, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }))
  mesh.position.y = topY
  mesh.scale.set(1.015, 1, 1.015) // very slight overhang so the roofline reads as distinct from the wall below
  return mesh
}

interface BuildingSpec {
  points: LocalPoint2D[]   // footprint, local metres, closed or open ring (either is fine)
  storeys: number
  category: MassingCategory
  selected?: boolean
}

/**
 * Builds one building's full conceptual mass as a THREE.Group,
 * positioned so the footprint sits at (0,0,0) in the group's local
 * space — the caller (ThreeMassingLayer) positions the group in the
 * scene, this function only knows about the building itself.
 */
export function buildMassing(spec: BuildingSpec): THREE.Group {
  const group = new THREE.Group()
  const ring = spec.points[0].x === spec.points[spec.points.length - 1].x ? spec.points.slice(0, -1) : spec.points
  const storeys = Math.max(1, spec.storeys)
  const baseColor = spec.selected ? 0xf59e0b : wallColorFor(spec.category)
  const accentColor = spec.selected ? 0xfcd34d : accentColorFor(spec.category)

  switch (spec.category) {
    case 'mixed_use': {
      // Podium (wider, lower, commercial-toned) + a set-back tower above.
      const podiumStoreys = Math.min(2, storeys)
      for (let f = 0; f < podiumStoreys; f++) {
        const slab = floorSlab(ring, 0x64748b) // neutral commercial tone for the podium
        slab.position.y = f * FLOOR_HEIGHT_M
        group.add(slab)
      }
      const towerRing = insetRing(ring, 0.82)
      for (let f = podiumStoreys; f < storeys; f++) {
        const slab = floorSlab(towerRing, baseColor)
        slab.position.y = f * FLOOR_HEIGHT_M
        group.add(slab)
        if ((f - podiumStoreys) % 2 === 0) group.add(balconyLedge(towerRing, f, accentColor))
      }
      group.add(roofParapet(towerRing, storeys * FLOOR_HEIGHT_M, baseColor))
      break
    }

    case 'commercial': {
      // Broad, lower floor plates, taller floor-to-floor height, flat
      // wide roof — deliberately reads differently from residential
      // at a glance rather than being the same slab in a different colour.
      const commercialFloorHeight = FLOOR_HEIGHT_M * 1.35
      for (let f = 0; f < storeys; f++) {
        const shape = footprintShape(ring)
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: commercialFloorHeight - 0.2, bevelEnabled: false })
        geometry.rotateX(-Math.PI / 2)
        const slab = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: baseColor }))
        slab.position.y = f * commercialFloorHeight
        group.add(slab)
      }
      group.add(roofParapet(ring, storeys * commercialFloorHeight, baseColor))
      break
    }

    case 'townhouse':
    case 'single_family_residential': {
      // A simple pitched roof rather than a flat parapet — the
      // clearest single cue that this isn't an apartment slab.
      for (let f = 0; f < storeys; f++) {
        const slab = floorSlab(ring, baseColor)
        slab.position.y = f * FLOOR_HEIGHT_M
        group.add(slab)
      }
      const centroid = footprintCentroid(ring)
      const spanX = Math.max(...ring.map(p => p.x)) - Math.min(...ring.map(p => p.x))
      const spanZ = Math.max(...ring.map(p => p.z)) - Math.min(...ring.map(p => p.z))
      const roofGeom = new THREE.ConeGeometry(Math.max(spanX, spanZ) * 0.62, 2.4, 4)
      const roof = new THREE.Mesh(roofGeom, new THREE.MeshLambertMaterial({ color: 0x78350f }))
      roof.rotation.y = Math.PI / 4
      roof.position.set(centroid.x, storeys * FLOOR_HEIGHT_M + 1.2, centroid.z)
      group.add(roof)
      break
    }

    case 'multifamily_residential':
    default: {
      for (let f = 0; f < storeys; f++) {
        // Ground floor reads as a base/plinth (lobby, entries) — darker
        // and without the upper floors' window rhythm — rather than
        // simply repeating the same slab from the ground up.
        const slab = f === 0
          ? floorSlab(ring, darken(baseColor), darken(baseColor, 20))
          : floorSlab(ring, baseColor)
        slab.position.y = f * FLOOR_HEIGHT_M
        group.add(slab)
        if (f > 0 && f % 2 === 0) group.add(balconyLedge(ring, f, accentColor))
      }
      group.add(roofParapet(ring, storeys * FLOOR_HEIGHT_M, baseColor))
      break
    }
  }

  return group
}

function insetRing(points: LocalPoint2D[], factor: number): LocalPoint2D[] {
  const c = footprintCentroid(points)
  return points.map(p => ({ x: c.x + (p.x - c.x) * factor, z: c.z + (p.z - c.z) * factor }))
}

function wallColorFor(category: MassingCategory): number {
  switch (category) {
    case 'commercial': return 0x64748b
    case 'townhouse': return 0xb45309
    case 'single_family_residential': return 0x0f766e
    // A modern glass-and-panel tower tone, not the same purple as the
    // generic default — mixed_use should read as a distinct typology,
    // not "multifamily with a podium bolted on."
    case 'mixed_use': return 0x3b4a63
    // BUG FIX: multifamily_residential — the most commonly selected
    // category, and the one in every reported screenshot — had no case
    // of its own here and fell through to `default`, which was the same
    // 0x6d28d9 purple as mixed_use. That's the actual reason every
    // multifamily scenario read as "a purple block": the geometry (floor
    // slabs, balconies, parapet, in buildMassing below) was always
    // correctly built and distinct — only the colour was wrong. A warm,
    // stone-toned facade reads as an actual residential building rather
    // than a flat brand-colour extrusion.
    case 'multifamily_residential': return 0xd8cba8
    default: return 0x9c9a93
  }
}
function accentColorFor(category: MassingCategory): number {
  switch (category) {
    case 'commercial': return 0x94a3b8
    case 'townhouse': return 0xfcd34d
    case 'single_family_residential': return 0x5eead4
    case 'mixed_use': return 0x8fb4d9
    case 'multifamily_residential': return 0xc97b4a
    default: return 0xc7c5be
  }
}

/** A single stylized low-poly tree — a cylinder trunk + cone canopy,
 * a few hundred triangles total. Instanced by the caller for a
 * cluster, never modeled individually per placement. */
export function buildTree(): THREE.Group {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6), new THREE.MeshLambertMaterial({ color: 0x6b4226 }))
  trunk.position.y = 0.8
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 7), new THREE.MeshLambertMaterial({ color: 0x2f9e44 }))
  canopy.position.y = 2.6
  group.add(trunk, canopy)
  return group
}

/** Scatters trees within a polygon using simple rejection sampling
 * against its bounding box — good enough at this scale, no need for
 * a real point-in-polygon triangulated fill. */
export function scatterTrees(points: LocalPoint2D[], targetCount: number): THREE.Group {
  const group = new THREE.Group()
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z))
  let placed = 0, attempts = 0
  while (placed < targetCount && attempts < targetCount * 12) {
    attempts++
    const x = minX + Math.random() * (maxX - minX)
    const z = minZ + Math.random() * (maxZ - minZ)
    if (pointInPolygon(points, x, z)) {
      const tree = buildTree()
      const scale = 0.75 + Math.random() * 0.5
      tree.scale.set(scale, scale, scale)
      tree.position.set(x, 0, z)
      group.add(tree)
      placed++
    }
  }
  return group
}

function pointInPolygon(points: LocalPoint2D[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, zi = points[i].z, xj = points[j].x, zj = points[j].z
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Flat ground plane with a painted stall-line pattern, scaled to
 * roughly one line pair per parking bay — a spatial parking
 * representation without a real bay-packing solve (that's the
 * documented next step, not this pass). */
/** SUPERSEDED — kept only in case a caller wants a plain tinted plane
 * without stall lines. components/ThreeMassingLayer.ts now uses
 * buildParkingLot (below) for its real spatial parking representation;
 * this function is no longer called by anything in the Studio path. */
export function buildParkingGround(points: LocalPoint2D[]): THREE.Mesh {
  const shape = footprintShape(points)
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  const material = new THREE.MeshLambertMaterial({ color: 0x334155 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = 0.02
  return mesh
}

/** A real spatial parking lot: painted stall outlines in a grid, sized
 * to fit the requested stall count within the polygon, plus a simple
 * drive aisle down the middle. This is what makes parking "a real
 * scenario object... not just a number in the readings panel" — a
 * tinted ground plane alone doesn't communicate that. Not a true
 * bay-packing solver (doesn't optimize stall count against irregular
 * polygon shapes) — a real, honest next step from here, not this
 * pass's job. */
export function buildParkingLot(points: LocalPoint2D[], targetStallCount: number): THREE.Group {
  const group = new THREE.Group()

  const ground = new THREE.Mesh(
    (() => { const g = new THREE.ShapeGeometry(footprintShape(points)); g.rotateX(-Math.PI / 2); return g })(),
    new THREE.MeshLambertMaterial({ color: 0x334155 }),
  )
  ground.position.y = 0.01
  group.add(ground)

  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x))
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z))
  const width = maxX - minX, depth = maxZ - minZ
  if (width < 5 || depth < 5 || targetStallCount <= 0) return group

  const STALL_W = 2.6, STALL_D = 5.0, AISLE_D = 6.0
  const cols = Math.max(1, Math.floor(width / STALL_W))
  const rowsAvailable = Math.max(1, Math.floor(depth / (STALL_D * 2 + AISLE_D)))
  const stallsPerDoubleRow = cols * 2
  const rowsNeeded = Math.min(rowsAvailable, Math.max(1, Math.ceil(targetStallCount / stallsPerDoubleRow)))

  const lineMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 })
  let placed = 0

  for (let row = 0; row < rowsNeeded && placed < targetStallCount; row++) {
    const rowBaseZ = minZ + row * (STALL_D * 2 + AISLE_D)
    for (const zOffset of [0, STALL_D + AISLE_D]) {
      for (let col = 0; col < cols && placed < targetStallCount; col++) {
        const x0 = minX + col * STALL_W
        const z0 = rowBaseZ + zOffset
        const outline = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x0, 0.03, z0), new THREE.Vector3(x0 + STALL_W * 0.92, 0.03, z0),
          new THREE.Vector3(x0 + STALL_W * 0.92, 0.03, z0 + STALL_D), new THREE.Vector3(x0, 0.03, z0 + STALL_D),
          new THREE.Vector3(x0, 0.03, z0),
        ])
        group.add(new THREE.Line(outline, lineMat))
        placed++
      }
    }
  }

  return group
}