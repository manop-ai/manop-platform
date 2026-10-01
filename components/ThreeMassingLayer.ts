// components/ThreeMassingLayer.ts
//
// The actual "MAPBOX ↓ / THREE.JS ↓ / SHARED SCENARIO MODEL" bridge
// the 3D directive asks for. Implements Mapbox GL's
// CustomLayerInterface so Three.js renders INTO Mapbox's existing
// WebGL context — not a second canvas stacked on top, which would
// drift out of alignment during pan/zoom/rotate. Every render call
// re-derives the Three.js camera's projection matrix from Mapbox's
// own projection matrix for that frame, which is what keeps the
// massing locked to the map through every interaction.
//
// This is the standard technique for combining Mapbox GL JS and
// Three.js (the same approach Mapbox's own "add a 3D model" example
// uses) — not a MANOP invention, but a real, correct integration
// rather than a visual trick.
//
// IMPORTANT, STATED PLAINLY: this file was written without a live
// browser/WebGL runtime to test against. A real orientation defect
// WAS found and fixed by rigorous derivation against Mapbox's own
// documented Three.js-bridge technique (see the comment in render()
// below) — the render matrix was missing the axis rotation that
// reconciles a Y-up authored scene with Mapbox's Z-up mercator-local
// frame. The fix is derived, not guessed, but — same as everything
// else in this file — has not been visually confirmed in an actual
// browser, because this environment has no WebGL runtime. That
// confirmation is the next required step before calling this closed.

import * as THREE from 'three'
import type mapboxgl from 'mapbox-gl'
import { buildMassing, buildParkingLot, scatterTrees, MassingCategory, LocalPoint2D } from '../lib/massing-geometry'

const METERS_PER_DEGREE_LAT = 111_320
function metersPerDegreeLng(atLat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((atLat * Math.PI) / 180)
}

export interface MassingBuilding {
  id: string
  points: { lat: number; lng: number }[] // footprint ring, real coordinates
  storeys: number
  category: MassingCategory
  selected?: boolean
}
export interface MassingOpenSpace {
  points: { lat: number; lng: number }[]
}

export class ThreeMassingLayer implements mapboxgl.CustomLayerInterface {
  id = 'three-massing-layer'
  type = 'custom' as const
  renderingMode = '3d' as const

  private camera = new THREE.Camera()
  private scene = new THREE.Scene()
  private renderer: THREE.WebGLRenderer | null = null
  private map: mapboxgl.Map | null = null
  private originMercator: { x: number; y: number; z: number; meterInMercatorCoordinateUnits: () => number } | null = null
  private originLngLat: { lat: number; lng: number }

  private buildingsGroup = new THREE.Group()
  private siteGroup = new THREE.Group()
  // Separate from siteGroup on purpose: setScene() clears siteGroup on every
  // update, and the orientation marker must survive scene updates.
  private debugGroup = new THREE.Group()
  private enabled = true

  setEnabled(v: boolean) { this.enabled = v; this.map?.triggerRepaint() }

  constructor(originLngLat: { lat: number; lng: number }) {
    this.originLngLat = originLngLat
    this.scene.add(this.buildingsGroup)
    this.scene.add(this.siteGroup)
    this.scene.add(this.debugGroup)
  }

  onAdd(map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = map
    // mapboxgl is only available client-side; required here rather
    // than imported statically so this file never touches the module
    // at build/SSR time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mapboxgl = require('mapbox-gl')
    this.originMercator = mapboxgl.MercatorCoordinate.fromLngLat([this.originLngLat.lng, this.originLngLat.lat], 0)

    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(60, 100, 40)
    this.scene.add(sun)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55))

    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as any, antialias: true })
    this.renderer.autoClear = false
  }

  /** Converts a real lng/lat into local metres relative to this
   * layer's origin — the frame every massing-geometry function
   * expects. X = east, Z = south (Three.js Y-up convention; if
   * buildings render mirrored east-west, negate X here first). */
  private toLocal(pt: { lat: number; lng: number }): LocalPoint2D {
    const x = (pt.lng - this.originLngLat.lng) * metersPerDegreeLng(this.originLngLat.lat)
    const z = -(pt.lat - this.originLngLat.lat) * METERS_PER_DEGREE_LAT // -Z = north, so +Z = south
    return { x, z }
  }

  setScene(buildings: MassingBuilding[], openSpaces: MassingOpenSpace[]) {
    // Full rebuild on every scenario change — buildings count in the
    // tens for V1, not thousands, so this is cheap enough not to need
    // incremental diffing yet.
    this.buildingsGroup.clear()
    this.siteGroup.clear()

    for (const b of buildings) {
      const localPoints = b.points.map(p => this.toLocal(p))
      const group = buildMassing({ points: localPoints, storeys: b.storeys, category: b.category, selected: b.selected })
      this.buildingsGroup.add(group)
    }

    for (const o of openSpaces) {
      const localPoints = o.points.map(p => this.toLocal(p))
      // A light scatter of trees, not a dense forest — proportional
      // to area, capped so it stays cheap on a large open space.
      const minX = Math.min(...localPoints.map(p => p.x)), maxX = Math.max(...localPoints.map(p => p.x))
      const minZ = Math.min(...localPoints.map(p => p.z)), maxZ = Math.max(...localPoints.map(p => p.z))
      const approxAreaSqm = Math.abs((maxX - minX) * (maxZ - minZ))
      const treeCount = Math.min(24, Math.max(3, Math.round(approxAreaSqm / 40)))
      this.siteGroup.add(scatterTrees(localPoints, treeCount))
    }

    this.map?.triggerRepaint()
  }

  /**
   * Orientation verification aid. Draws, at the layer origin, a red arrow
   * pointing TRUE NORTH (local -Z) labelled "N", a blue arrow pointing EAST
   * (local +X) labelled "E", and a ring. With the map at bearing 0 the red
   * arrow must point to the top of the screen and the blue arrow to the right;
   * rotate the map and both must keep pointing at real north/east. If they
   * don't, the coordinate bridge is still wrong — this makes that visible in
   * seconds instead of requiring a judgement about a building's shape.
   * Built from the same local frame as every building/tree/parking object,
   * so it exercises the same toLocal() + render() path.
   */
  setOrientationMarker(visible: boolean) {
    this.debugGroup.clear()
    if (visible) {
      const y = 0.3
      const north = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, y, 0), 40, 0xef4444, 8, 5)
      const east = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, y, 0), 25, 0x3b82f6, 6, 4)
      this.debugGroup.add(north, east)
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(9, 10, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
      )
      ring.position.y = y
      this.debugGroup.add(ring)
      const label = (text: string, color: string, x: number, z: number) => {
        if (typeof document === 'undefined') return
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
        const ctx = canvas.getContext('2d'); if (!ctx) return
        ctx.fillStyle = color; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(text, 32, 34)
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }))
        sprite.scale.set(9, 9, 1); sprite.position.set(x, 8, z)
        this.debugGroup.add(sprite)
      }
      label('N', '#ef4444', 0, -50)
      label('E', '#3b82f6', 33, 0)
    }
    this.map?.triggerRepaint()
  }

  /** A real spatial parking area — painted stall outlines sized to
   * the scenario's indicative parking count, not just a tinted ground
   * plane. `areaPoints` is an INDICATIVE placement (see
   * ScenarioMap.buildIndicativeParkingPolygon) — there is no
   * persisted parking scenario_elements row yet (see the Site Studio
   * audit, Priority 2: parking spatialisation), so this always
   * renders as a generated preview, never a placed/editable object,
   * exactly like the indicative building footprint preview it's
   * modelled on. `targetStallCount` of 0 or null clears the layer. */
  setParking(areaPoints: { lat: number; lng: number }[] | null, targetStallCount: number | null) {
    const existing = this.siteGroup.getObjectByName('parking-lot')
    if (existing) this.siteGroup.remove(existing)
    if (!areaPoints || !targetStallCount || targetStallCount <= 0) { this.map?.triggerRepaint(); return }
    const localPoints = areaPoints.map(p => this.toLocal(p))
    const lot = buildParkingLot(localPoints, targetStallCount)
    lot.name = 'parking-lot'
    this.siteGroup.add(lot)
    this.map?.triggerRepaint()
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (!this.renderer || !this.originMercator || !this.enabled) return

    const scale = this.originMercator.meterInMercatorCoordinateUnits()
    const m = new THREE.Matrix4().fromArray(matrix)
    // BUG FIX (see Site Studio orientation audit): Mapbox's mercator-
    // local frame is Z-up (local Z = altitude). massing-geometry.ts —
    // like most authored 3D content — is Y-up (local Y = height,
    // built via geometry.rotateX(-Math.PI/2) throughout). Mapbox's own
    // official "add a 3D model" example handles exactly this mismatch
    // with a rotateX(Math.PI/2) applied to the model before the
    // scale/translate, and that rotation was missing here — the
    // previous code assumed the scene was already Z-up. Without it,
    // building height (local Y) was being written into mercator Y
    // (north/south) and north/south position (local Z, south-positive
    // per toLocal) was being written into mercator Z (altitude) —
    // exactly the class of defect that reads as "upside-down/mirrored".
    const uprightToMercator = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2)
    const l = new THREE.Matrix4()
      .makeTranslation(this.originMercator.x, this.originMercator.y, this.originMercator.z ?? 0)
      .scale(new THREE.Vector3(scale, -scale, scale))
      .multiply(uprightToMercator)

    this.camera.projectionMatrix = m.multiply(l)
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
    this.map?.triggerRepaint()
  }
}