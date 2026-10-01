'use client'
// components/ScenarioMap.tsx
//
// Site Studio's spatial canvas. Controlled from the top toolbar now
// (is3D, mapStyle) rather than owning its own floating buttons — the
// product evolution directive asks for map controls to live in a
// proper toolbar, not scattered overlay buttons. Still built on the
// same Mapbox instance the rest of MANOP uses: fill-extrusion for
// "3D," no new mapping/3D library, one scenario object driving both
// views.
//
// Geometry honesty rule, unchanged from the first version: a site
// with no confirmed boundary shows a point (or nothing) and says so.
// The indicative footprint is always a generated shape representing
// a scenario assumption, and is styled distinctly (dashed purple)
// from the real teal boundary so the two are never visually confused.

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveSiteCenter, buildIndicativeFootprintPolygon, buildIndicativeParkingPolygon, computeDrawnPolygonAreaSqm, computeDistanceMeters, translatePolygon, metersPerDegreeLng } from '../lib/scenario-geometry'
import { LAYER_CATEGORY_COLOR } from '../lib/site-intelligence'
import {
  buildScenarioSpatialModel, ScenarioSpatialModel,
  modelToBuildingsFeatureCollection, modelToOpenSpacesFeatureCollection,
  modelToParkingFeatureCollection, modelToIntelligenceLayersFeatureCollection,
  modelToMassingBuildings, modelToMassingOpenSpaces, modelToMassingParking,
} from '../lib/scenario-spatial-model'

const METERS_PER_DEGREE_LAT = 111_320

export type MapStyleMode = 'map' | 'satellite'
export type DrawMode = 'none' | 'draw-site' | 'draw-building' | 'draw-open-space' | 'measure'

export interface BuildingFeature {
  id: string
  label: string
  footprint_sqm: number | null
  storeys: number | null
  height_m: number | null
  geojson: GeoJSON.Polygon
}

export interface OpenSpaceFeature {
  id: string
  label: string
  geojson: GeoJSON.Polygon
}

export interface ScenarioMapProps {
  lat: number | null
  lng: number | null
  boundary: GeoJSON.Polygon | null
  exploratoryBoundary?: GeoJSON.Polygon | null
  footprintSqm: number | null
  heightM: number | null
  height?: number | string
  dark?: boolean
  is3D: boolean
  mapStyle: MapStyleMode
  showBoundary?: boolean
  showFootprint?: boolean
  drawMode?: DrawMode
  onDrawFinish?: (polygon: GeoJSON.Polygon, areaSqm: number) => void
  onDrawBuildingFinish?: (polygon: GeoJSON.Polygon, areaSqm: number) => void
  onDrawOpenSpaceFinish?: (polygon: GeoJSON.Polygon, areaSqm: number) => void
  buildings?: BuildingFeature[]
  openSpaces?: OpenSpaceFeature[]
  developmentCategory?: string
  /** Indicative parking spaces from the scenario's current readings
   * (e.g. indicative_parking_count). Renders as a generated preview
   * area, never a placed/editable object — see buildIndicativeParkingPolygon. */
  indicativeParkingStallCount?: number | null
  /** Real Site Intelligence evidence layers with resolved geometry —
   * see lib/site-intelligence.ts's resolveLayerGeometry. Only layers
   * that ALREADY have real geometry in value_data reach this prop;
   * the caller (studio page) filters out anything unresolvable, so
   * this component never has to decide what counts as "real" — it
   * only ever draws what it's given. */
  intelligenceLayers?: { id: string; category: string; label: string; geometry: GeoJSON.Geometry }[]
  /** Verification aid: draws a north (red) / east (blue) marker at the site origin
   * in the 3D layer, built from the same local frame as the massing. */
  showOrientationMarker?: boolean
  /** Optional REAL-world context: the building footprints/heights already in the
   * Mapbox style (OpenStreetMap-derived). Third-party data, coverage varies by
   * area — it complements the satellite/map evidence layer, never replaces it. */
  showContextBuildings?: boolean
  selectedBuildingId?: string | null
  onSelectBuilding?: (id: string | null) => void
  onBuildingMoved?: (id: string, polygon: GeoJSON.Polygon) => void
}

function styleUrl(mode: MapStyleMode, dark: boolean): string {
  if (mode === 'satellite') return 'mapbox://styles/mapbox/satellite-streets-v12'
  return dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/light-v11'
}

export default function ScenarioMap({
  lat, lng, boundary, exploratoryBoundary = null, footprintSqm, heightM, height = '100%', dark = true,
  is3D, mapStyle, showBoundary = true, showFootprint = true,
  drawMode = 'none', onDrawFinish, onDrawBuildingFinish, onDrawOpenSpaceFinish,
  buildings = [], openSpaces = [], selectedBuildingId = null, onSelectBuilding, onBuildingMoved,
  developmentCategory = 'multifamily_residential', indicativeParkingStallCount = null,
  intelligenceLayers = [], showOrientationMarker = false, showContextBuildings = false,
}: ScenarioMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('mapbox-gl').Map | null>(null)
  const threeLayerRef = useRef<import('./ThreeMassingLayer').ThreeMassingLayer | null>(null)
  // Typed as the DEFAULT export's type specifically, not the module
  // namespace (`typeof import('mapbox-gl')`). mapbox-gl ships an
  // `export =` (CommonJS-style) module: its type declarations expose
  // one real default-exported object (the mapboxgl namespace with
  // Map/Marker/NavigationControl/LngLatBounds etc. as static members)
  // plus a long list of separately-exported TYPES (MapMouseEvent,
  // GeoJSONSource, TargetFeature, ...) that only exist as named type
  // exports, never as properties on the runtime default object. Typing
  // this ref as `typeof import('mapbox-gl')` (the whole namespace)
  // demands all of those type-only exports as if they were runtime
  // properties too — which `await import('mapbox-gl')).default`
  // structurally can never satisfy, hence TS2740. Typing it as
  // `typeof import('mapbox-gl').default` matches what's actually
  // assigned at runtime.
  const mapboxRef = useRef<typeof import('mapbox-gl').default | null>(null)

  const center = resolveSiteCenter(lat, lng, boundary)
  const footprintPolygon = center && footprintSqm != null ? buildIndicativeFootprintPolygon(center, footprintSqm) : null
  const centerLat = center?.lat, centerLng = center?.lng
  const parkingPolygon = useMemo(
    () => (centerLat != null && centerLng != null && indicativeParkingStallCount)
      ? buildIndicativeParkingPolygon({ lat: centerLat, lng: centerLng }, indicativeParkingStallCount)
      : null,
    [centerLat, centerLng, indicativeParkingStallCount],
  )

  // ONE spatial model — the single object every 2D source and the 3D
  // scene are projected from (see lib/scenario-spatial-model.ts). Nothing
  // below re-derives geometry from the raw buildings/openSpaces/parking
  // props any more; each view calls a pure modelTo*() projector on this.
  const spatialModel: ScenarioSpatialModel = useMemo(() => buildScenarioSpatialModel({
    buildings, openSpaces,
    parkingPolygon, parkingStallCount: indicativeParkingStallCount,
    intelligenceLayers,
    developmentCategory,
    selectedBuildingId,
  }), [buildings, openSpaces, parkingPolygon, indicativeParkingStallCount, intelligenceLayers, developmentCategory, selectedBuildingId])
  // addLayers/drag handlers run from long-lived map callbacks; a ref keeps
  // them reading the CURRENT model rather than the one from mount.
  const spatialModelRef = useRef(spatialModel)
  spatialModelRef.current = spatialModel
  const showOrientationMarkerRef = useRef(showOrientationMarker)
  showOrientationMarkerRef.current = showOrientationMarker
  const showContextBuildingsRef = useRef(showContextBuildings)
  showContextBuildingsRef.current = showContextBuildings

  /** Pushes the current spatial model into the Three.js layer. Used by the
   * live-sync effect AND right after the layer is created: the layer is created
   * asynchronously (dynamic import), so the first sync effect used to run while
   * threeLayerRef was still null and return — leaving the 3D layer empty after a
   * reload until something else changed the model. */
  function syncThreeLayer(layer: import('./ThreeMassingLayer').ThreeMassingLayer, model: ScenarioSpatialModel) {
    layer.setScene(modelToMassingBuildings(model), modelToMassingOpenSpaces(model))
    const parking = modelToMassingParking(model)
    layer.setParking(parking.points, parking.stallCount)
    layer.setOrientationMarker(showOrientationMarkerRef.current)
  }

  /** Real-world building context from the base style's own data. Added beneath the
   * MANOP massing layer so scenario buildings always read on top. No-op if the
   * current style has no 'composite' building source. */
  function applyContextBuildings(map: import('mapbox-gl').Map, visible: boolean) {
    const id = 'context-buildings'
    if (!visible) { if (map.getLayer(id)) map.removeLayer(id); return }
    if (map.getLayer(id) || !map.getSource('composite')) return
    map.addLayer({
      id, type: 'fill-extrusion', source: 'composite', 'source-layer': 'building', minzoom: 14,
      filter: ['==', ['get', 'extrude'], 'true'],
      paint: {
        'fill-extrusion-color': '#94A3B8', 'fill-extrusion-opacity': 0.5,
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
      },
    }, map.getLayer('three-massing-layer') ? 'three-massing-layer' : undefined)
  }

  function addLayers(map: import('mapbox-gl').Map) {
    if (!center) return

    ensureFacadePatterns(map)

    if (boundary && showBoundary) {
      if (!map.getSource('site-boundary')) {
        map.addSource('site-boundary', { type: 'geojson', data: { type: 'Feature', geometry: boundary, properties: {} } })
        map.addLayer({ id: 'site-boundary-fill', type: 'fill', source: 'site-boundary', paint: { 'fill-color': '#0D9488', 'fill-opacity': 0.10 } })
        map.addLayer({ id: 'site-boundary-line', type: 'line', source: 'site-boundary', paint: { 'line-color': '#0D9488', 'line-width': 2 } })
      }
    } else if (!boundary && mapboxRef.current) {
      new mapboxRef.current.Marker({ color: '#0D9488' }).setLngLat([center.lng, center.lat]).addTo(map)
    }

    if (footprintPolygon && showFootprint) {
      if (!map.getSource('scenario-footprint')) {
        map.addSource('scenario-footprint', {
          type: 'geojson',
          data: { type: 'Feature', geometry: footprintPolygon, properties: { height: heightM ?? 0, base: 0 } },
        })
        map.addLayer({ id: 'scenario-footprint-fill', type: 'fill', source: 'scenario-footprint', paint: { 'fill-color': '#6D28D9', 'fill-opacity': 0.25 } })
        map.addLayer({ id: 'scenario-footprint-line', type: 'line', source: 'scenario-footprint', paint: { 'line-color': '#6D28D9', 'line-width': 2, 'line-dasharray': [2, 1] } })
        map.addLayer({
          id: 'scenario-footprint-extrusion', type: 'fill-extrusion', source: 'scenario-footprint',
          layout: { visibility: is3D ? 'visible' : 'none' },
          paint: { 'fill-extrusion-color': '#6D28D9', 'fill-extrusion-pattern': 'facade-purple', 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-opacity': 0.92 },
        })
      }
    }

    if (exploratoryBoundary) {
      if (!map.getSource('exploratory-boundary')) {
        map.addSource('exploratory-boundary', { type: 'geojson', data: { type: 'Feature', geometry: exploratoryBoundary, properties: {} } })
        map.addLayer({ id: 'exploratory-boundary-fill', type: 'fill', source: 'exploratory-boundary', paint: { 'fill-color': '#F59E0B', 'fill-opacity': 0.08 } })
        map.addLayer({ id: 'exploratory-boundary-line', type: 'line', source: 'exploratory-boundary', paint: { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [3, 2] } })
      }
    }

    // Indicative parking area — a generated preview sized from the
    // scenario's current "Indicative Parking" reading, exactly like
    // scenario-footprint above: styled distinctly (slate, dashed,
    // no extrusion) so it's never mistaken for a building or a real
    // placed object. There is no persisted parking scenario_elements
    // row yet — see the Site Studio audit's "Parking spatialisation"
    // finding — so this is deliberately a preview only.
    if (!map.getSource('scenario-parking')) {
      map.addSource('scenario-parking', { type: 'geojson', data: modelToParkingFeatureCollection(spatialModelRef.current) })
      map.addLayer({ id: 'scenario-parking-fill', type: 'fill', source: 'scenario-parking', paint: { 'fill-color': '#475569', 'fill-opacity': 0.2 } })
      map.addLayer({ id: 'scenario-parking-line', type: 'line', source: 'scenario-parking', paint: { 'line-color': '#475569', 'line-width': 1.5, 'line-dasharray': [1, 1.5] } })
    }

    // Site Intelligence spatial layer toggles — draws ONLY layers the
    // caller has already resolved real geometry for (see
    // resolveLayerGeometry in lib/site-intelligence.ts); this source
    // starts empty and is kept live by the sync effect below, since
    // layers toggle on/off interactively rather than being fixed at
    // map creation like the boundary/footprint previews above.
    if (!map.getSource('intelligence-layers')) {
      map.addSource('intelligence-layers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'intelligence-layers-fill', type: 'fill', source: 'intelligence-layers',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
      })
      map.addLayer({
        id: 'intelligence-layers-line', type: 'line', source: 'intelligence-layers',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'LineString']]],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      })
      map.addLayer({
        id: 'intelligence-layers-point', type: 'circle', source: 'intelligence-layers',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-color': ['get', 'color'], 'circle-radius': 6, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 },
      })
    }

    // "Green land" — real open-space objects (Draw Open Space).
    // Simpler than buildings on purpose for V1: rendered and
    // deletable, not yet select/move/resize/rotate — open space is
    // usually a residual shape (whatever isn't building or access),
    // not something manipulated the same way a building is.
    if (!map.getSource('open-spaces')) {
      map.addSource('open-spaces', { type: 'geojson', data: modelToOpenSpacesFeatureCollection(spatialModelRef.current) })
      map.addLayer({ id: 'open-spaces-fill', type: 'fill', source: 'open-spaces', paint: { 'fill-color': '#22C55E', 'fill-opacity': 0.25 } })
      map.addLayer({ id: 'open-spaces-line', type: 'line', source: 'open-spaces', paint: { 'line-color': '#22C55E', 'line-width': 2 } })
    }

  // Building facade texture — a real repeating window-grid pattern
  // applied via Mapbox's fill-extrusion-pattern paint property (not
  // a screenshot trick — an actual GL texture on the extruded wall
  // faces). This is the honest ceiling of what a fill-extrusion
  // layer can show without moving to a full 3D engine (Three.js/
  // deck.gl), which every prior directive here has deliberately
  // ruled out as overbuilding for V1. Two variants — purple
  // (default) and amber (selected) — registered once, picked
  // per-feature via a data expression, same pattern the color paint
  // properties already used.
  function ensureFacadePatterns(map: import('mapbox-gl').Map) {
    const make = (baseHex: string, windowHex: string): ImageData => {
      const size = 32
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = baseHex
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = windowHex
      const cell = size / 4
      const pad = cell * 0.22
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          ctx.fillRect(col * cell + pad, row * cell + pad, cell - pad * 2, cell - pad * 2)
        }
      }
      return ctx.getImageData(0, 0, size, size)
    }

    if (!map.hasImage('facade-purple')) map.addImage('facade-purple', make('#4C1D95', '#A78BFA'), { pixelRatio: 2 })
    if (!map.hasImage('facade-amber')) map.addImage('facade-amber', make('#92400E', '#FCD34D'), { pixelRatio: 2 })
  }

  // Real building objects (Phase D) — one source for all of them,
    // selection/height driven by feature properties so a single
    // paint expression handles every building without per-building
    // layers.
    if (!map.getSource('buildings')) {
      map.addSource('buildings', { type: 'geojson', data: modelToBuildingsFeatureCollection(spatialModelRef.current) })
      map.addLayer({
        id: 'buildings-fill', type: 'fill', source: 'buildings',
        paint: { 'fill-color': ['case', ['get', 'selected'], '#F59E0B', '#6D28D9'], 'fill-opacity': 0.3 },
      })
      map.addLayer({
        id: 'buildings-line', type: 'line', source: 'buildings',
        paint: { 'line-color': ['case', ['get', 'selected'], '#F59E0B', '#6D28D9'], 'line-width': ['case', ['get', 'selected'], 3, 2] },
      })
      map.addLayer({
        id: 'buildings-extrusion', type: 'fill-extrusion', source: 'buildings',
        layout: { visibility: is3D ? 'visible' : 'none' },
        paint: {
          'fill-extrusion-color': ['case', ['get', 'selected'], '#F59E0B', '#6D28D9'],
          'fill-extrusion-pattern': ['case', ['get', 'selected'], 'facade-amber', 'facade-purple'],
          'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92,
        },
      })
    }

    if (boundary) {
      const coords = boundary.coordinates[0]
      const bounds = coords.reduce(
        (b, c) => b.extend(c as [number, number]),
        new mapboxRef.current!.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
      )
      map.fitBounds(bounds, { padding: 60, maxZoom: 19 })
    }
  }

  // ── Draw Site / Measure — draft points live in React state (not a
  // ref) since the floating control bar needs to re-render on every
  // click to show a live area/distance readout. ────────────────────
  const [draftPoints, setDraftPoints] = useState<{ lat: number; lng: number }[]>([])

  useEffect(() => { setDraftPoints([]) }, [drawMode])

  function renderDraftSource(map: import('mapbox-gl').Map, points: { lat: number; lng: number }[]) {
    const coords = points.map(p => [p.lng, p.lat])
    const closingModes = drawMode === 'draw-site' || drawMode === 'draw-building' || drawMode === 'draw-open-space'
    const lineCoords = closingModes && coords.length >= 3 ? [...coords, coords[0]] : coords
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords }, properties: {} },
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: coords }, properties: {} },
      ],
    }
    const src = map.getSource('draft-draw') as import('mapbox-gl').GeoJSONSource | undefined
    if (src) src.setData(data)
    else {
      map.addSource('draft-draw', { type: 'geojson', data })
      map.addLayer({ id: 'draft-draw-line', type: 'line', source: 'draft-draw', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#F59E0B', 'line-width': 2 } })
      map.addLayer({ id: 'draft-draw-points', type: 'circle', source: 'draft-draw', filter: ['==', '$type', 'MultiPoint'], paint: { 'circle-color': '#F59E0B', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
    }
  }

  function clearDraftSource(map: import('mapbox-gl').Map) {
    const src = map.getSource('draft-draw') as import('mapbox-gl').GeoJSONSource | undefined
    if (src) src.setData({ type: 'FeatureCollection', features: [] })
  }

  // Click handler — attached/detached whenever drawMode changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || drawMode === 'none') return

    const handler = (e: import('mapbox-gl').MapMouseEvent) => {
      setDraftPoints(prev => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }])
    }
    map.on('click', handler)
    map.getCanvas().style.cursor = 'crosshair'
    return () => {
      map.off('click', handler)
      map.getCanvas().style.cursor = ''
    }
  }, [drawMode])

  // Redraw the draft line/points on every click, and reset the map
  // layer when the mode is turned off.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (drawMode === 'none') { clearDraftSource(map); return }
    renderDraftSource(map, draftPoints)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPoints, drawMode])

  const liveAreaSqm = (drawMode === 'draw-site' || drawMode === 'draw-building' || drawMode === 'draw-open-space') && draftPoints.length >= 3 ? computeDrawnPolygonAreaSqm(draftPoints) : null
  const liveDistanceM = drawMode === 'measure' && draftPoints.length >= 2
    ? draftPoints.slice(1).reduce((sum, p, i) => sum + computeDistanceMeters(draftPoints[i], p), 0)
    : null

  function finishDrawSite() {
    if (draftPoints.length < 3) return
    const ring = [...draftPoints.map(p => [p.lng, p.lat]), [draftPoints[0].lng, draftPoints[0].lat]]
    const polygon: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }
    const areaSqm = computeDrawnPolygonAreaSqm(draftPoints)
    if (drawMode === 'draw-site') onDrawFinish?.(polygon, areaSqm)
    else if (drawMode === 'draw-building') onDrawBuildingFinish?.(polygon, areaSqm)
    else if (drawMode === 'draw-open-space') onDrawOpenSpaceFinish?.(polygon, areaSqm)
    setDraftPoints([])
  }

  // ── Live sync: every Mapbox source and the Three.js scene is
  // projected from the ONE spatialModel above. Same trigger, several
  // targets — no view reconstructs geometry on its own any more. ─────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const setSrc = (id: string, data: GeoJSON.FeatureCollection) => {
      const src = map.getSource(id) as import('mapbox-gl').GeoJSONSource | undefined
      if (src) src.setData(data)
    }
    setSrc('buildings', modelToBuildingsFeatureCollection(spatialModel))
    setSrc('open-spaces', modelToOpenSpacesFeatureCollection(spatialModel))
    setSrc('scenario-parking', modelToParkingFeatureCollection(spatialModel))
    setSrc('intelligence-layers', modelToIntelligenceLayersFeatureCollection(
      spatialModel, cat => LAYER_CATEGORY_COLOR[cat as keyof typeof LAYER_CATEGORY_COLOR] || '#64748B',
    ))
  }, [spatialModel])

  // 3D projection of the same model. Every building currently shares
  // the scenario's development category — scenario_elements has no
  // per-building typology column (flagged in the audit; needs a
  // migration), so this stays one-category-per-scenario for now.
  useEffect(() => {
    const layer = threeLayerRef.current
    if (!layer) return
    syncThreeLayer(layer, spatialModel)
  }, [spatialModel])

  useEffect(() => { threeLayerRef.current?.setOrientationMarker(showOrientationMarker) }, [showOrientationMarker])

  useEffect(() => {
    const map = mapRef.current
    if (map && map.isStyleLoaded()) applyContextBuildings(map, showContextBuildings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContextBuildings])

  // ── Select / deselect a building by clicking it — only active when
  // not currently in a drawing mode. ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || drawMode !== 'none' || !onSelectBuilding) return

    const handler = (e: import('mapbox-gl').MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] })
      onSelectBuilding(features.length > 0 ? (features[0].properties?.id as string) : null)
    }
    map.on('click', handler)
    return () => { map.off('click', handler) }
  }, [drawMode, onSelectBuilding])

  // ── Drag-to-move the SELECTED building. mousedown on it starts a
  // drag (disables map panning for the duration), mousemove updates
  // a live local preview via setData, mouseup commits the final
  // polygon through onBuildingMoved. Drag state lives in a ref, not
  // React state, so mousemove never triggers a re-render mid-drag. ──
  const dragRef = useRef<{ id: string; original: GeoJSON.Polygon; lastLngLat: { lat: number; lng: number } } | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map || drawMode !== 'none' || !onBuildingMoved) return

    const onMouseDown = (e: import('mapbox-gl').MapMouseEvent) => {
      if (!selectedBuildingId) return
      const features = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] })
      const hit = features.find(f => f.properties?.id === selectedBuildingId)
      if (!hit) return
      const building = buildings.find(b => b.id === selectedBuildingId)
      if (!building) return

      e.preventDefault()
      map.dragPan.disable()
      dragRef.current = { id: selectedBuildingId, original: building.geojson, lastLngLat: { lat: e.lngLat.lat, lng: e.lngLat.lng } }

      const onMouseMove = (moveEvt: import('mapbox-gl').MapMouseEvent) => {
        if (!dragRef.current) return
        const dLatM = (moveEvt.lngLat.lat - dragRef.current.lastLngLat.lat) * METERS_PER_DEGREE_LAT
        const dLngM = (moveEvt.lngLat.lng - dragRef.current.lastLngLat.lng) * metersPerDegreeLng(moveEvt.lngLat.lat)
        const moved = translatePolygon(dragRef.current.original, dLatM, dLngM)
        dragRef.current.original = moved
        dragRef.current.lastLngLat = { lat: moveEvt.lngLat.lat, lng: moveEvt.lngLat.lng }
        const src = map.getSource('buildings') as import('mapbox-gl').GeoJSONSource | undefined
        if (src) {
          const m = spatialModelRef.current
          src.setData(modelToBuildingsFeatureCollection({
            ...m,
            buildings: m.buildings.map(b => b.id === dragRef.current!.id ? { ...b, geojson: moved } : b),
          }))
        }
      }

      const onMouseUp = () => {
        map.off('mousemove', onMouseMove)
        map.off('mouseup', onMouseUp)
        map.dragPan.enable()
        if (dragRef.current) {
          onBuildingMoved(dragRef.current.id, dragRef.current.original)
        }
        dragRef.current = null
      }

      map.on('mousemove', onMouseMove)
      map.on('mouseup', onMouseUp)
    }

    map.on('mousedown', 'buildings-fill', onMouseDown)
    return () => { map.off('mousedown', 'buildings-fill', onMouseDown) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawMode, selectedBuildingId, buildings, onBuildingMoved])

  // never on a style/3D toggle (those are handled below without
  // tearing the whole map down).
  useEffect(() => {
    if (!containerRef.current || !center) return
    let cancelled = false

    import('mapbox-gl').then((mapboxgl) => {
      if (cancelled || !containerRef.current) return
      mapboxRef.current = mapboxgl.default
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

      const map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: styleUrl(mapStyle, dark),
        center: [center.lng, center.lat],
        zoom: boundary ? 17 : 15,
        pitch: is3D ? 55 : 0,
        bearing: is3D ? -20 : 0,
        attributionControl: false,
      })
      mapRef.current = map
      map.on('load', () => {
        addLayers(map)
        // Real conceptual massing (floor bands, balconies, roof
        // forms, trees) via Three.js, rendered into this same GL
        // context — see ThreeMassingLayer.ts for why this is a real
        // bridge, not a second canvas. The flat fill-extrusion
        // layers stay in place for the 2D top-down view and for
        // click/drag hit-testing; this layer is what actually shows
        // in 3D.
        import('./ThreeMassingLayer').then(({ ThreeMassingLayer }) => {
          if (!mapRef.current) return
          const layer = new ThreeMassingLayer(center)
          layer.setEnabled(is3D)
          map.addLayer(layer as unknown as import('mapbox-gl').AnyLayer)
          threeLayerRef.current = layer
          syncThreeLayer(layer, spatialModelRef.current)
          applyContextBuildings(map, showContextBuildingsRef.current)
        })
      })
      map.addControl(new mapboxgl.default.NavigationControl({ showCompass: true }), 'top-right')
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      threeLayerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, boundary])

  // Style switch (map/satellite) — Mapbox clears custom sources/layers
  // on setStyle, so they're re-added once the new style finishes loading.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(styleUrl(mapStyle, dark))
    map.once('style.load', () => {
      addLayers(map)
      // setStyle tears down custom layers along with everything else
      // — re-attach the same ThreeMassingLayer instance (its scene
      // graph, i.e. the actual buildings/trees, lives on the JS
      // object itself and survives this, so nothing needs resyncing).
      if (threeLayerRef.current && !map.getLayer('three-massing-layer')) {
        map.addLayer(threeLayerRef.current as unknown as import('mapbox-gl').AnyLayer)
      }
      applyContextBuildings(map, showContextBuildingsRef.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStyle, dark])

  // 3D toggle — pitch/bearing + which 3D representation is shown.
  // The old flat fill-extrusion stays HIDDEN in 3D now — the real
  // conceptual massing (ThreeMassingLayer) takes over there. It's
  // kept in the codebase, not deleted, as the fallback if a browser
  // can't create a second WebGL context for any reason.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch: is3D ? 55 : 0, bearing: is3D ? -20 : 0, duration: 500 })
    threeLayerRef.current?.setEnabled(is3D)
    if (map.getLayer('scenario-footprint-extrusion')) {
      map.setLayoutProperty('scenario-footprint-extrusion', 'visibility', 'none')
    }
    if (map.getLayer('scenario-footprint-fill')) {
      map.setLayoutProperty('scenario-footprint-fill', 'visibility', is3D ? 'none' : 'visible')
    }
    if (map.getLayer('buildings-extrusion')) {
      map.setLayoutProperty('buildings-extrusion', 'visibility', 'none')
    }
  }, [is3D])

  if (!center) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(148,163,184,0.08)', borderRadius: 4, color: '#94A3B8', fontSize: 13,
      }}>
        Site location unavailable
      </div>
    )
  }

  function setCamera(pitch: number, bearingDelta: number | 'reset') {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch, bearing: bearingDelta === 'reset' ? 0 : map.getBearing() + bearingDelta, duration: 500 })
  }

  /** Camera should start with the SITE, not one building (Site Studio directive
   * §11). Both buttons fit real geometry only — never a guessed extent. */
  function fitToPolygons(polygons: GeoJSON.Polygon[]) {
    const map = mapRef.current
    if (!map || polygons.length === 0) return
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const poly of polygons) for (const [lng, lat] of poly.coordinates[0]) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    }
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 70, maxZoom: 19, duration: 600 })
  }
  function fitSite() {
    if (boundary) return fitToPolygons([boundary])
    if (exploratoryBoundary) return fitToPolygons([exploratoryBoundary])
    if (lat != null && lng != null) mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, duration: 600 })
  }
  function fitScenario() {
    const polys = [
      ...spatialModel.buildings.map(b => b.geojson),
      ...spatialModel.openSpaces.map(o => o.geojson),
      ...(spatialModel.parking ? [spatialModel.parking.geojson] : []),
    ]
    if (polys.length > 0) return fitToPolygons(polys)
    fitSite() // no placed objects yet — the scenario IS the site at this point
  }

  return (
    <div style={{ position: 'relative', height, borderRadius: 4, overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {is3D && (
        <div style={{
          position: 'absolute', bottom: 14, right: 12, zIndex: 1, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <button onClick={fitSite} style={cameraBtnStyle} title="Frame the whole site">Fit Site</button>
          <button onClick={fitScenario} style={cameraBtnStyle} title="Frame the placed development">Fit Scenario</button>
          {[
            { label: 'Top', pitch: 0 },
            { label: 'Aerial', pitch: 55 },
            { label: 'Street', pitch: 75 },
          ].map(p => (
            <button key={p.label} onClick={() => setCamera(p.pitch, 0)} style={cameraBtnStyle}>{p.label}</button>
          ))}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setCamera(mapRef.current?.getPitch() ?? 55, -30)} style={cameraBtnStyle} title="Rotate left">⟲</button>
            <button onClick={() => setCamera(mapRef.current?.getPitch() ?? 55, 30)} style={cameraBtnStyle} title="Rotate right">⟳</button>
          </div>
          <button onClick={() => setCamera(mapRef.current?.getPitch() ?? 55, 'reset')} style={cameraBtnStyle}>Reset North</button>
        </div>
      )}
      {!boundary && !exploratoryBoundary && drawMode === 'none' && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '4px 10px',
          fontSize: 11, borderRadius: 4, background: 'rgba(17,34,64,0.85)', color: '#94A3B8',
        }}>
          Site boundary not confirmed — showing location point only
        </div>
      )}
      {!boundary && exploratoryBoundary && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 1, padding: '4px 10px',
          fontSize: 11, borderRadius: 4, background: 'rgba(17,34,64,0.85)', color: '#F59E0B',
        }}>
          Exploratory boundary — user drawn, not a surveyed or verified boundary
        </div>
      )}
      {drawMode !== 'none' && (
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8,
          background: 'rgba(17,34,64,0.92)', color: '#E0E2F0', fontSize: 12.5,
        }}>
          <span>
            {drawMode === 'draw-site'
              ? `Click to place corners (${draftPoints.length})${liveAreaSqm != null ? ` — ${liveAreaSqm.toLocaleString()} sqm exploratory` : ''}`
              : drawMode === 'draw-building'
              ? `Click to place building corners (${draftPoints.length})${liveAreaSqm != null ? ` — ${liveAreaSqm.toLocaleString()} sqm footprint` : ''}`
              : drawMode === 'draw-open-space'
              ? `Click to trace open space (${draftPoints.length})${liveAreaSqm != null ? ` — ${liveAreaSqm.toLocaleString()} sqm` : ''}`
              : `Click two or more points${liveDistanceM != null ? ` — ${liveDistanceM.toLocaleString()} m` : ''}`}
          </span>
          {draftPoints.length > 0 && (
            <button onClick={() => setDraftPoints(prev => prev.slice(0, -1))} style={drawBtnStyle}>Undo point</button>
          )}
          {draftPoints.length > 0 && (
            <button onClick={() => setDraftPoints([])} style={drawBtnStyle}>Clear</button>
          )}
          {(drawMode === 'draw-site' || drawMode === 'draw-building' || drawMode === 'draw-open-space') && draftPoints.length >= 3 && (
            <button onClick={finishDrawSite} style={{ ...drawBtnStyle, background: '#6D28D9', borderColor: '#6D28D9' }}>Finish</button>
          )}
        </div>
      )}
    </div>
  )
}

const drawBtnStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: '#E0E2F0', cursor: 'pointer',
}

const cameraBtnStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5,
  border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(17,34,64,0.85)', color: '#E0E2F0', cursor: 'pointer',
}