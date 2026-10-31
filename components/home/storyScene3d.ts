// components/home/storyScene3d.ts
//
// The three.js scene behind the homepage "From the ground up" story. Loaded on demand (dynamic import from StoryScene.tsx), only when the
// section is near the viewport, so it never touches the homepage's first paint.
//
// WHAT THIS IS: a CONCEPTUAL visualisation of how MANOP's capabilities connect. Nothing here is a real site, a design, an approval, a finance
// offer or a recommendation, and the page says so beside the canvas. The five "information layers" at the end are an explanation device.
//
// COLOURS: only the approved MANOP palette (purple, teal, white, navy and their existing tokens). No gold, no amber, no new hues.
//
// RENDERING: one renderer, one scene, render-on-demand (the caller only calls frame() while the section is on screen and the scroll
// position is still settling), capped pixel ratio, a single 1024 shadow map, shared geometries and materials. About 150 meshes in total.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export interface SceneApi {
  /** Target scroll progress, 0..1. The scene eases towards it. */
  setProgress(p: number): void
  /** Snap straight to a progress (used for the static final frame). */
  jump(p: number): void
  resize(w: number, h: number): void
  /** Advance easing and draw. Returns true while it still needs more frames. */
  frame(dtSeconds: number): boolean
  /** Screen position (CSS px, relative to the canvas) of a named anchor. */
  project(name: string): { x: number; y: number; visible: boolean }
  dispose(): void
}

export const ANCHORS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 'l_site', 'l_dev', 'l_market', 'l_fin', 'l_risk', 'f_pay', 'f_path'] as const

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const sm = (x: number) => x * x * (3 - 2 * x)
const win = (p: number, a: number, b: number) => sm(clamp((p - a) / (b - a)))
const bump = (p: number, a: number, b: number) => Math.sin(Math.PI * clamp((p - a) / (b - a)))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Brand colours (approved tokens).
const PURPLE = 0x5b2eff, PURPLE_LIGHT = 0x7c5fff, LAVENDER = 0xa78bfa
const TEAL = 0x14b8a6, TEAL_LIGHT = 0x2dd4bf
const NAVY = 0x0f172a, NAVY_MID = 0x1e293b, NAVY_CARD = 0x162032
const WHITE = 0xe8ecf8, MUTED = 0x94a3b8

// Camera keyframes per stage: position, look-at target. Interpolated with easing between stages.
const CAM: { p: [number, number, number]; t: [number, number, number] }[] = [
  { p: [9.6, 8.2, 10.4], t: [0, 0, 0] },        // 1 the ground
  { p: [9.6, 7.2, 9.6], t: [0, 0.9, 0] },      // 2 site studio
  { p: [11, 6.0, 10.6], t: [0, 2.0, 0] },      // 3 development
  { p: [12.8, 6.8, 10.4], t: [0, 2.5, 0] },     // 4 construction appraisal
  { p: [16.5, 11, 16.5], t: [0, 1.4, 0] },     // 5 market
  { p: [13.5, 8.8, 13.5], t: [0, 2.6, 0] },    // 6 finance
  { p: [17.5, 9.6, 17.5], t: [0, 3.2, 0] },    // 7 decision
]

function windowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96
  const g = c.getContext('2d')!
  g.fillStyle = '#0F172A'; g.fillRect(0, 0, 256, 96)
  g.fillStyle = '#2DD4BF'
  const cols = 6, gap = 8, w = (256 - gap * (cols + 1)) / cols
  for (let i = 0; i < cols; i++) g.fillRect(gap + i * (w + gap), 18, w, 58)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}
function radialTexture(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 256
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, inner); gr.addColorStop(1, outer)
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createScene(canvas: HTMLCanvasElement, opts: { mobile: boolean }): SceneApi {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.mobile ? 1.5 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(NAVY, 26, 52)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.55

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120)

  // ── Lights ───────────────────────────────────────────────────────────────
  scene.add(new THREE.HemisphereLight(0xb9b4ff, NAVY, 0.55))
  const key = new THREE.DirectionalLight(0xffffff, 2.1)
  key.position.set(8, 14, 6)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 })
  key.shadow.bias = -0.0004
  scene.add(key)
  const rim = new THREE.PointLight(TEAL_LIGHT, 0, 40); rim.position.set(-9, 5, -8); scene.add(rim)
  const glow = new THREE.PointLight(PURPLE_LIGHT, 0, 30); glow.position.set(0, 7, 0); scene.add(glow)

  const root = new THREE.Group(); scene.add(root)

  // ── Shared materials ─────────────────────────────────────────────────────
  const matLine = (c: number, o = 1) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })
  const matFlat = (c: number, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })
  const matStd = (c: number, r = 0.6, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  const box = new THREE.BoxGeometry(1, 1, 1)
  const disposables: { dispose(): void }[] = [renderer, pmrem, envTex, box]
  const track = <T extends { dispose(): void }>(o: T) => { disposables.push(o); return o }
  const edgesOf = (g: THREE.BufferGeometry, c: number, o: number) => {
    const eg = track(new THREE.EdgesGeometry(g)); const m = track(matLine(c, o)); return new THREE.LineSegments(eg, m)
  }
  const fadeTargets: { m: THREE.Material & { opacity: number }; base: number }[] = []

  // ── GROUND ───────────────────────────────────────────────────────────────
  const fadeTex = track(radialTexture('rgba(30,41,59,1)', 'rgba(15,23,42,0)'))
  const fadeDisc = new THREE.Mesh(track(new THREE.CircleGeometry(30, 64)), track(new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false })))
  fadeDisc.rotation.x = -Math.PI / 2; fadeDisc.position.y = -0.32; root.add(fadeDisc)

  const shadowPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(60, 60)), track(new THREE.ShadowMaterial({ opacity: 0.38 })))
  shadowPlane.rotation.x = -Math.PI / 2; shadowPlane.position.y = 0.002; shadowPlane.receiveShadow = true; root.add(shadowPlane)

  const slabMat = track(matStd(NAVY_MID, 0.85, 0)); slabMat.transparent = true
  const slab = new THREE.Mesh(box, slabMat); slab.scale.set(8.4, 0.34, 8.4); slab.receiveShadow = true; root.add(slab)
  const plotMat = track(matStd(NAVY_CARD, 0.9, 0)); plotMat.transparent = true
  const plot = new THREE.Mesh(track(new THREE.PlaneGeometry(8, 8)), plotMat)
  plot.rotation.x = -Math.PI / 2; plot.position.y = 0.003; plot.receiveShadow = true; root.add(plot)
  const grid = new THREE.GridHelper(8, 16, PURPLE_LIGHT, 0x334155)
  const gridMat = grid.material as THREE.LineBasicMaterial; gridMat.transparent = true; gridMat.opacity = 0; gridMat.depthWrite = false
  grid.position.y = 0.006; root.add(grid); track(gridMat)

  // Plot boundary: four teal walls that draw themselves corner to corner.
  const walls: THREE.Group[] = []
  const wallMat = track(new THREE.MeshStandardMaterial({ color: TEAL_LIGHT, emissive: TEAL, emissiveIntensity: 1.1, roughness: 0.4 }))
  const corners: [number, number][] = [[-4, -4], [4, -4], [4, 4], [-4, 4]]
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = corners[i], [x2, z2] = corners[(i + 1) % 4]
    const g = new THREE.Group(); g.position.set(x1, 0.05, z1)
    g.rotation.y = Math.atan2(-(z2 - z1), x2 - x1)
    const m = new THREE.Mesh(box, wallMat); m.scale.set(8, 0.05, 0.09); m.position.x = 4; g.add(m)
    root.add(g); walls.push(g)
  }
  const posts: THREE.Mesh[] = corners.map(([x, z]) => {
    const m = new THREE.Mesh(track(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 12)), wallMat)
    m.position.set(x, 0.4, z); root.add(m); return m
  })

  // Surrounding context rings (conceptual contours).
  const contourMat = track(matLine(LAVENDER, 0))
  const contours: THREE.LineLoop[] = []
  for (let i = 0; i < 4; i++) {
    const pts: THREE.Vector3[] = []
    const r = 6.4 + i * 1.7
    for (let k = 0; k < 90; k++) {
      const a = (k / 90) * Math.PI * 2
      const wob = 1 + 0.08 * Math.sin(a * 3 + i) + 0.05 * Math.sin(a * 5 + i * 2)
      pts.push(new THREE.Vector3(Math.cos(a) * r * wob, -0.3, Math.sin(a) * r * wob * 0.9))
    }
    const l = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(pts)), contourMat); root.add(l); contours.push(l)
  }

  // ── SITE STUDIO: setbacks, envelope, scenario ghosts ─────────────────────
  const dashMat = track(new THREE.LineDashedMaterial({ color: LAVENDER, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0, depthWrite: false }))
  const setback = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.9, 0.02, -2.9), new THREE.Vector3(2.9, 0.02, -2.9), new THREE.Vector3(2.9, 0.02, 2.9), new THREE.Vector3(-2.9, 0.02, 2.9)])), dashMat)
  setback.computeLineDistances(); root.add(setback)
  const footMat = track(matFlat(TEAL, 0))
  const footprint = new THREE.Mesh(track(new THREE.PlaneGeometry(4.4, 4.4)), footMat)
  footprint.rotation.x = -Math.PI / 2; footprint.position.y = 0.012; root.add(footprint)

  const envelope = new THREE.Group(); root.add(envelope)
  const envMat = track(matLine(TEAL_LIGHT, 0))
  { const e = new THREE.LineSegments(track(new THREE.EdgesGeometry(box)), envMat); e.scale.set(4.4, 5.9, 4.4); e.position.y = 2.95; envelope.add(e) }
  // Alternative massing ideas, shown one after another while the Site Studio stage is on screen.
  const ghostDefs: { w: number; h: number; d: number; x: number; z: number }[] = [
    { w: 5.2, h: 2.4, d: 3.4, x: 0, z: 0.2 }, { w: 2.8, h: 4.6, d: 5.0, x: -0.4, z: 0 }, { w: 2.6, h: 6.2, d: 2.6, x: 0.6, z: -0.5 },
  ]
  const ghosts = ghostDefs.map(d => {
    const g = new THREE.Group(); g.position.set(d.x, d.h / 2, d.z); g.scale.set(d.w, d.h, d.d)
    const fm = track(matFlat(TEAL_LIGHT, 0)); const lm = track(matLine(TEAL_LIGHT, 0))
    g.add(new THREE.Mesh(box, fm)); g.add(new THREE.LineSegments(track(new THREE.EdgesGeometry(box)), lm))
    root.add(g); return { g, fm, lm }
  })

  // ── DEVELOPMENT: the building, floor by floor ────────────────────────────
  const FLOORS = 8, FH = 0.62
  const winTex = track(windowTexture())
  const slabWhite = track(matStd(WHITE, 0.45, 0.02))
  const floors: { grp: THREE.Group; glassMat: THREE.MeshStandardMaterial; ring: THREE.LineLoop; ringMat: THREE.LineBasicMaterial; top: number }[] = []
  const bldg = new THREE.Group(); root.add(bldg)
  const plan = (i: number) => (i === 0 ? { w: 4.2, d: 3.8 } : i === FLOORS - 1 ? { w: 2.6, d: 2.4 } : i >= FLOORS - 3 ? { w: 3.2, d: 3.0 } : { w: 3.6, d: 3.4 })
  for (let i = 0; i < FLOORS; i++) {
    const { w, d } = plan(i)
    const grp = new THREE.Group(); grp.position.y = i * FH; bldg.add(grp)
    const s = new THREE.Mesh(box, slabWhite); s.scale.set(w + 0.14, 0.08, d + 0.14); s.position.y = 0.04; s.castShadow = true; s.receiveShadow = true; grp.add(s)
    const gm = track(new THREE.MeshStandardMaterial({
      color: NAVY_MID, map: winTex, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.12,
      roughness: 0.18, metalness: 0.65, transparent: true, opacity: 0.94,
    }))
    const glass = new THREE.Mesh(box, gm); glass.scale.set(w, FH - 0.1, d); glass.position.y = 0.08 + (FH - 0.1) / 2; glass.castShadow = true; glass.receiveShadow = true; grp.add(glass)
    // Purple structural frame (corner columns) so the facade reads as MANOP purple, not generic glass.
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const c = new THREE.Mesh(box, track(matStd(PURPLE, 0.35, 0.1))); c.scale.set(0.09, FH - 0.08, 0.09)
      c.position.set(sx * w / 2, 0.08 + (FH - 0.08) / 2, sz * d / 2); c.castShadow = true; grp.add(c)
    }
    const ringMat = track(matLine(TEAL_LIGHT, 0))
    const rp = [new THREE.Vector3(-w / 2 - 0.1, FH, -d / 2 - 0.1), new THREE.Vector3(w / 2 + 0.1, FH, -d / 2 - 0.1), new THREE.Vector3(w / 2 + 0.1, FH, d / 2 + 0.1), new THREE.Vector3(-w / 2 - 0.1, FH, d / 2 + 0.1)]
    const ring = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(rp)), ringMat); grp.add(ring)
    floors.push({ grp, glassMat: gm, ring, ringMat, top: (i + 1) * FH })
  }
  const roof = new THREE.Mesh(box, slabWhite); roof.scale.set(2.8, 0.1, 2.6); roof.position.y = FLOORS * FH + 0.05; roof.castShadow = true; bldg.add(roof)
  const roofLine = edgesOf(box, TEAL_LIGHT, 0.0); roofLine.scale.copy(roof.scale); roofLine.position.copy(roof.position); bldg.add(roofLine)
  const roofTopY = FLOORS * FH + 0.1

  // ── CONSTRUCTION APPRAISAL: crane, scan plane, cost columns ──────────────
  const crane = new THREE.Group(); crane.position.set(-3.2, 0, 3.2); root.add(crane)
  const craneMat = track(matStd(MUTED, 0.5, 0.4))
  { const m = new THREE.Mesh(box, craneMat); m.scale.set(0.14, 7.4, 0.14); m.position.y = 3.7; m.castShadow = true; crane.add(m) }
  const jib = new THREE.Group(); jib.position.y = 7.4; crane.add(jib)
  { const m = new THREE.Mesh(box, craneMat); m.scale.set(6.2, 0.12, 0.12); m.position.x = 1.6; m.castShadow = true; jib.add(m)
    const cw = new THREE.Mesh(box, craneMat); cw.scale.set(0.5, 0.4, 0.4); cw.position.x = -1.2; jib.add(cw)
    const beacon = new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 12, 12)), track(new THREE.MeshBasicMaterial({ color: TEAL_LIGHT }))); beacon.position.set(4.6, 0.15, 0); jib.add(beacon)
    const cable = new THREE.Mesh(box, track(matFlat(MUTED, 0.8))); cable.scale.set(0.025, 2.2, 0.025); cable.position.set(2.4, -1.1, 0); jib.add(cable) }

  const scanMat = track(matFlat(TEAL_LIGHT, 0)); scanMat.side = THREE.DoubleSide
  const scan = new THREE.Mesh(track(new THREE.PlaneGeometry(5.4, 5.0)), scanMat); scan.rotation.x = -Math.PI / 2; root.add(scan)
  const scanEdge = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2.7, 0, -2.5), new THREE.Vector3(2.7, 0, -2.5), new THREE.Vector3(2.7, 0, 2.5), new THREE.Vector3(-2.7, 0, 2.5)])), track(matLine(TEAL_LIGHT, 0)))
  root.add(scanEdge)

  // Cost columns: gross development value beside the cost components and the residual left for the land. Heights are schematic, not figures.
  const costGroup = new THREE.Group(); costGroup.position.set(3.4, 0, -3.1); root.add(costGroup)
  const costSegs: { m: THREE.Mesh; y0: number; h: number }[] = []
  { // GDV column
    const gdv = new THREE.Mesh(box, track(matStd(WHITE, 0.4, 0.05))); gdv.scale.set(0.34, 3.4, 0.34); gdv.position.set(0, 1.7, 0); gdv.castShadow = true; costGroup.add(gdv); costSegs.push({ m: gdv, y0: 0, h: 3.4 })
    const parts: [number, number][] = [[1.5, PURPLE], [0.38, PURPLE_LIGHT], [0.17, LAVENDER], [0.33, 0x6d5bd8], [0.52, 0x4a3fb0]]
    let y = 0
    for (const [h, col] of parts) {
      const m = new THREE.Mesh(box, track(matStd(col, 0.5, 0.08))); m.scale.set(0.34, h, 0.34); m.position.set(0.5, y + h / 2, 0); m.castShadow = true; costGroup.add(m); costSegs.push({ m, y0: y, h }); y += h
    }
    const res = new THREE.Mesh(box, track(new THREE.MeshStandardMaterial({ color: TEAL_LIGHT, emissive: TEAL, emissiveIntensity: 0.9, roughness: 0.4 })))
    res.scale.set(0.34, 3.4 - y, 0.34); res.position.set(0.5, y + (3.4 - y) / 2, 0); costGroup.add(res); costSegs.push({ m: res, y0: y, h: 3.4 - y })
  }

  // ── MARKET: roads, neighbouring blocks, comparables, heat ────────────────
  const roadMat = track(matStd(NAVY, 0.95, 0)); const roadLineMat = track(matFlat(WHITE, 0.0))
  const roads: THREE.Group[] = []
  for (const off of [-5.7, 5.7, -13, 13]) for (const axis of ['x', 'z'] as const) {
    const g = new THREE.Group(); const L = 34
    const r = new THREE.Mesh(box, roadMat); r.scale.set(axis === 'x' ? L : 1.15, 0.03, axis === 'x' ? 1.15 : L); g.add(r)
    for (let k = -7; k <= 7; k++) { const d = new THREE.Mesh(box, roadLineMat); d.scale.set(axis === 'x' ? 0.7 : 0.05, 0.032, axis === 'x' ? 0.05 : 0.7); d.position.set(axis === 'x' ? k * 2.3 : 0, 0.002, axis === 'x' ? 0 : k * 2.3); g.add(d) }
    g.position.set(axis === 'x' ? 0 : off, -0.3, axis === 'x' ? off : 0); root.add(g); roads.push(g)
  }
  const nbMat = track(matStd(NAVY_MID, 0.55, 0.15)); const nbLine = track(matLine(LAVENDER, 0.0))
  const neighbours: { m: THREE.Group; h: number; i: number; comp: boolean }[] = []
  const cells = [[-9.35, 0], [9.35, 0], [0, -9.35], [0, 9.35], [-9.35, -9.35], [9.35, -9.35], [-9.35, 9.35], [9.35, 9.35]]
  let ni = 0
  for (const [cx, cz] of cells) for (const o of [-1.5, 1.5]) {
    const seed = Math.abs(Math.sin((ni + 1) * 12.9898) * 43758.5453) % 1
    const h = 0.9 + seed * (Math.hypot(cx, cz) > 12 ? 2.0 : 3.1)
    const g = new THREE.Group()
    const w = 1.9 + ((seed * 7) % 1) * 0.5
    const m = new THREE.Mesh(box, nbMat); m.scale.set(w, h, w); m.position.y = h / 2; m.castShadow = true; m.receiveShadow = true; g.add(m)
    const e = new THREE.LineSegments(track(new THREE.EdgesGeometry(box)), nbLine); e.scale.copy(m.scale); e.position.copy(m.position); g.add(e)
    const horizontal = cz === 0 || Math.abs(cx) > Math.abs(cz)
    g.position.set(cx + (horizontal ? 0 : o), -0.3, cz + (horizontal ? o : 0))
    root.add(g); neighbours.push({ m: g, h, i: ni, comp: false }); ni++
  }
  // Comparables: three neighbours, outlined in lavender with a price-marker pin.
  const compIdx = [2, 5, 10]
  const compMat = track(matLine(LAVENDER, 0)); const pinMat = track(new THREE.MeshStandardMaterial({ color: LAVENDER, emissive: PURPLE_LIGHT, emissiveIntensity: 0.9, roughness: 0.35 }))
  const pins: THREE.Group[] = []
  const pinHead = track(new THREE.SphereGeometry(0.2, 16, 16)), pinStem = track(new THREE.CylinderGeometry(0.02, 0.02, 1, 8))
  for (const ci of compIdx) {
    const n = neighbours[ci]; n.comp = true
    const outline = new THREE.LineSegments(track(new THREE.EdgesGeometry(box)), compMat); outline.scale.copy((n.m.children[0] as THREE.Mesh).scale).multiplyScalar(1.02); outline.position.copy(n.m.children[0].position); n.m.add(outline)
    const pin = new THREE.Group(); pin.position.set(n.m.position.x, -0.3 + n.h + 0.2, n.m.position.z)
    const stem = new THREE.Mesh(pinStem, pinMat); stem.position.y = 0.5; pin.add(stem)
    const head = new THREE.Mesh(pinHead, pinMat); head.position.y = 1.1; pin.add(head)
    root.add(pin); pins.push(pin)
  }
  const heatTex = track(radialTexture('rgba(124,95,255,0.55)', 'rgba(124,95,255,0)'))
  const heatTeal = track(radialTexture('rgba(45,212,191,0.5)', 'rgba(45,212,191,0)'))
  const heats = [[-9.3, 1, heatTex, 5.2], [9.3, 9.4, heatTeal, 4.6], [-2, -9.4, heatTex, 4]].map(([x, z, tex, r]: any) => {
    const mt = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    const m = new THREE.Mesh(track(new THREE.CircleGeometry(r, 40)), mt); m.rotation.x = -Math.PI / 2; m.position.set(x, -0.27, z); root.add(m); return { m, mt }
  })

  // ── FINANCE ──────────────────────────────────────────────────────────────
  // Buyer side: a ring of instalment bars, one tall deposit then a steady schedule.
  const payGroup = new THREE.Group(); root.add(payGroup)
  const payMat = track(new THREE.MeshStandardMaterial({ color: TEAL_LIGHT, emissive: TEAL, emissiveIntensity: 0.5, roughness: 0.4 }))
  const depMat = track(new THREE.MeshStandardMaterial({ color: WHITE, emissive: LAVENDER, emissiveIntensity: 0.35, roughness: 0.4 }))
  const payBars: { m: THREE.Mesh; h: number }[] = []
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12, R = 3.2, h = k === 0 ? 1.4 : 0.5
    const m = new THREE.Mesh(box, k === 0 ? depMat : payMat); m.scale.set(0.3, h, 0.3); m.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R); m.castShadow = true; payGroup.add(m); payBars.push({ m, h })
  }
  const payRingMat = track(matLine(TEAL_LIGHT, 0))
  { const pts: THREE.Vector3[] = []; for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * 3.2, 0.02, Math.sin(a) * 3.2)) }
    payGroup.add(new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints(pts)), payRingMat)) }
  // Development / investment side: a floating ring with four pathway nodes, joined to the building.
  const pathGroup = new THREE.Group(); pathGroup.position.y = roofTopY + 1.7; root.add(pathGroup)
  const pathRingMat = track(new THREE.MeshBasicMaterial({ color: LAVENDER, transparent: true, opacity: 0, depthWrite: false }))
  pathGroup.add(new THREE.Mesh(track(new THREE.TorusGeometry(2.7, 0.025, 8, 96)), pathRingMat)); pathGroup.children[0].rotation.x = Math.PI / 2
  const nodeGeo = track(new THREE.IcosahedronGeometry(0.2, 1))
  const nodeMat = track(new THREE.MeshStandardMaterial({ color: LAVENDER, emissive: PURPLE_LIGHT, emissiveIntensity: 0.9, roughness: 0.3 }))
  const pathNodes: THREE.Mesh[] = []
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.6; const n = new THREE.Mesh(nodeGeo, nodeMat); n.position.set(Math.cos(a) * 2.7, 0, Math.sin(a) * 2.7); pathGroup.add(n); pathNodes.push(n) }

  // ── DECISION ─────────────────────────────────────────────────────────────
  const beamMat = track(new THREE.MeshBasicMaterial({ color: TEAL_LIGHT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
  const beam = new THREE.Mesh(track(new THREE.CylinderGeometry(0.05, 1.1, 9, 32, 1, true)), beamMat); beam.position.y = roofTopY + 4.5; root.add(beam)
  const haloMat = track(new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
  const halo = new THREE.Mesh(track(new THREE.TorusGeometry(1.15, 0.03, 8, 64)), haloMat); halo.rotation.x = Math.PI / 2; halo.position.y = roofTopY + 1; root.add(halo)
  // Five information layers, one node each, each linked to the thing it summarises.
  const layerDefs: { key: string; col: number; pos: [number, number, number]; from: () => THREE.Vector3 }[] = [
    { key: 'l_site', col: TEAL_LIGHT, pos: [-5.6, 4.6, -5.6], from: () => new THREE.Vector3(-4, 0.4, -4) },
    { key: 'l_dev', col: PURPLE_LIGHT, pos: [-5.2, 6.0, 3.6], from: () => new THREE.Vector3(-1.4, 3.0, 1.6) },
    { key: 'l_market', col: LAVENDER, pos: [7.2, 5.2, 7.4], from: () => new THREE.Vector3(pins[0].position.x, pins[0].position.y + 1.1, pins[0].position.z) },
    { key: 'l_fin', col: TEAL, pos: [5.2, 6.4, -5.4], from: () => new THREE.Vector3(0, 0, 0) },
    { key: 'l_risk', col: WHITE, pos: [0, 9.4, 0], from: () => new THREE.Vector3(0, roofTopY, 0) },
  ]
  const layerNodes = layerDefs.map(d => {
    const m = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.26, 0)), track(new THREE.MeshStandardMaterial({ color: d.col, emissive: d.col, emissiveIntensity: 0.8, roughness: 0.3, transparent: true, opacity: 0 })))
    m.position.set(...d.pos); root.add(m); return { ...d, m }
  })

  // ── Relationship lines ───────────────────────────────────────────────────
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3()
  function makeLinks(pairs: (() => [THREE.Vector3, THREE.Vector3])[], col: number) {
    const geo = track(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3))
    const mat = track(matLine(col, 0)); const ls = new THREE.LineSegments(geo, mat); ls.frustumCulled = false; root.add(ls)
    return { ls, mat, update() { const a = geo.attributes.position as THREE.BufferAttribute; pairs.forEach((fn, i) => { const [p, q] = fn(); a.setXYZ(i * 2, p.x, p.y, p.z); a.setXYZ(i * 2 + 1, q.x, q.y, q.z) }); a.needsUpdate = true } }
  }
  const bldgCore = new THREE.Vector3(0, roofTopY * 0.6, 0)
  const worldOf = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) }
  const finLinks = makeLinks(pathNodes.map(n => () => [worldOf(n), new THREE.Vector3(0, roofTopY, 0)] as [THREE.Vector3, THREE.Vector3]), LAVENDER)
  const costLink = makeLinks([() => [new THREE.Vector3(3.4 + 0.25, 3.5, -3.1), new THREE.Vector3(0, roofTopY * 0.7, 0)]], TEAL_LIGHT)
  const allLinks = makeLinks(layerNodes.map(n => () => { tmpA.copy(n.m.position); tmpB.copy(n.from()); return [tmpA.clone(), tmpB.clone()] as [THREE.Vector3, THREE.Vector3] }), WHITE)
  const upLinks = makeLinks(layerNodes.map(n => () => [n.m.position.clone(), new THREE.Vector3(0, roofTopY + 1, 0)] as [THREE.Vector3, THREE.Vector3]), TEAL_LIGHT)

  // ── Anchors (world positions the HTML overlay lines attach to) ───────────
  const anchorPos: Record<string, THREE.Vector3 | (() => THREE.Vector3)> = {
    s1: new THREE.Vector3(4, 0.5, -4), s2: new THREE.Vector3(2.2, 3.0, -2.2), s3: new THREE.Vector3(1.8, 2.6, -1.7),
    s4: new THREE.Vector3(3.9, 3.4, -3.1), s5: () => new THREE.Vector3(pins[1].position.x, pins[1].position.y + 1.1, pins[1].position.z),
    s6: () => worldOf(pathNodes[0]), s7: new THREE.Vector3(0, roofTopY + 1, 0),
    f_pay: new THREE.Vector3(3.2, 0.6, 0.2), f_path: () => worldOf(pathNodes[2]),
  }
  for (const n of layerNodes) anchorPos[n.key] = n.m.position

  // ── The per-progress update ──────────────────────────────────────────────
  let cur = 0, target = 0, W = 1, H = 1
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3()

  function update(p: number) {
    // Ground & site
    const g = win(p, 0, 0.05)
    slabMat.opacity = g; slab.position.y = -0.17 - (1 - g) * 1.4
    plotMat.opacity = g; fadeDisc.material.opacity = g
    gridMat.opacity = 0.22 * win(p, 0.03, 0.1) * (1 - win(p, 0.3, 0.42) * 0.6)
    walls.forEach((w, i) => { w.scale.x = Math.max(0.0001, win(p, 0.02 + i * 0.022, 0.06 + i * 0.022)); w.visible = w.scale.x > 0.001 })
    posts.forEach((m, i) => { const s = win(p, 0.04 + i * 0.02, 0.09 + i * 0.02); m.scale.y = Math.max(0.0001, s); m.position.y = 0.4 * s })
    contourMat.opacity = 0.28 * win(p, 0.06, 0.14) * (1 - win(p, 0.58, 0.7) * 0.7)

    // Site Studio
    const st = win(p, 0.145, 0.2)
    dashMat.opacity = 0.9 * st * (1 - win(p, 0.37, 0.43)); footMat.opacity = 0.2 * st * (1 - win(p, 0.3, 0.38))
    envMat.opacity = 0.65 * st * (1 - win(p, 0.37, 0.44))
    ghosts.forEach((gh, i) => { const o = bump(p, 0.19 + i * 0.03, 0.235 + i * 0.03); gh.fm.opacity = 0.14 * o; gh.lm.opacity = 0.85 * o; gh.g.visible = o > 0.001 })

    // Building
    floors.forEach((f, i) => {
      const a = 0.29 + i * 0.0145, s = win(p, a, a + 0.035)
      f.grp.scale.y = Math.max(0.0001, s); f.grp.visible = s > 0.001
    })
    const roofS = win(p, 0.405, 0.43); roof.scale.y = 0.1 * Math.max(0.001, roofS); roof.visible = roofS > 0.01
    // Construction appraisal: a scan sweeps up the building; scanned floors are traced in teal
    const sweep = win(p, 0.455, 0.55), scanY = lerp(0, roofTopY, sweep)
    const scanOn = win(p, 0.44, 0.46) * (1 - win(p, 0.55, 0.575))
    scanMat.opacity = 0.2 * scanOn; (scanEdge.material as THREE.LineBasicMaterial).opacity = 0.9 * scanOn
    scan.position.y = scanY + 0.01; scanEdge.position.y = scanY + 0.01
    const dev = win(p, 0.86, 0.98)
    floors.forEach(f => {
      const k = clamp((scanY - (f.top - FH)) / FH) * win(p, 0.45, 0.47)
      f.ringMat.opacity = 0.9 * k * (1 - win(p, 0.6, 0.66) * 0.75)
      f.glassMat.emissiveIntensity = 0.12 + 0.5 * k * (1 - win(p, 0.6, 0.7)) + 0.9 * dev
    })
    roofLine.material.opacity = 0.9 * win(p, 0.54, 0.57) * (1 - win(p, 0.62, 0.7) * 0.6)
    // Crane
    const cr = win(p, 0.425, 0.475) * (1 - win(p, 0.56, 0.62))
    crane.scale.set(1, Math.max(0.0001, cr), 1); crane.visible = cr > 0.002
    jib.rotation.y = Math.sin(p * 60) * 0.35 + 0.9
    // Cost columns
    costSegs.forEach((s, i) => { const a = 0.485 + i * 0.012, k = win(p, a, a + 0.035); s.m.scale.y = Math.max(0.0001, s.h * k); s.m.position.y = (s.y0 + s.h * k / 2) })
    costGroup.visible = p > 0.48

    // Market
    roads.forEach((r, i) => { const s2 = win(p, 0.56 + (i % 4) * 0.012, 0.62 + (i % 4) * 0.012); r.visible = s2 > 0.001; r.position.y = -0.3 - (1 - s2) * 0.25 })
    roadLineMat.opacity = 0.32 * win(p, 0.6, 0.66)
    neighbours.forEach(n => {
      const a = 0.575 + n.i * 0.0065, s = win(p, a, a + 0.04)
      n.m.scale.y = Math.max(0.0001, s); n.m.visible = s > 0.001
    })
    nbLine.opacity = 0.35 * win(p, 0.62, 0.68)
    compMat.opacity = 0.95 * win(p, 0.65, 0.7)
    pins.forEach((pn, i) => { const s = win(p, 0.66 + i * 0.012, 0.71 + i * 0.012); pn.scale.setScalar(Math.max(0.0001, s)); pn.visible = s > 0.002 })
    heats.forEach((h, i) => { h.mt.opacity = win(p, 0.62 + i * 0.01, 0.7) * (1 - win(p, 0.86, 0.95) * 0.5) })

    // Finance
    payRingMat.opacity = 0.7 * win(p, 0.715, 0.75)
    payBars.forEach((b, i) => { const a = 0.72 + i * 0.006, s = win(p, a, a + 0.03); b.m.scale.y = Math.max(0.0001, b.h * s); b.m.position.y = b.h * s / 2 })
    pathRingMat.opacity = 0.75 * win(p, 0.77, 0.82)
    const pn = win(p, 0.78, 0.84)
    pathNodes.forEach((n, i) => n.scale.setScalar(Math.max(0.0001, win(p, 0.78 + i * 0.01, 0.82 + i * 0.01))))
    pathGroup.visible = pn > 0.001 || p > 0.77; pathGroup.rotation.y = p * 4.2
    finLinks.update(); finLinks.mat.opacity = 0.55 * win(p, 0.82, 0.86)
    costLink.update(); costLink.mat.opacity = 0.5 * win(p, 0.8, 0.86)
    pointLights(p)

    // Decision
    allLinks.update(); allLinks.mat.opacity = 0.45 * win(p, 0.88, 0.95)
    upLinks.update(); upLinks.mat.opacity = 0.35 * win(p, 0.9, 0.97)
    layerNodes.forEach((n, i) => { const s = win(p, 0.87 + i * 0.012, 0.92 + i * 0.012); (n.m.material as THREE.MeshStandardMaterial).opacity = s; n.m.scale.setScalar(Math.max(0.0001, s)); n.m.rotation.y = p * 8 + i })
    beamMat.opacity = 0.22 * win(p, 0.9, 0.98); haloMat.opacity = 0.7 * win(p, 0.9, 0.98)
    halo.scale.setScalar(1 + 0.08 * Math.sin(p * 40))

    // Camera: keyframes per stage with easing, plus a slow turn around the site
    const f = clamp(p) * 7 - 0.5, i0 = clamp(Math.floor(f), 0, 6), i1 = Math.min(6, i0 + 1), t = f < 0 ? 0 : sm(clamp(f - i0))
    camPos.set(lerp(CAM[i0].p[0], CAM[i1].p[0], t), lerp(CAM[i0].p[1], CAM[i1].p[1], t), lerp(CAM[i0].p[2], CAM[i1].p[2], t))
    camTgt.set(lerp(CAM[i0].t[0], CAM[i1].t[0], t), lerp(CAM[i0].t[1], CAM[i1].t[1], t), lerp(CAM[i0].t[2], CAM[i1].t[2], t))
    const ang = (p - 0.5) * 0.5
    const dx = camPos.x - camTgt.x, dz = camPos.z - camTgt.z
    camPos.x = camTgt.x + dx * Math.cos(ang) - dz * Math.sin(ang); camPos.z = camTgt.z + dx * Math.sin(ang) + dz * Math.cos(ang)
    const zoom = W < H ? 1.5 : W < 900 ? 1.4 : 1.3
    camPos.sub(camTgt).multiplyScalar(zoom).add(camTgt)
    camera.position.copy(camPos); camera.lookAt(camTgt)
  }
  function pointLights(p: number) {
    rim.intensity = 30 * win(p, 0.7, 0.9); glow.intensity = 55 * win(p, 0.86, 0.98)
  }

  update(0); renderer.compile(scene, camera)

  function resize(w: number, h: number) {
    W = Math.max(1, w); H = Math.max(1, h)
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.fov = W / H < 0.9 ? 44 : 34
    // On wide screens the text panel sits over the right of the canvas, so shift the picture left to keep the building clear of it.
    if (W >= 900) camera.setViewOffset(W, H, W * 0.12, 0, W, H); else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }
  const v = new THREE.Vector3()
  return {
    setProgress(p) { target = clamp(p) },
    jump(p) { cur = target = clamp(p); update(cur); renderer.render(scene, camera) },
    resize,
    frame(dt) {
      const d = target - cur
      if (Math.abs(d) > 0.0004) { cur += d * Math.min(1, dt * 7); update(cur); renderer.render(scene, camera); return true }
      if (cur !== target) { cur = target; update(cur); renderer.render(scene, camera) }
      return false
    },
    project(name) {
      const a = anchorPos[name]; if (!a) return { x: 0, y: 0, visible: false }
      v.copy(typeof a === 'function' ? a() : a).project(camera)
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, visible: v.z < 1 }
    },
    dispose() { scene.traverse((o: any) => { if (o.geometry) o.geometry.dispose?.() }); disposables.forEach(d => { try { d.dispose() } catch { /* ignore */ } }); renderer.forceContextLoss() },
  }
}