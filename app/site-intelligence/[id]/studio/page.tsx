'use client'
// app/site-intelligence/[id]/studio/page.tsx
//
// MANOP Site Studio — rebuilt per the product evolution directive as
// an application workspace rather than a scenario form. Map-first,
// controlled 2D/3D + Map/Satellite from a real toolbar, a collapsible
// bottom readings panel, and a left panel that keeps Site
// Intelligence's evidence model front and centre (§19 of the
// directive: this must never become generic design software).
//
// HONESTY NOTE, kept deliberately visible in the code and the UI:
// several controls in the reference mockup this was built from don't
// have real data behind them yet — Zoning/Roads/Planning map layers,
// Split view, and Access as a scenario object. Rather than fake
// those, they're either omitted or shown disabled with a plain "not
// yet available" label. "Scenario Objects" now counts both Buildings
// and Open Space, since scenario_elements genuinely populates both in
// V1 (element_type 'building' / 'open_space'). Parking has a
// generated indicative area preview (see ScenarioMap's
// indicativeParkingStallCount / buildIndicativeParkingPolygon) but is
// still not a placed, independently editable scenario object the way
// buildings and open space are — that distinction is stated in the
// UI, not hidden. This matches the whole system's own rule:
// NOT_CALCULATED is better than an invented number, and that applies
// to the UI chrome, not just the readings.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import { sb } from '../../../../lib/supabase/client'
import { authedFetch } from '../../../../lib/authed-fetch'
import {
  Copy, Archive, ArrowRight, ListChecks, FileWarning, Layers as LayersIcon,
  ChevronDown, ChevronUp, Map as MapIcon, X, Share2,
} from 'lucide-react'
import { BackToDiscovery } from '../../../../components/SiteIntelligenceNav'
import ManopLogo from '../../../../components/ManopLogo'
import { Card, Fact, Muted, Badge, EvidenceBadge } from '../../../../components/site-intelligence-ui'
import ScenarioMap, { MapStyleMode, DrawMode } from '../../../../components/ScenarioMap'
import { rotatePolygon, scalePolygon, polygonAreaSqm } from '../../../../lib/scenario-geometry'
import { BuildingForm, BUILDING_FORM_LABEL, generateFormLayout } from '../../../../lib/building-forms'
import {
  Site, SiteIntelligenceLayer, InvestigationItem, LayerCategory, formatArea, formatSourceLine, OPPORTUNITY_TYPE_LABEL,
  resolveLayerGeometry, LAYER_CATEGORY_LABEL,
} from '../../../../lib/site-intelligence'
import {
  DevelopmentPreset, DEVELOPMENT_CATEGORY_LABEL, presetToScenarioDefaults, UnitMixRow,
} from '../../../../lib/development-presets'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../../../lib/theme'

interface ScenarioReadingRow {
  reading_key: string
  label: string
  numeric_value: number | null
  unit: string | null
  value_status: 'fact' | 'assumption' | 'derived' | 'estimate' | 'professional_opinion' | 'unknown'
  derivation_note: string | null
  source: string | null
}
interface ScenarioRow {
  id: string; reference: string | null; site_id: string; preset_id: string | null; name: string
  development_category: string; coverage_pct: number | null; storeys: number | null
  avg_unit_area_sqm: number | null; parking_ratio: number | null; open_space_pct: number | null
  unit_mix: UnitMixRow[] | null; status: string; created_at: string
  summary?: Record<string, { value: number | null; unit: string | null; value_status: string }>
}
interface ScenarioElementRow { element_type: string; footprint_sqm: number | null; storeys: number | null; height_m: number | null }
interface BuildingRow { id: string; label: string; footprint_sqm: number | null; storeys: number | null; height_m: number | null; orientation_deg: number | null; value_status: string; geojson: GeoJSON.Polygon }
interface RawBeaconPoint { label: string; x: number; y: number }

const STOREY_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]
const COVERAGE_OPTIONS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70]
const OPEN_SPACE_OPTIONS = [5, 8, 10, 12, 15, 20, 25, 30]
const PARKING_RATIO_OPTIONS = [0.5, 1, 1.2, 1.5, 2, 2.5, 3]
const UNIT_SIZE_OPTIONS = [40, 55, 65, 85, 110, 150, 200, 250]

const STATUS_LABEL: Record<string, { label: string; tone: 'fact' | 'assumption' | 'derived' | 'unknown' }> = {
  fact: { label: 'FACT', tone: 'fact' }, assumption: { label: 'ASSUMPTION', tone: 'assumption' },
  derived: { label: 'DERIVED', tone: 'derived' }, estimate: { label: 'ESTIMATE', tone: 'derived' },
  professional_opinion: { label: 'PROFESSIONAL OPINION', tone: 'assumption' }, unknown: { label: 'UNKNOWN', tone: 'unknown' },
}
type BottomTab = 'readings' | 'assumptions' | 'evidence' | 'unknowns' | 'investigation'

function stepOption(options: number[], current: number | null, dir: 1 | -1): number {
  if (current == null) return options[0]
  const idx = options.indexOf(current)
  if (idx === -1) return options[0]
  const next = idx + dir
  return options[Math.max(0, Math.min(options.length - 1, next))]
}

export default function SiteStudioPage() {
  const params = useParams<{ id: string }>()
  const siteId = params.id

  const [dark, setDark] = useState(getInitialDark)
  useEffect(() => { return listenTheme(setDark) }, [])
  const c = getDesignColors(dark)

  const [site, setSite] = useState<Site | null>(null)
  const [boundary, setBoundary] = useState<GeoJSON.Polygon | null>(null)
  const [rawBeacons, setRawBeacons] = useState<RawBeaconPoint[] | null>(null)
  const [exploratoryBoundary, setExploratoryBoundary] = useState<GeoJSON.Polygon | null>(null)
  const [layers, setLayers] = useState<SiteIntelligenceLayer[]>([])
  const [investigations, setInvestigations] = useState<InvestigationItem[]>([])

  const [presets, setPresets] = useState<DevelopmentPreset[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [showArchived, setShowArchived] = useState(false)
  // Read through a ref so toggling 'Show archived' reloads only the scenario list — it must
  // not change loadScenarios' identity, which would re-run the whole page load (and remount the map).
  const showArchivedRef = useRef(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [activeScenario, setActiveScenario] = useState<ScenarioRow | null>(null)
  const [readings, setReadings] = useState<ScenarioReadingRow[]>([])
  const [elements, setElements] = useState<ScenarioElementRow[]>([])
  const [buildings, setBuildings] = useState<BuildingRow[]>([])
  const [openSpaces, setOpenSpaces] = useState<{ id: string; label: string; geojson: GeoJSON.Polygon }[]>([])
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  // Composable-scenario toggles (not persisted — see lib/building-forms.ts):
  // buildingForm is inferred from how many buildings currently exist
  // (1=bar, 2=l, 3=u, 4=courtyard) whenever it hasn't been explicitly
  // set this session, so a freshly-loaded scenario still shows a
  // sensible active toggle instead of nothing selected.
  const [buildingFormOverride, setBuildingFormOverride] = useState<BuildingForm | null>(null)
  const [parkingEnabled, setParkingEnabled] = useState(true)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentUserName, setCurrentUserName] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Toolbar / workspace chrome state
  const [is3D, setIs3D] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyleMode>('map')
  const [leftTab, setLeftTab] = useState<'site' | 'layers' | 'tools'>('site')
  const [layersOpen, setLayersOpen] = useState(false)
  const [showOrientationMarker, setShowOrientationMarker] = useState(false)
  const [showContextBuildings, setShowContextBuildings] = useState(false)
  const [activeIntelligenceLayerIds, setActiveIntelligenceLayerIds] = useState<Set<string>>(new Set())
  const [showBoundary, setShowBoundary] = useState(true)
  const [showFootprint, setShowFootprint] = useState(true)
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const [drawSaving, setDrawSaving] = useState(false)
  const [bottomOpen, setBottomOpen] = useState(true)
  const [bottomTab, setBottomTab] = useState<BottomTab>('readings')

  // Draft scenario form state
  const [presetId, setPresetId] = useState('')
  const [category, setCategory] = useState('multifamily_residential')
  const [storeys, setStoreys] = useState<number | null>(null)
  const [coveragePct, setCoveragePct] = useState<number | null>(null)
  const [avgUnitArea, setAvgUnitArea] = useState<number | null>(null)
  const [parkingRatio, setParkingRatio] = useState<number | null>(null)
  const [openSpacePct, setOpenSpacePct] = useState<number | null>(null)
  const [unitMix, setUnitMix] = useState<UnitMixRow[] | null>(null)
  const [hasUnitMix, setHasUnitMix] = useState(true)

  const loadSiteContext = useCallback(async () => {
    const [{ data: siteData, error: siteFetchError }, { data: layerData }, { data: investigationData }, { data: boundaryGeoJson }, { data: exploratoryGeoJson }] = await Promise.all([
      sb.from('sites').select('*').eq('id', siteId).single(),
      sb.from('site_intelligence_layers').select('*').eq('site_id', siteId),
      sb.from('investigation_items').select('*').eq('site_id', siteId).order('status', { ascending: true }),
      sb.rpc('get_site_boundary_geojson', { p_site_id: siteId }),
      sb.rpc('get_site_exploratory_boundary_geojson', { p_site_id: siteId }),
    ])
    // Distinguish "doesn't exist / not visible to me" (PGRST116 — no
    // row for .single()) from a genuine fetch failure (RLS recursion,
    // network, a missing column) — the two deserve different messages,
    // per the brief's own "distinguish site doesn't exist from site
    // exists but geometry failed" instruction.
    if (siteFetchError && siteFetchError.code !== 'PGRST116') {
      setLoadError(siteFetchError.message)
      return
    }
    setSite(siteData || null)
    setLayers((layerData || []) as SiteIntelligenceLayer[])
    setInvestigations((investigationData || []) as InvestigationItem[])
    setBoundary((boundaryGeoJson as GeoJSON.Polygon | null) || null)
    setExploratoryBoundary((exploratoryGeoJson as GeoJSON.Polygon | null) || null)
    setRawBeacons((siteData?.raw_boundary_points as RawBeaconPoint[] | null) || null)
  }, [siteId])

  async function saveDrawnBoundary(polygon: GeoJSON.Polygon) {
    setDrawSaving(true)
    try {
      const res = await authedFetch(`/api/sites/${siteId}/exploratory-boundary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geojson: polygon }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save the drawn boundary.')
      setDrawMode('none')
      await loadSiteContext()
    } catch (err: any) {
      setError(err?.message || 'Could not save the drawn boundary.')
    } finally {
      setDrawSaving(false)
    }
  }

  const loadScenarios = useCallback(async () => {
    const res = await authedFetch(`/api/scenarios?site_id=${siteId}${showArchivedRef.current ? '&include_archived=1' : ''}`)
    const data = await res.json()
    setScenarios(data.scenarios || [])
  }, [siteId])

  useEffect(() => { showArchivedRef.current = showArchived; loadScenarios() }, [showArchived, loadScenarios])

  const loadPresets = useCallback(async () => {
    const res = await fetch('/api/development-presets')
    const data = await res.json()
    setPresets(data.presets || [])
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadSiteContext(), loadScenarios(), loadPresets()]).finally(() => setLoading(false))
    sb.auth.getUser().then(({ data }) => {
      const meta = data.user?.user_metadata as { full_name?: string; name?: string } | undefined
      setCurrentUserName(meta?.full_name || meta?.name || data.user?.email?.split('@')[0] || null)
    })
  }, [loadSiteContext, loadScenarios, loadPresets])

  function applyPreset(id: string) {
    setPresetId(id)
    const preset = presets.find(p => p.id === id)
    if (!preset) return
    const d = presetToScenarioDefaults(preset)
    setCategory(d.development_category); setStoreys(d.storeys); setCoveragePct(d.coverage_pct)
    setAvgUnitArea(d.avg_unit_area_sqm); setParkingRatio(d.parking_ratio); setOpenSpacePct(d.open_space_pct)
    setUnitMix(d.unit_mix); setHasUnitMix(preset.has_unit_mix)
  }

  async function loadScenarioDetail(id: string) {
    const res = await authedFetch(`/api/scenarios/${id}`)
    const data = await res.json()
    setActiveScenario(data.scenario); setReadings(data.readings || []); setElements(data.elements || [])
    setBuildings(data.buildings || [])
    setOpenSpaces(data.openSpaces || [])
    setShareUrl(null)
    setBottomOpen(true)
    setBuildingFormOverride(null) // form is inferred fresh from this scenario's own buildings — see state comment above
  }

  async function drawBuildingFinish(polygon: GeoJSON.Polygon, areaSqm: number) {
    if (!activeScenario) return
    setDrawMode('none')
    const res = await authedFetch(`/api/scenarios/${activeScenario.id}/buildings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: polygon, footprint_sqm: areaSqm, storeys: storeys ?? 4 }),
    })
    const data = await res.json()
    if (res.ok) { setBuildings(prev => [...prev, data.building]); setReadings(data.readings || readings); setSelectedBuildingId(data.building.id) }
    else setError(data.error || 'Could not create the building.')
  }

  async function drawOpenSpaceFinish(polygon: GeoJSON.Polygon, areaSqm: number) {
    if (!activeScenario) return
    setDrawMode('none')
    const res = await authedFetch(`/api/scenarios/${activeScenario.id}/buildings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: polygon, footprint_sqm: areaSqm, element_type: 'open_space' }),
    })
    const data = await res.json()
    if (res.ok) { setOpenSpaces(prev => [...prev, data.building]); setReadings(data.readings || readings) }
    else setError(data.error || 'Could not add open space.')
  }

  async function deleteOpenSpace(id: string) {
    setOpenSpaces(prev => prev.filter(o => o.id !== id))
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) setReadings(data.readings || readings)
  }

  async function buildingMoved(id: string, polygon: GeoJSON.Polygon) {
    const building = buildings.find(b => b.id === id)
    if (!building) return
    setBuildings(prev => prev.map(b => b.id === id ? { ...b, geojson: polygon } : b)) // optimistic
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: polygon, footprint_sqm: building.footprint_sqm }),
    })
    const data = await res.json()
    if (res.ok) setReadings(data.readings || readings)
  }

  async function buildingTransform(id: string, kind: 'rotate' | 'resize', delta: number) {
    const building = buildings.find(b => b.id === id)
    if (!building) return
    const polygon = kind === 'rotate' ? rotatePolygon(building.geojson, delta) : scalePolygon(building.geojson, delta)
    const footprintSqm = kind === 'resize' ? polygonAreaSqm(polygon) : building.footprint_sqm
    const orientation = kind === 'rotate' ? ((building.orientation_deg ?? 0) + delta) % 360 : building.orientation_deg
    setBuildings(prev => prev.map(b => b.id === id ? { ...b, geojson: polygon, footprint_sqm: footprintSqm, orientation_deg: orientation } : b))
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: polygon, footprint_sqm: footprintSqm, orientation_deg: orientation }),
    })
    const data = await res.json()
    if (res.ok) setReadings(data.readings || readings)
  }

  async function buildingStoreys(id: string, newStoreys: number) {
    setBuildings(prev => prev.map(b => b.id === id ? { ...b, storeys: newStoreys, height_m: newStoreys * 3.2 } : b))
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeys: newStoreys }),
    })
    const data = await res.json()
    if (res.ok) setReadings(data.readings || readings)
  }

  /**
   * Reshape the scenario's buildings into the chosen form (bar/L/U/
   * courtyard), preserving total footprint and average storeys —
   * "toggle the form", not "generate a different-sized building".
   * Implemented entirely through the existing create/delete building
   * endpoints: no new column, no new RPC. See lib/building-forms.ts
   * for why this is safe to do without a schema change, and for the
   * one real limitation this brings — a form-generated courtyard is
   * tracked only by its label ("Courtyard") so a repeat toggle can
   * clean up the PREVIOUS form's courtyard without touching a
   * genuinely user-drawn open space that happens to sit nearby. If a
   * developer renames a form-generated courtyard, that tracking is
   * lost and old the shape is left behind rather than guessed at —
   * intentional: a wrong guess here would delete something real.
   */
  async function applyBuildingForm(form: BuildingForm) {
    if (!activeScenario || !site) return
    if (site.lat == null || site.lng == null) {
      setError('This site has no known location yet — form toggling needs a site centre to build around.')
      return
    }
    const totalFootprint = buildings.length > 0
      ? buildings.reduce((sum, b) => sum + (b.footprint_sqm || 0), 0)
      : (footprintReading?.numeric_value ?? 0)
    if (!totalFootprint || totalFootprint <= 0) {
      setError('No footprint to reshape yet — generate a scenario or draw a building first.')
      return
    }
    const storeysForForm = buildings.length > 0
      ? Math.round(buildings.reduce((sum, b) => sum + (b.storeys ?? 1), 0) / buildings.length)
      : (storeys ?? activeScenario.storeys ?? 4)

    setSaving(true); setError('')
    try {
      const layout = generateFormLayout(form, {
        center: { lat: site.lat, lng: site.lng },
        totalFootprintSqm: totalFootprint,
        storeys: storeysForForm,
      })

      // Replace the current buildings outright.
      for (const b of buildings) {
        await authedFetch(`/api/scenarios/${activeScenario.id}/buildings/${b.id}`, { method: 'DELETE' })
      }
      // Replace only a PREVIOUSLY form-generated courtyard (label-tracked, see doc comment above) — never a differently-labelled open space.
      for (const o of openSpaces.filter(o => o.label === 'Courtyard')) {
        await authedFetch(`/api/scenarios/${activeScenario.id}/buildings/${o.id}`, { method: 'DELETE' })
      }

      let lastReadings = readings
      const newBuildings: typeof buildings = []
      for (const fb of layout.buildings) {
        const res = await authedFetch(`/api/scenarios/${activeScenario.id}/buildings`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geojson: fb.polygon, footprint_sqm: fb.footprint_sqm, storeys: fb.storeys, label: fb.label }),
        })
        const data = await res.json()
        if (res.ok) { newBuildings.push(data.building); lastReadings = data.readings || lastReadings }
      }
      const newOpenSpaces: typeof openSpaces = []
      for (const fo of layout.openSpaces) {
        const res = await authedFetch(`/api/scenarios/${activeScenario.id}/buildings`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geojson: fo.polygon, footprint_sqm: fo.footprint_sqm, element_type: 'open_space', label: fo.label }),
        })
        const data = await res.json()
        if (res.ok) { newOpenSpaces.push(data.building); lastReadings = data.readings || lastReadings }
      }

      setBuildings(newBuildings)
      setOpenSpaces(prev => [...prev.filter(o => o.label !== 'Courtyard'), ...newOpenSpaces])
      setReadings(lastReadings)
      setSelectedBuildingId(null)
      setBuildingFormOverride(form)
    } finally {
      setSaving(false)
    }
  }

  async function duplicateBuilding(id: string) {
    const building = buildings.find(b => b.id === id)
    if (!building) return
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}/duplicate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geojson: building.geojson }),
    })
    const data = await res.json()
    if (res.ok) { setBuildings(prev => [...prev, data.building]); setReadings(data.readings || readings); setSelectedBuildingId(data.building.id) }
  }

  async function deleteBuilding(id: string) {
    setBuildings(prev => prev.filter(b => b.id !== id))
    if (selectedBuildingId === id) setSelectedBuildingId(null)
    const res = await authedFetch(`/api/scenarios/${activeScenario!.id}/buildings/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (res.ok) setReadings(data.readings || readings)
  }

  async function createScenario() {
    setSaving(true); setError('')
    try {
      const res = await authedFetch('/api/scenarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId, preset_id: presetId || null, development_category: category,
          coverage_pct: coveragePct, storeys, avg_unit_area_sqm: avgUnitArea,
          parking_ratio: parkingRatio, open_space_pct: openSpacePct, unit_mix: unitMix, has_unit_mix: hasUnitMix,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create scenario.')
      await loadScenarios(); await loadScenarioDetail(data.scenario.id)
    } catch (err: any) { setError(err?.message || 'Something went wrong.') } finally { setSaving(false) }
  }

  async function recalculate() {
    if (!activeScenario) return
    setSaving(true); setError('')
    try {
      const res = await authedFetch(`/api/scenarios/${activeScenario.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverage_pct: coveragePct, storeys, avg_unit_area_sqm: avgUnitArea, parking_ratio: parkingRatio, open_space_pct: openSpacePct, unit_mix: unitMix }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recalculation failed.')
      await loadScenarioDetail(activeScenario.id); await loadScenarios()
    } catch (err: any) { setError(err?.message || 'Something went wrong.') } finally { setSaving(false) }
  }

  async function duplicateScenario(id: string) {
    const res = await authedFetch(`/api/scenarios/${id}/duplicate`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) { await loadScenarios(); await loadScenarioDetail(data.scenario.id) }
  }

  async function archiveScenario(id: string) {
    await authedFetch(`/api/scenarios/${id}`, { method: 'DELETE' })
    if (activeScenario?.id === id) { setActiveScenario(null); setReadings([]); setElements([]) }
    await loadScenarios()
  }

  async function renameScenario(id: string, name: string) {
    const trimmed = name.trim()
    setRenamingId(null)
    if (!trimmed) return
    const res = await authedFetch(`/api/scenarios/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not rename the scenario.'); return }
    if (activeScenario?.id === id) setActiveScenario({ ...activeScenario, name: trimmed })
    await loadScenarios()
  }

  // Restore un-archives a scenario. The live non-archived status value is not in the
  // repo (no SQL in the Repomix), so it is taken from a scenario that is currently
  // active rather than guessed; with none available, Restore is disabled in the UI.
  const activeStatusValue = scenarios.find(s => s.status !== 'archived')?.status ?? null
  async function restoreScenario(id: string) {
    if (!activeStatusValue) return
    const res = await authedFetch(`/api/scenarios/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: activeStatusValue }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Could not restore the scenario.'); return }
    await loadScenarios(); await loadScenarioDetail(id)
  }

  function toggleCompare(id: string) {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].slice(-3))
  }

  async function openShareLink() {
    if (!activeScenario) return
    if (shareUrl) { setShareUrl(null); return } // toggle closed if already open
    const res = await authedFetch(`/api/scenarios/${activeScenario.id}/share`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setShareUrl(`${window.location.origin}${data.url}`)
      setShareCopied(false)
    } else {
      setError(data.error || 'Could not create a share link.')
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // Clipboard API can be blocked in some contexts — the input is
      // already selected on focus, so the person can still Ctrl/Cmd+C.
    }
  }

  // Hooks must run unconditionally on every render — this MUST stay above the
  // loading/error/!site early returns below. It was previously placed after
  // them: on the render where `loading` was still true, execution returned
  // before ever reaching this useMemo, so it wasn't called on that render.
  // Once loading finished, execution reached it for the first time, and React
  // throws "Rendered more hooks than during the previous render" — this was a
  // genuine Rules-of-Hooks bug, not a false alarm.
  // Memoised: ScenarioMap's spatial model depends on this array's identity,
  // so a fresh array every render would re-project 2D/3D on every keystroke.
  const activeIntelligenceLayers = useMemo(() => layers
    .filter(l => activeIntelligenceLayerIds.has(l.id))
    .map(l => ({ id: l.id, category: l.layer_category, label: l.label, geometry: resolveLayerGeometry(l) }))
    .filter((l): l is { id: string; category: LayerCategory; label: string; geometry: GeoJSON.Geometry } => !!l.geometry),
    [layers, activeIntelligenceLayerIds])

  if (loading) return <StudioLoadingState c={c} label="Loading Site Studio…" />
  if (loadError) return <StudioErrorState c={c} dark={dark} title="We couldn't load this site's spatial data." detail={loadError} onRetry={() => window.location.reload()} />
  if (!site) return <StudioErrorState c={c} dark={dark} title="Site not found." detail="This site doesn't exist, or you don't have access to it." />

  const footprintReading = readings.find(r => r.reading_key === 'indicative_footprint_sqm')
  const parkingReading = readings.find(r => r.reading_key === 'indicative_parking_count')
  const massing = elements.find(e => e.element_type === 'building_mass')
  const unknownReadings = readings.filter(r => r.value_status === 'unknown')
  const openInvestigations = investigations.filter(i => i.status === 'open')
  const assumptionRows: { label: string; value: string }[] = activeScenario ? [
    { label: 'Development Category', value: DEVELOPMENT_CATEGORY_LABEL[activeScenario.development_category as keyof typeof DEVELOPMENT_CATEGORY_LABEL] || activeScenario.development_category },
    { label: 'Storeys', value: activeScenario.storeys != null ? String(activeScenario.storeys) : 'Not set' },
    { label: 'Site Coverage', value: activeScenario.coverage_pct != null ? `${activeScenario.coverage_pct}%` : 'Not set' },
    { label: 'Average Unit Size', value: activeScenario.avg_unit_area_sqm != null ? `${activeScenario.avg_unit_area_sqm} sqm` : 'Not set' },
    { label: 'Parking Ratio', value: activeScenario.parking_ratio != null ? `${activeScenario.parking_ratio} spaces/unit` : 'Not set' },
    { label: 'Open Space', value: activeScenario.open_space_pct != null ? `${activeScenario.open_space_pct}%` : 'Not set' },
  ] : []

  return (
    <div style={{ background: c.background, color: c.textPrimary, height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: designTokens.font.family, overflow: 'hidden' }}>

      {/* ── TOP TOOLBAR ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 18px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        <BackToDiscovery dark={dark} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ManopLogo dark={dark} iconOnly height={22} />
          <span style={{ fontSize: 13, fontWeight: 700, color: c.textMuted }}>Site Studio</span>
        </div>
        <div style={{ width: 1, height: 20, background: c.border }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{site.reference || 'Unreferenced Site'}</span>
            {site.is_sandbox && <Badge label="TEST / DEMO SITE" color={c.statusAmber} bg="transparent" />}
          </div>
          <div style={{ fontSize: 11, color: c.textFaint }}>
            {site.neighborhood ? `${site.neighborhood}, ` : ''}{site.city} · {formatArea(site.area_sqm ?? site.boundary_area_sqm)}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <ToggleGroup c={c} value={is3D ? '3d' : '2d'} onChange={(v) => setIs3D(v === '3d')} options={[{ value: '2d', label: '2D' }, { value: '3d', label: '3D' }]} />
        <ToggleGroup c={c} value={mapStyle} onChange={(v) => setMapStyle(v as MapStyleMode)} options={[{ value: 'map', label: 'Map' }, { value: 'satellite', label: 'Satellite' }]} />

        <button onClick={() => setLayersOpen(v => !v)} style={secondaryBtn(c)}><LayersIcon size={14} /> Layers</button>
        {activeScenario && (
          <div style={{ position: 'relative' }}>
            <button onClick={openShareLink} style={secondaryBtn(c)}><Share2 size={14} /> Share</button>
            {shareUrl && (
              <div style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 20, width: 300,
                background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 14,
              }}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600 }}>SHARE THIS SCENARIO</div>
                <div style={{ fontSize: 11.5, color: c.textFaint, marginBottom: 10, lineHeight: 1.5 }}>
                  Anyone with this link can view a read-only report — no MANOP account needed.
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input readOnly value={shareUrl} style={{ ...inputStyle(c), flex: 1, fontSize: 11 }} onFocus={e => e.target.select()} />
                  <button onClick={copyShareLink} style={secondaryBtn(c)}>{shareCopied ? 'Copied' : 'Copy'}</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <a href={shareUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: c.intelligencePurple }}>Open report</a>
                  <button onClick={() => setShareUrl(null)} style={{ background: 'none', border: 'none', color: c.textFaint, fontSize: 11.5, cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            )}
          </div>
        )}
        {activeScenario && (
          <a href={`/site-intelligence/${siteId}/appraisal?scenario_id=${activeScenario.id}`} style={{ ...primaryBtn(c, false), textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            Appraise <ArrowRight size={13} />
          </a>
        )}
        {currentUserName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
            <div style={{ width: 1, height: 20, background: c.border }} />
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: c.intelligencePurple, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {currentUserName.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 12.5, color: c.textMuted, whiteSpace: 'nowrap' }}>{currentUserName}</span>
          </div>
        )}
      </div>

      {/* ── WORKSPACE BODY ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* LEFT — Site & Scenario context */}
        <div style={{ width: 300, borderRight: `1px solid ${c.border}`, overflowY: 'auto', padding: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['site', 'layers', 'tools'] as const).map(t => (
              <button key={t} onClick={() => setLeftTab(t)} style={tabBtn(c, leftTab === t)}>
                {t === 'site' ? 'Site & Scenario' : t === 'layers' ? 'Layers' : 'Tools'}
              </button>
            ))}
          </div>

          {leftTab === 'site' && (
            <>
              <Card c={c}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600 }}>SITE CONTEXT</div>
                <Fact c={c} label="Site Area" value={formatArea(site.area_sqm ?? site.boundary_area_sqm)} />
                <Fact c={c} label="Opportunity Type" value={OPPORTUNITY_TYPE_LABEL[site.opportunity_type]} />
                <Fact c={c} label="Boundary" value={boundary ? 'Confirmed polygon' : 'Not confirmed — point only'} />
              </Card>

              {layers.filter(l => l.layer_category === 'planning').length > 0 && (
                <Card c={c}>
                  <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600 }}>PLANNING &amp; CONSTRAINTS</div>
                  {layers.filter(l => l.layer_category === 'planning').map(l => (
                    <div key={l.id} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{l.label}</div>
                        <EvidenceBadge status={l.evidence_status} dark={dark} />
                      </div>
                      {l.value_summary && <div style={{ fontSize: 12 }}>{l.value_summary}</div>}
                      <div style={{ fontSize: 10.5, color: c.textFaint }}>{formatSourceLine(l.source, l.source_date)}</div>
                    </div>
                  ))}
                </Card>
              )}

              <Card c={c}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ListChecks size={12} /> FURTHER INVESTIGATION ({openInvestigations.length})
                </div>
                {openInvestigations.length === 0 ? <Muted c={c}>No open investigation items.</Muted> :
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.7 }}>{openInvestigations.map(i => <li key={i.id}>{i.label}</li>)}</ul>}
              </Card>

              <Card c={c}>
                <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600 }}>SITE GEOMETRY</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SiteGeometrySchematic beacons={rawBeacons} boundaryConfirmed={!!boundary} c={c} />
                  <div style={{ fontSize: 11.5 }}>
                    {boundary
                      ? <span style={{ color: c.verificationTeal }}>Boundary confirmed</span>
                      : rawBeacons
                        ? <span style={{ color: c.statusAmber }}>Raw survey shape — CRS unconfirmed</span>
                        : <span style={{ color: c.textFaint }}>Location point only</span>}
                    {site.lat != null && <div style={{ color: c.textFaint }}>{site.lat.toFixed(4)}°N, {site.lng?.toFixed(4)}°E</div>}
                  </div>
                </div>
              </Card>
            </>
          )}

          {leftTab === 'layers' && (
            <Card c={c}><Muted c={c}>Layer management (zoning, roads, master-plan overlays) is planned but not yet wired to real spatial datasets for this site. Use the Layers panel on the map for what's currently available.</Muted></Card>
          )}
          {leftTab === 'tools' && (
            <Card c={c}>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 10, fontWeight: 600 }}>DRAWING TOOLS</div>
              {!boundary ? (
                <>
                  <button
                    onClick={() => setDrawMode(drawMode === 'draw-site' ? 'none' : 'draw-site')}
                    style={{ ...secondaryBtn(c), width: '100%', marginBottom: 8, justifyContent: 'center', ...(drawMode === 'draw-site' ? { background: c.intelligencePurple, color: '#fff', borderColor: c.intelligencePurple } : {}) }}
                  >
                    {drawMode === 'draw-site' ? 'Cancel Drawing' : 'Draw Site Boundary'}
                  </button>
                  <div style={{ fontSize: 11, color: c.textFaint, lineHeight: 1.5, marginBottom: 12 }}>
                    No confirmed boundary exists for this site. Switch to Satellite, then click corners on the map to
                    trace the approximate parcel. This creates an <b>exploratory</b> boundary — never a substitute
                    for a professional survey, and never shown as verified evidence.
                  </div>
                  {exploratoryBoundary && (
                    <div style={{ fontSize: 11, color: c.statusAmber, marginBottom: 12 }}>
                      An exploratory boundary is already saved for this site — drawing again will replace it.
                    </div>
                  )}
                  {drawSaving && <Muted c={c}>Saving drawn boundary…</Muted>}
                </>
              ) : (
                <Muted c={c}>This site already has a confirmed boundary — Draw Site isn't needed here.</Muted>
              )}

              <button
                onClick={() => setDrawMode(drawMode === 'measure' ? 'none' : 'measure')}
                style={{ ...secondaryBtn(c), width: '100%', justifyContent: 'center', marginTop: 4, ...(drawMode === 'measure' ? { background: c.intelligencePurple, color: '#fff', borderColor: c.intelligencePurple } : {}) }}
              >
                {drawMode === 'measure' ? 'Cancel Measuring' : 'Measure'}
              </button>

              {activeScenario && (
                <button
                  onClick={() => setDrawMode(drawMode === 'draw-building' ? 'none' : 'draw-building')}
                  style={{ ...secondaryBtn(c), width: '100%', justifyContent: 'center', marginTop: 8, ...(drawMode === 'draw-building' ? { background: c.intelligencePurple, color: '#fff', borderColor: c.intelligencePurple } : {}) }}
                >
                  {drawMode === 'draw-building' ? 'Cancel Drawing' : 'Draw Building'}
                </button>
              )}
              {activeScenario && (
                <button
                  onClick={() => setDrawMode(drawMode === 'draw-open-space' ? 'none' : 'draw-open-space')}
                  style={{ ...secondaryBtn(c), width: '100%', justifyContent: 'center', marginTop: 8, ...(drawMode === 'draw-open-space' ? { background: '#22C55E', color: '#fff', borderColor: '#22C55E' } : {}) }}
                >
                  {drawMode === 'draw-open-space' ? 'Cancel — Open Space' : 'Add Open Space'}
                </button>
              )}
              {openSpaces.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {openSpaces.map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
                      <span>{o.label}</span>
                      <button onClick={() => deleteOpenSpace(o.id)} style={{ ...stepBtn(c), width: 'auto', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: c.textFaint, lineHeight: 1.5, marginTop: 10 }}>
                {activeScenario
                  ? 'Draw a building footprint, or trace open space ("green land") directly on the map. Placed buildings replace the auto-generated indicative footprint in the readings below.'
                  : 'Create a scenario first to draw buildings or open space on it.'}
              </div>
            </Card>
          )}
        </div>

        {/* CENTRE — spatial canvas */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ScenarioMap
            lat={site.lat} lng={site.lng} boundary={boundary} exploratoryBoundary={exploratoryBoundary}
            footprintSqm={activeScenario && buildings.length === 0 ? footprintReading?.numeric_value ?? null : null}
            heightM={activeScenario && buildings.length === 0 ? massing?.height_m ?? null : null}
            is3D={is3D} mapStyle={mapStyle} showBoundary={showBoundary} showFootprint={showFootprint && buildings.length === 0}
            dark={dark}
            drawMode={drawMode}
            onDrawFinish={(polygon) => saveDrawnBoundary(polygon)}
            onDrawBuildingFinish={drawBuildingFinish}
            onDrawOpenSpaceFinish={drawOpenSpaceFinish}
            buildings={buildings}
            developmentCategory={activeScenario?.development_category}
            indicativeParkingStallCount={parkingEnabled ? (parkingReading?.numeric_value ?? null) : null}
            intelligenceLayers={activeIntelligenceLayers}
            showOrientationMarker={showOrientationMarker}
            showContextBuildings={showContextBuildings}
            openSpaces={openSpaces}
            selectedBuildingId={selectedBuildingId}
            onSelectBuilding={setSelectedBuildingId}
            onBuildingMoved={buildingMoved}
          />

          {layersOpen && (
            <div style={{
              position: 'absolute', top: 12, right: 12, width: 230, background: c.surfaceCard, border: `1px solid ${c.border}`,
              borderRadius: designTokens.radius.sm, padding: 14, zIndex: 5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Layers</span>
                <X size={14} style={{ cursor: 'pointer' }} onClick={() => setLayersOpen(false)} />
              </div>
              <LayerRow c={c} label="Site Boundary" checked={showBoundary} onChange={setShowBoundary} enabled={!!boundary} />
              <LayerRow c={c} label="Scenario Footprint" checked={showFootprint} onChange={setShowFootprint} enabled={!!activeScenario} />

              <div style={{ fontSize: 10.5, color: c.textFaint, margin: '10px 0 4px', fontWeight: 600 }}>CONTEXT &amp; CHECKS</div>
              <LayerRow c={c} label="Surrounding buildings" checked={showContextBuildings} onChange={setShowContextBuildings} enabled note="map-data footprints; coverage varies" />
              <LayerRow c={c} label="Orientation marker" checked={showOrientationMarker} onChange={setShowOrientationMarker} enabled note="red = north, blue = east (3D)" />

              <div style={{ fontSize: 10.5, color: c.textFaint, margin: '10px 0 4px', fontWeight: 600 }}>SITE INTELLIGENCE</div>
              {layers.length === 0 && <div style={{ fontSize: 11, color: c.textFaint }}>No evidence layers recorded for this site yet.</div>}
              {layers.map(l => {
                const geometry = resolveLayerGeometry(l)
                return (
                  <LayerRow
                    key={l.id}
                    c={c}
                    label={l.label}
                    checked={activeIntelligenceLayerIds.has(l.id)}
                    enabled={!!geometry}
                    note={geometry ? LAYER_CATEGORY_LABEL[l.layer_category] : 'no mapped geometry yet'}
                    onChange={(v) => setActiveIntelligenceLayerIds(prev => {
                      const next = new Set(prev)
                      if (v) next.add(l.id); else next.delete(l.id)
                      return next
                    })}
                  />
                )
              })}
            </div>
          )}

          {!activeScenario && (
            <div style={{
              position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
              fontSize: 12, color: c.textFaint, background: 'rgba(17,34,64,0.85)', padding: '6px 14px', borderRadius: 20,
            }}>
              No scenario yet — build one from the panel on the right
            </div>
          )}
        </div>

        {/* RIGHT — preset & parameters */}
        <div style={{ width: 300, borderLeft: `1px solid ${c.border}`, overflowY: 'auto', padding: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 10, fontWeight: 600 }}>DEVELOPMENT PRESET</div>
          <select style={inputStyle(c)} value={presetId} onChange={e => applyPreset(e.target.value)}>
            <option value="">Custom (no preset)</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div style={{ fontSize: 11, color: c.textMuted, margin: '14px 0 8px', fontWeight: 600 }}>CONFIGURATION</div>
          <StepperRow c={c} label="Storeys" value={storeys} unit="" onDec={() => setStoreys(stepOption(STOREY_OPTIONS, storeys, -1))} onInc={() => setStoreys(stepOption(STOREY_OPTIONS, storeys, 1))} />
          <StepperRow c={c} label="Site Coverage" value={coveragePct} unit="%" onDec={() => setCoveragePct(stepOption(COVERAGE_OPTIONS, coveragePct, -1))} onInc={() => setCoveragePct(stepOption(COVERAGE_OPTIONS, coveragePct, 1))} />
          <StepperRow c={c} label="Open Space" value={openSpacePct} unit="%" onDec={() => setOpenSpacePct(stepOption(OPEN_SPACE_OPTIONS, openSpacePct, -1))} onInc={() => setOpenSpacePct(stepOption(OPEN_SPACE_OPTIONS, openSpacePct, 1))} />

          {hasUnitMix && (
            <>
              <StepperRow c={c} label="Avg Unit Size" value={avgUnitArea} unit=" sqm" onDec={() => setAvgUnitArea(stepOption(UNIT_SIZE_OPTIONS, avgUnitArea, -1))} onInc={() => setAvgUnitArea(stepOption(UNIT_SIZE_OPTIONS, avgUnitArea, 1))} />
              <StepperRow c={c} label="Parking Ratio" value={parkingRatio} unit="/unit" onDec={() => setParkingRatio(stepOption(PARKING_RATIO_OPTIONS, parkingRatio, -1))} onInc={() => setParkingRatio(stepOption(PARKING_RATIO_OPTIONS, parkingRatio, 1))} />

              {unitMix && (
                <>
                  <div style={{ fontSize: 11, color: c.textMuted, margin: '14px 0 8px', fontWeight: 600 }}>UNIT MIX</div>
                  {unitMix.map((row, i) => (
                    <StepperRow key={i} c={c} label={row.label} value={row.pct} unit="%"
                      onDec={() => { const next = [...unitMix]; next[i] = { ...row, pct: Math.max(0, row.pct - 5) }; setUnitMix(next) }}
                      onInc={() => { const next = [...unitMix]; next[i] = { ...row, pct: Math.min(100, row.pct + 5) }; setUnitMix(next) }} />
                  ))}
                </>
              )}
            </>
          )}

          <button onClick={activeScenario ? recalculate : createScenario} disabled={saving} style={{ ...primaryBtn(c, saving), width: '100%', marginTop: 16 }}>
            {saving ? 'Working…' : activeScenario ? 'Update Scenario' : 'Generate Scenario'}
          </button>
          {error && <div style={{ color: c.statusRed, fontSize: 12, marginTop: 8 }}>{error}</div>}

          {activeScenario && (
            <>
              <div style={{ fontSize: 11, color: c.textMuted, margin: '18px 0 8px', fontWeight: 600 }}>SCENARIO OBJECTS</div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, color: c.textMuted, marginBottom: 6 }}>Building Form</div>
                <ToggleGroup
                  c={c}
                  value={buildingFormOverride ?? (buildings.length === 2 ? 'l' : buildings.length === 3 ? 'u' : buildings.length >= 4 ? 'courtyard' : 'bar')}
                  onChange={(v) => applyBuildingForm(v as BuildingForm)}
                  options={(['bar', 'l', 'u', 'courtyard'] as BuildingForm[]).map(f => ({ value: f, label: BUILDING_FORM_LABEL[f] }))}
                />
                <div style={{ fontSize: 10.5, color: c.textFaint, marginTop: 6 }}>
                  Reshapes the scenario's buildings, keeping total footprint and average storeys. Podium+Tower is already available via Development Category (Mixed Use); Wrap and true multi-building composition are next.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: c.textMuted }}>Parking (indicative preview)</span>
                <ToggleGroup c={c} value={parkingEnabled ? 'on' : 'off'} onChange={(v) => setParkingEnabled(v === 'on')} options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
              </div>

              <Fact c={c} label="Buildings" value={buildings.length > 0 ? String(buildings.length) : (massing?.footprint_sqm != null ? '1 (auto-generated)' : '0')} />
              <Fact c={c} label="Open Space" value={String(openSpaces.length)} />
              <div style={{ fontSize: 10.5, color: c.textFaint, marginBottom: 10 }}>
                Parking shows as a generated indicative area (from Indicative Parking, below) when toggled on — not yet a placed, independently editable object like a building. Access is not yet modelled as a scenario object.
              </div>

              {buildings.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {buildings.map(b => (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBuildingId(b.id)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px',
                        borderRadius: designTokens.radius.sm, cursor: 'pointer', fontSize: 12,
                        background: selectedBuildingId === b.id ? c.surfaceCard : 'transparent',
                        border: `1px solid ${selectedBuildingId === b.id ? c.intelligencePurple : 'transparent'}`,
                      }}
                    >
                      <span>{b.label}</span>
                      <span style={{ color: c.textMuted }}>{b.storeys ?? '—'}fl · {b.footprint_sqm ? Math.round(b.footprint_sqm).toLocaleString() : '—'} sqm</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedBuildingId && buildings.find(b => b.id === selectedBuildingId) && (() => {
                const b = buildings.find(x => x.id === selectedBuildingId)!
                return (
                  <Card c={c}>
                    <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8, fontWeight: 600 }}>{b.label} SELECTED</div>
                    <div style={{ fontSize: 10.5, color: c.textFaint, marginBottom: 10 }}>Drag the building on the map to move it.</div>
                    <StepperRow c={c} label="Storeys" value={b.storeys} unit="" onDec={() => buildingStoreys(b.id, Math.max(1, (b.storeys ?? 1) - 1))} onInc={() => buildingStoreys(b.id, (b.storeys ?? 1) + 1)} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: 12.5, color: c.textMuted }}>Rotate</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => buildingTransform(b.id, 'rotate', -15)} style={stepBtn(c)}>⟲</button>
                        <button onClick={() => buildingTransform(b.id, 'rotate', 15)} style={stepBtn(c)}>⟳</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                      <span style={{ fontSize: 12.5, color: c.textMuted }}>Resize</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => buildingTransform(b.id, 'resize', 0.9)} style={stepBtn(c)}>−</button>
                        <button onClick={() => buildingTransform(b.id, 'resize', 1.1)} style={stepBtn(c)}>+</button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => duplicateBuilding(b.id)} style={secondaryBtn(c)}><Copy size={13} /> Duplicate</button>
                      <button onClick={() => deleteBuilding(b.id)} style={secondaryBtn(c)}><Archive size={13} /> Delete</button>
                    </div>
                  </Card>
                )
              })()}

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={() => duplicateScenario(activeScenario.id)} style={secondaryBtn(c)}><Copy size={13} /> Duplicate</button>
                <button onClick={() => archiveScenario(activeScenario.id)} style={secondaryBtn(c)}><Archive size={13} /> Archive</button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
                <span style={{ fontSize: 11, color: c.textMuted, fontWeight: 600 }}>SCENARIOS FOR THIS SITE ({scenarios.filter(s => s.status !== 'archived').length})</span>
                <label style={{ fontSize: 11, color: c.textMuted, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
                </label>
              </div>
              {scenarios.map(s => (
                <ScenarioManagerCard
                  key={s.id} c={c} scenario={s} active={activeScenario?.id === s.id}
                  compared={compareIds.includes(s.id)} renaming={renamingId === s.id}
                  renameValue={renameValue} canRestore={!!activeStatusValue}
                  onRenameValue={setRenameValue}
                  onStartRename={() => { setRenamingId(s.id); setRenameValue(s.name) }}
                  onCommitRename={() => renameScenario(s.id, renameValue)}
                  onCancelRename={() => setRenamingId(null)}
                  onOpen={() => loadScenarioDetail(s.id)}
                  onDuplicate={() => duplicateScenario(s.id)}
                  onArchive={() => archiveScenario(s.id)}
                  onRestore={() => restoreScenario(s.id)}
                  onToggleCompare={() => toggleCompare(s.id)}
                />
              ))}
              {compareIds.length >= 2 && <ScenarioComparison ids={compareIds} scenarios={scenarios} c={c} />}
            </>
          )}
        </div>
      </div>

      {/* ── BOTTOM — collapsible readings workspace ─────────────── */}
      {activeScenario && (
        <div style={{ borderTop: `1px solid ${c.border}`, flexShrink: 0, background: c.surfaceCard, maxHeight: bottomOpen ? '38vh' : 40, overflow: 'hidden', transition: 'max-height 0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 4, borderBottom: bottomOpen ? `1px solid ${c.border}` : 'none' }}>
            {(['readings', 'assumptions', 'evidence', 'unknowns', 'investigation'] as BottomTab[]).map(t => (
              <button key={t} onClick={() => { setBottomTab(t); setBottomOpen(true) }} style={tabBtn(c, bottomTab === t && bottomOpen)}>
                {t === 'readings' ? 'Scenario Readings' : t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'unknowns' && unknownReadings.length > 0 ? ` (${unknownReadings.length})` : ''}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={() => setBottomOpen(v => !v)} style={{ background: 'none', border: 'none', color: c.textMuted, cursor: 'pointer' }}>
              {bottomOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>

          {bottomOpen && (
            <div style={{ padding: 16, overflowY: 'auto', maxHeight: 'calc(38vh - 44px)' }}>
              {bottomTab === 'readings' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  {readings.map(r => <ReadingCard key={r.reading_key} r={r} c={c} />)}
                </div>
              )}
              {bottomTab === 'assumptions' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  {assumptionRows.map(a => (
                    <div key={a.label} style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
                      <div style={{ fontSize: 11, color: c.textMuted }}>{a.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{a.value}</div>
                      <Badge label="SCENARIO ASSUMPTION" color={c.statusAmber} bg="transparent" />
                    </div>
                  ))}
                </div>
              )}
              {bottomTab === 'evidence' && (
                layers.length === 0 ? <Muted c={c}>No Site Intelligence evidence layers recorded for this site yet.</Muted> :
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {layers.map(l => (
                    <div key={l.id} style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{l.label}</span>
                        <EvidenceBadge status={l.evidence_status} dark={dark} />
                      </div>
                      <div style={{ fontSize: 11.5 }}>{l.value_summary}</div>
                      <div style={{ fontSize: 10.5, color: c.textFaint }}>{formatSourceLine(l.source, l.source_date)}</div>
                    </div>
                  ))}
                </div>
              )}
              {bottomTab === 'unknowns' && (
                unknownReadings.length === 0 ? <Muted c={c}>Every reading in this scenario currently has a value.</Muted> :
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                  {unknownReadings.map(r => <li key={r.reading_key}><FileWarning size={11} style={{ marginRight: 4 }} />{r.label} — not currently calculable from the inputs provided</li>)}
                </ul>
              )}
              {bottomTab === 'investigation' && (
                openInvestigations.length === 0 ? <Muted c={c}>No open investigation items for this site.</Muted> :
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
                  {openInvestigations.map(i => <li key={i.id}>{i.label}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── small presentational helpers ─────────────────────────────── */

/**
 * Branded loading and error states — MANOP's own logo, never a
 * generic spinner or unrelated icon (the product evolution brief was
 * explicit about this). A CSS ring animates around the mark rather
 * than the mark itself spinning — MANOP's logo isn't a loading
 * glyph, so it stays still while something around it moves.
 */
function StudioLoadingState({ c, label }: { c: ReturnType<typeof getDesignColors>; label: string }) {
  return (
    <div style={{
      background: c.background, minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: designTokens.font.family,
    }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `2px solid ${c.border}`, borderTopColor: c.intelligencePurple,
          animation: 'manop-spin 0.9s linear infinite',
        }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ManopLogo dark={true} iconOnly height={28} />
        </div>
      </div>
      <div style={{ fontSize: 13, color: c.textMuted }}>{label}</div>
      <style>{`@keyframes manop-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function StudioErrorState({ c, dark, title, detail, onRetry }: { c: ReturnType<typeof getDesignColors>; dark: boolean; title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div style={{
      background: c.background, minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: designTokens.font.family, padding: 32, textAlign: 'center',
    }}>
      <ManopLogo dark={dark} iconOnly height={32} style={{ opacity: 0.6 }} />
      <div style={{ fontSize: 15, fontWeight: 700, maxWidth: 380 }}>MANOP Site Studio</div>
      <div style={{ fontSize: 13.5, color: c.textMuted, maxWidth: 380 }}>{title}</div>
      {detail && <div style={{ fontSize: 11.5, color: c.textFaint, maxWidth: 420 }}>{detail}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        {onRetry && <button onClick={onRetry} style={primaryBtn(c, false)}>Retry</button>}
        <a href="/site-intelligence" style={{ ...secondaryBtn(c), textDecoration: 'none' }}>Back to Site Discovery</a>
      </div>
    </div>
  )
}

function ToggleGroup({ c, value, onChange, options }: { c: ReturnType<typeof getDesignColors>; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '6px 12px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
          background: value === o.value ? c.intelligencePurple : 'transparent', color: value === o.value ? '#fff' : c.textMuted,
        }}>{o.label}</button>
      ))}
    </div>
  )
}

function LayerRow({ c, label, checked, onChange, enabled, note }: { c: ReturnType<typeof getDesignColors>; label: string; checked: boolean; onChange: (v: boolean) => void; enabled: boolean; note?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', fontSize: 12.5, opacity: enabled ? 1 : 0.45, cursor: enabled ? 'pointer' : 'default' }}>
      <span>{label}{note ? <span style={{ color: c.textFaint, fontSize: 10.5 }}> — {note}</span> : ''}</span>
      <input type="checkbox" checked={checked} disabled={!enabled} onChange={e => onChange(e.target.checked)} />
    </label>
  )
}

function StepperRow({ c, label, value, unit, onDec, onInc }: { c: ReturnType<typeof getDesignColors>; label: string; value: number | null; unit: string; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12.5, color: c.textMuted }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onDec} style={stepBtn(c)}>−</button>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>{value != null ? `${value}${unit}` : '—'}</span>
        <button onClick={onInc} style={stepBtn(c)}>+</button>
      </div>
    </div>
  )
}

function ReadingCard({ r, c }: { r: ScenarioReadingRow; c: ReturnType<typeof getDesignColors> }) {
  const tone = STATUS_LABEL[r.value_status]
  const toneColor = tone.tone === 'fact' ? c.verificationTeal : tone.tone === 'derived' ? c.intelligencePurple : tone.tone === 'unknown' ? c.textFaint : c.statusAmber
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
      <div style={{ fontSize: 11, color: c.textMuted }}>{r.label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{r.numeric_value != null ? `${r.numeric_value.toLocaleString()} ${r.unit || ''}` : 'Not currently calculable'}</div>
      <Badge label={tone.label} color={toneColor} bg="transparent" />
    </div>
  )
}

function ScenarioManagerCard(props: {
  c: ReturnType<typeof getDesignColors>; scenario: ScenarioRow; active: boolean; compared: boolean
  renaming: boolean; renameValue: string; canRestore: boolean
  onRenameValue: (v: string) => void; onStartRename: () => void; onCommitRename: () => void; onCancelRename: () => void
  onOpen: () => void; onDuplicate: () => void; onArchive: () => void; onRestore: () => void; onToggleCompare: () => void
}) {
  const { c, scenario: s, active, compared, renaming } = props
  const archived = s.status === 'archived'
  const categoryLabel = DEVELOPMENT_CATEGORY_LABEL[s.development_category as keyof typeof DEVELOPMENT_CATEGORY_LABEL] || s.development_category
  const stat = (key: string, label: string) => {
    const r = s.summary?.[key]
    if (!r || r.value == null) return <span key={key}>{label}: <b>not calculable</b></span>
    const tag = STATUS_LABEL[r.value_status]?.label || r.value_status
    return <span key={key}>{label}: <b>{r.value.toLocaleString()}{r.unit ? ` ${r.unit}` : ''}</b> <span style={{ color: c.textFaint, fontSize: 9.5 }}>{tag}</span></span>
  }
  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: c.intelligencePurple, fontSize: 11.5, cursor: 'pointer', padding: 0 }
  return (
    <div style={{
      border: `1px solid ${active ? c.intelligencePurple : c.border}`, borderRadius: designTokens.radius.sm,
      padding: 10, marginBottom: 8, opacity: archived ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 10.5, color: c.textMuted, fontWeight: 600 }}>{s.reference || 'SCENARIO'}{archived ? ' · ARCHIVED' : ''}</span>
        <label style={{ fontSize: 10.5, color: c.textMuted, display: 'flex', gap: 3, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={compared} onChange={props.onToggleCompare} /> Compare
        </label>
      </div>
      {renaming ? (
        <input
          autoFocus value={props.renameValue} onChange={e => props.onRenameValue(e.target.value)}
          onBlur={props.onCommitRename}
          onKeyDown={e => { if (e.key === 'Enter') props.onCommitRename(); if (e.key === 'Escape') props.onCancelRename() }}
          style={{ ...inputStyle(c), width: '100%', margin: '4px 0', fontSize: 12.5 }}
        />
      ) : (
        <div style={{ fontSize: 13, fontWeight: 600, margin: '2px 0' }}>{s.name}</div>
      )}
      <div style={{ fontSize: 11.5, color: c.textMuted }}>{categoryLabel}{s.storeys ? ` · ${s.storeys} floors` : ''}</div>
      <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
        {stat('indicative_unit_count', 'Units')}{stat('indicative_gfa_sqm', 'GFA')}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button style={linkBtn} onClick={props.onOpen}>Open</button>
        {!archived && <button style={linkBtn} onClick={props.onStartRename}>Rename</button>}
        {!archived && <button style={linkBtn} onClick={props.onDuplicate}>Duplicate</button>}
        {!archived && <button style={linkBtn} onClick={props.onArchive}>Archive</button>}
        {archived && <button style={{ ...linkBtn, opacity: props.canRestore ? 1 : 0.4 }} disabled={!props.canRestore} onClick={props.onRestore}>Restore</button>}
      </div>
    </div>
  )
}

function ScenarioComparison({ ids, scenarios, c }: { ids: string[]; scenarios: ScenarioRow[]; c: ReturnType<typeof getDesignColors> }) {
  const rows = ['storeys', 'coverage_pct', 'avg_unit_area_sqm', 'parking_ratio', 'open_space_pct'] as const
  const labels: Record<typeof rows[number], string> = { storeys: 'Storeys', coverage_pct: 'Coverage %', avg_unit_area_sqm: 'Avg Unit (sqm)', parking_ratio: 'Parking Ratio', open_space_pct: 'Open Space %' }
  const selected = scenarios.filter(s => ids.includes(s.id))
  return (
    <div style={{ marginTop: 10, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6, fontWeight: 600 }}>COMPARISON</div>
      <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
        <thead><tr><th style={{ textAlign: 'left' }}></th>{selected.map(s => <th key={s.id} style={{ textAlign: 'right', color: c.textMuted }}>{s.reference || s.name}</th>)}</tr></thead>
        <tbody>{rows.map(key => (
          <tr key={key} style={{ borderTop: `1px solid ${c.border}` }}>
            <td style={{ padding: '4px 0', color: c.textMuted }}>{labels[key]}</td>
            {selected.map(s => <td key={s.id} style={{ padding: '4px 0', textAlign: 'right' }}>{(s as any)[key] ?? '—'}</td>)}
          </tr>
        ))}</tbody>
      </table>
      <div style={{ fontSize: 10, color: c.textFaint, marginTop: 6 }}>Differences only — no scenario is labelled best, winner, or recommended.</div>
    </div>
  )
}

/**
 * Small unplaced schematic of the site's raw beacon shape — directly
 * from raw_boundary_points (E/N pairs), never claiming to be a real
 * map placement. This is deliberately the ONLY place a survey shape
 * with an unconfirmed CRS is ever drawn; everywhere else in the app,
 * an unconfirmed-CRS site shows a point, never a shape.
 */
function SiteGeometrySchematic({ beacons, boundaryConfirmed, c }: { beacons: RawBeaconPoint[] | null; boundaryConfirmed: boolean; c: ReturnType<typeof getDesignColors> }) {
  if (boundaryConfirmed || !beacons || beacons.length < 3) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: 6, background: c.background, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <MapIcon size={18} color={c.textFaint} />
      </div>
    )
  }
  const xs = beacons.map(b => b.x), ys = beacons.map(b => b.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX || 1, h = maxY - minY || 1
  const pad = 6, size = 44
  const scale = Math.min((size - pad * 2) / w, (size - pad * 2) / h)
  const points = beacons.map(b => {
    const x = pad + (b.x - minX) * scale
    const y = size - pad - (b.y - minY) * scale // flip N so north is up
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={size} height={size} style={{ background: c.background, border: `1px solid ${c.border}`, borderRadius: 6, flexShrink: 0 }}>
      <polygon points={points} fill={c.statusAmber + '33'} stroke={c.statusAmber} strokeWidth={1.5} strokeDasharray="2 1.5" />
    </svg>
  )
}

/* ── style helpers ─────────────────────────────────────────────── */
function inputStyle(c: ReturnType<typeof getDesignColors>): React.CSSProperties {
  return { width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary }
}
function tabBtn(c: ReturnType<typeof getDesignColors>, active: boolean): React.CSSProperties {
  return { padding: '6px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: designTokens.radius.sm, cursor: 'pointer', background: active ? c.surfaceCard : 'transparent', color: active ? c.textPrimary : c.textMuted, borderBottom: active ? `2px solid ${c.intelligencePurple}` : '2px solid transparent' }
}
function stepBtn(c: ReturnType<typeof getDesignColors>): React.CSSProperties {
  return { width: 22, height: 22, borderRadius: '50%', border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary, cursor: 'pointer', fontSize: 14, lineHeight: 1 }
}
function primaryBtn(c: ReturnType<typeof getDesignColors>, disabled: boolean): React.CSSProperties {
  return { padding: '10px 16px', fontSize: 13, fontWeight: 600, borderRadius: designTokens.radius.sm, border: 'none', background: c.intelligencePurple, color: '#fff', cursor: disabled ? 'default' : 'pointer' }
}
function secondaryBtn(c: ReturnType<typeof getDesignColors>): React.CSSProperties {
  return { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px', fontSize: 12, borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary, cursor: 'pointer' }
}