// lib/zoning-envelope-geometry.ts
//
// The 3D rendering half of the zoning envelope feature — the data
// contract and validation live in lib/site-intelligence.ts
// (ZoningEnvelope, resolveZoningEnvelope). This file turns a REAL,
// already-validated ZoningEnvelope into the translucent blue
// setback/sky-exposure wedge, the same visual language TestFit uses
// for the same underlying idea: showing exactly where a buildable
// envelope steps back above a given height, computed from a real
// planning rule, not a decoration.
//
// Deliberately a separate file from massing-geometry.ts, same
// reasoning as parking being a separate object system from buildings:
// a zoning envelope isn't a building — it's a constraint drawn in the
// same 3D space, and keeping it structurally separate means it can
// never accidentally inherit building-specific logic (floor slabs,
// typology grammar) that has nothing to do with it.
//
// Every function here takes an ALREADY-VALIDATED ZoningEnvelope. It
// is not this file's job to decide whether the data is trustworthy —
// that decision is made once, by isValidZoningEnvelope, before
// anything here ever runs. If there's no envelope, the caller simply
// doesn't call buildZoningEnvelopeMesh at all — there is no "empty
// envelope" rendering path to accidentally trigger.

import * as THREE from 'three'
import type { ZoningEnvelope } from './site-intelligence'
import type { LocalPoint2D } from './massing-geometry'

const ENVELOPE_COLOR = 0x3b82f6 // the same blue family TestFit uses for this exact concept
const ENVELOPE_OPACITY = 0.28
const CAP_OPACITY = 0.16

function edgeInwardNormal(ring: LocalPoint2D[], i: number, centroid: LocalPoint2D): LocalPoint2D {
  const a = ring[i]
  const b = ring[(i + 1) % ring.length]
  const dx = b.x - a.x, dz = b.z - a.z
  const len = Math.sqrt(dx * dx + dz * dz) || 1
  const dirX = dx / len, dirZ = dz / len
  // Two perpendicular candidates; pick whichever moves the edge
  // midpoint closer to the polygon's own centroid — that's "inward"
  // regardless of the ring's winding order, so this works for a
  // boundary drawn either clockwise or counter-clockwise.
  const candidateA = { x: -dirZ, z: dirX }
  const candidateB = { x: dirZ, z: -dirX }
  const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2
  const distA = (midX + candidateA.x - centroid.x) ** 2 + (midZ + candidateA.z - centroid.z) ** 2
  const distB = (midX + candidateB.x - centroid.x) ** 2 + (midZ + candidateB.z - centroid.z) ** 2
  return distA < distB ? candidateA : candidateB
}

function ringCentroid(ring: LocalPoint2D[]): LocalPoint2D {
  const sum = ring.reduce((acc, p) => ({ x: acc.x + p.x, z: acc.z + p.z }), { x: 0, z: 0 })
  return { x: sum.x / ring.length, z: sum.z / ring.length }
}

/** One translucent ruled-surface strip connecting consecutive
 * (heightM, insetM) points along one edge — the sloped/stepped wedge
 * itself. Two triangles per segment between consecutive points. */
function buildEdgeStrip(ring: LocalPoint2D[], edgeIndex: number, points: { heightM: number; insetM: number }[], centroid: LocalPoint2D): THREE.Mesh | null {
  if (points.length < 2) return null
  const a = ring[edgeIndex]
  const b = ring[(edgeIndex + 1) % ring.length]
  const n = edgeInwardNormal(ring, edgeIndex, centroid)

  const positions: number[] = []
  const addQuad = (p1: LocalPoint2D, h1: number, p2: LocalPoint2D, h2: number, p3: LocalPoint2D, h3: number, p4: LocalPoint2D, h4: number) => {
    // Two triangles, both winding orders — the envelope should read
    // whether viewed from inside or outside the buildable volume.
    positions.push(p1.x, h1, p1.z, p2.x, h2, p2.z, p3.x, h3, p3.z)
    positions.push(p1.x, h1, p1.z, p3.x, h3, p3.z, p4.x, h4, p4.z)
  }

  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i], hi = points[i + 1]
    const loStart = { x: a.x + n.x * lo.insetM, z: a.z + n.z * lo.insetM }
    const loEnd = { x: b.x + n.x * lo.insetM, z: b.z + n.z * lo.insetM }
    const hiStart = { x: a.x + n.x * hi.insetM, z: a.z + n.z * hi.insetM }
    const hiEnd = { x: b.x + n.x * hi.insetM, z: b.z + n.z * hi.insetM }
    addQuad(loStart, lo.heightM, loEnd, lo.heightM, hiEnd, hi.heightM, hiStart, hi.heightM)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({
    color: ENVELOPE_COLOR, transparent: true, opacity: ENVELOPE_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  })
  return new THREE.Mesh(geometry, material)
}

/** A flat horizontal cap at maxHeightM, across the original
 * footprint. SIMPLIFICATION, stated plainly: a fully correct cap
 * would use the footprint as reduced by whatever setback applies at
 * that exact height, not the original boundary — that requires
 * polygon offsetting this file doesn't implement yet. Using the
 * original footprint overstates the capped buildable area slightly;
 * it does not understate it, so it never hides a real constraint,
 * only draws the cap a bit larger than the strictest reading would.
 * Flagged here rather than silently shipped as if it were exact. */
function buildHeightCap(ring: LocalPoint2D[], heightM: number): THREE.Mesh {
  const shape = new THREE.Shape()
  ring.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)))
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2) // same convention as footprintShape() in massing-geometry.ts
  geometry.translate(0, heightM, 0)
  const material = new THREE.MeshBasicMaterial({
    color: ENVELOPE_COLOR, transparent: true, opacity: CAP_OPACITY,
    side: THREE.DoubleSide, depthWrite: false,
  })
  return new THREE.Mesh(geometry, material)
}

/**
 * Builds the full envelope visualization for a REAL, already-validated
 * ZoningEnvelope: one sloped/stepped wedge per edge rule, plus a flat
 * cap at maxHeightM if one is set. `ring` must be the SAME site
 * boundary (already converted to this scene's local x/z frame) the
 * envelope's edgeIndex values were authored against — a mismatched
 * boundary would silently point setbacks at the wrong edges, so the
 * caller is responsible for passing the right one.
 */
export function buildZoningEnvelopeMesh(ring: LocalPoint2D[], envelope: ZoningEnvelope): THREE.Group {
  const group = new THREE.Group()
  group.name = 'zoning-envelope'
  const centroid = ringCentroid(ring)

  for (const rule of envelope.edgeRules) {
    if (rule.edgeIndex < 0 || rule.edgeIndex >= ring.length) continue // out-of-range edge index — skip, don't guess which edge was meant
    const strip = buildEdgeStrip(ring, rule.edgeIndex, rule.points, centroid)
    if (strip) group.add(strip)
  }

  if (envelope.maxHeightM != null) {
    group.add(buildHeightCap(ring, envelope.maxHeightM))
  }

  return group
}