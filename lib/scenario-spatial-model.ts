// lib/scenario-spatial-model.ts
//
// Phase 2 of the composable-scenario directive: "the 3D representation
// should be a visualization of the scenario model, not the scenario
// model itself" — there must be ONE spatial model, with 2D and 3D as
// two projections of it, not two independent reconstructions.
//
// Before this file: ScenarioMap.tsx derived its 2D Mapbox sources
// AND its 3D MassingBuilding[]/MassingOpenSpace[] scene independently,
// inline, in two separate effects, each re-reading the same raw
// buildings/openSpaces/parking props from scratch. They happened to
// agree because both were simple enough to hand-write correctly, but
// there was no single object either view could be checked against —
// exactly the gap the brief calls out.
//
// This file is that single object. buildScenarioSpatialModel() is the
// ONLY place that turns the scenario's real data (buildings, open
// space, the indicative parking preview, resolved Site Intelligence
// layers, development category, selection state) into a spatial
// model. Every 2D and 3D rendering target is then a small, pure
// projector function OFF that one model — never a second
// reconstruction from the raw props.
//
// Deliberately NOT a new persistence layer or a new API: this sits
// entirely in the browser, downstream of the same scenario_elements /
// scenario_readings data the deterministic engine already produces.
// It does not change what is stored, computed, or evidence-tagged —
// only how the two views are assembled from it.

import type { BuildingFeature, OpenSpaceFeature } from '../components/ScenarioMap'
import type { MassingCategory } from './massing-geometry'

export interface SpatialBuilding {
  id: string
  geojson: GeoJSON.Polygon
  storeys: number
  heightM: number | null
  category: string
  selected: boolean
}

export interface SpatialOpenSpace {
  id: string
  geojson: GeoJSON.Polygon
}

/** The indicative parking preview — deliberately a single optional
 * slot, not an array, because there is exactly one generated preview
 * per scenario today (see buildIndicativeParkingPolygon). Becomes a
 * real array once parking is a placed/editable scenario_elements
 * object (flagged in the Site Studio audit, not this pass). */
export interface SpatialParking {
  geojson: GeoJSON.Polygon
  stallCount: number
}

export interface SpatialIntelligenceLayer {
  id: string
  category: string
  label: string
  geometry: GeoJSON.Geometry
}

export interface ScenarioSpatialModel {
  developmentCategory: string
  buildings: SpatialBuilding[]
  openSpaces: SpatialOpenSpace[]
  parking: SpatialParking | null
  intelligenceLayers: SpatialIntelligenceLayer[]
}

export interface BuildSpatialModelInput {
  buildings: BuildingFeature[]
  openSpaces: OpenSpaceFeature[]
  parkingPolygon: GeoJSON.Polygon | null
  parkingStallCount: number | null
  intelligenceLayers: SpatialIntelligenceLayer[]
  developmentCategory: string
  selectedBuildingId: string | null
}

export function buildScenarioSpatialModel(input: BuildSpatialModelInput): ScenarioSpatialModel {
  return {
    developmentCategory: input.developmentCategory,
    buildings: input.buildings.map(b => ({
      id: b.id,
      geojson: b.geojson,
      storeys: b.storeys ?? 1,
      heightM: b.height_m,
      category: input.developmentCategory,
      selected: b.id === input.selectedBuildingId,
    })),
    openSpaces: input.openSpaces.map(o => ({ id: o.id, geojson: o.geojson })),
    parking: (input.parkingPolygon && input.parkingStallCount && input.parkingStallCount > 0)
      ? { geojson: input.parkingPolygon, stallCount: input.parkingStallCount }
      : null,
    intelligenceLayers: input.intelligenceLayers,
  }
}

// ── 2D projections — Mapbox GeoJSON FeatureCollections ──────────────

export function modelToBuildingsFeatureCollection(model: ScenarioSpatialModel): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: model.buildings.map(b => ({
      type: 'Feature',
      geometry: b.geojson,
      properties: { id: b.id, height: b.heightM ?? 0, selected: b.selected },
    })),
  }
}

export function modelToOpenSpacesFeatureCollection(model: ScenarioSpatialModel): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: model.openSpaces.map(o => ({ type: 'Feature', geometry: o.geojson, properties: { id: o.id } })),
  }
}

export function modelToParkingFeatureCollection(model: ScenarioSpatialModel): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: model.parking ? [{ type: 'Feature', geometry: model.parking.geojson, properties: {} }] : [],
  }
}

export function modelToIntelligenceLayersFeatureCollection(
  model: ScenarioSpatialModel,
  colorFor: (category: string) => string,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: model.intelligenceLayers.map(l => ({
      type: 'Feature',
      geometry: l.geometry,
      properties: { id: l.id, label: l.label, category: l.category, color: colorFor(l.category) },
    })),
  }
}

// ── 3D projections — the exact shapes ThreeMassingLayer expects ─────
// (MassingBuilding/MassingOpenSpace use real lat/lng; ThreeMassingLayer
// itself converts to its local frame via toLocal — that conversion
// stays a 3D-layer concern, not duplicated here.)

export function modelToMassingBuildings(model: ScenarioSpatialModel): {
  id: string; points: { lat: number; lng: number }[]; storeys: number; category: MassingCategory; selected: boolean
}[] {
  return model.buildings.map(b => ({
    id: b.id,
    points: b.geojson.coordinates[0].map(([lng, lat]) => ({ lat, lng })),
    storeys: b.storeys,
    category: (b.category as MassingCategory) || 'multifamily_residential',
    selected: b.selected,
  }))
}

export function modelToMassingOpenSpaces(model: ScenarioSpatialModel): { points: { lat: number; lng: number }[] }[] {
  return model.openSpaces.map(o => ({ points: o.geojson.coordinates[0].map(([lng, lat]) => ({ lat, lng })) }))
}

export function modelToMassingParking(model: ScenarioSpatialModel): { points: { lat: number; lng: number }[] | null; stallCount: number | null } {
  if (!model.parking) return { points: null, stallCount: null }
  return {
    points: model.parking.geojson.coordinates[0].map(([lng, lat]) => ({ lat, lng })),
    stallCount: model.parking.stallCount,
  }
}