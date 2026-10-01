// lib/site-intelligence.ts
//
// Types + provenance-aware style helpers for Site Intelligence.
// Revised to match the shared-model instruction: documents and
// enquiries use the SAME tables Reviewed Developments uses
// (developer_documents, inquiries), widened with a site_id column —
// not separate Site-only tables. See the migration file for the
// full rationale.
//
// Follows the same shape as getDataQualityStyle in lib/theme.ts:
// a function of `dark` that returns a Record keyed by the DB enum
// value, never a hardcoded verdict string in a component.
//
// IMPORTANT: nothing here may render language implying "should I buy
// this." site_status is a workflow state. evidence_status describes
// the state of a piece of evidence (Provided / Source-derived /
// Cross-referenced / Reviewed / Unable to Establish / Requires
// Further Verification) — never a blanket "Verified" badge. See the
// MANOP Site Intelligence blueprint §12 and the handover's language
// guardrails (§9, §15).

import { getDesignColors } from './theme'

export type SiteStatus = 'draft' | 'pending_review' | 'published' | 'archived'
export type OpportunityType =
  | 'vacant_land' | 'active_development' | 'completed_development'
  | 'redevelopment' | 'jv_opportunity' | 'land_for_sale'
export type TransactionStructure = 'outright_sale' | 'jv' | 'lease' | 'development_partnership'
export type EntrySource = 'landowner' | 'agency_submission' | 'developer_self' | 'manop_sourced'
export type CrsStatus = 'requires_verification' | 'confirmed' | 'unable_to_establish'

export type Confidence = 'high' | 'medium' | 'low' | 'unconfirmed'
export type EvidenceStatus =
  | 'provided' | 'source_derived' | 'cross_referenced'
  | 'reviewed' | 'unable_to_establish' | 'requires_further_verification'
export type DocumentStatus =
  | 'provided' | 'under_review' | 'reviewed'
  | 'unable_to_verify' | 'requires_further_verification'
export type LayerCategory =
  | 'planning' | 'environmental' | 'infrastructure'
  | 'development_activity' | 'market_context'
export type SourceType =
  | 'official_government' | 'professional_survey'
  | 'user_submitted' | 'third_party_public' | 'manop_derived'
export type InvestigationStatus = 'open' | 'resolved' | 'not_applicable'

export interface Site {
  id: string
  reference: string | null
  is_quick_review: boolean
  is_sandbox: boolean
  country_code: string
  state: string | null
  city: string
  neighborhood: string | null
  address_description: string | null
  lat: number | null
  lng: number | null
  boundary_area_sqm: number | null
  raw_boundary_points: { label: string; x: number; y: number }[] | null
  coordinate_source: string | null
  coordinate_reference_system: string | null
  coordinate_format: string | null
  coordinate_transform_note: string | null
  crs_status: CrsStatus
  area_sqm: number | null
  area_source: string | null
  opportunity_type: OpportunityType
  transaction_structure: TransactionStructure | null
  asking_price: number | null
  asking_price_currency: string
  price_per_sqm: number | null
  site_status: SiteStatus
  developer_id: string | null
  development_id: string | null
  submitting_agency_id: string | null
  submitted_by_user_id: string | null
  landowner_name: string | null
  landowner_contact: string | null
  entry_source: EntrySource
  mandate_document_url: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  review_notes: string | null
  considerations: string | null
  submitter_consent_confirmed: boolean
  submitter_consent_confirmed_at: string | null
  created_at: string
  updated_at: string
}

// Shared shape with developer_documents — a document may belong to
// a site, a development, a developer, or some combination.
export interface SharedDocument {
  id: string
  site_id: string | null
  project_id: string | null
  developer_id: string | null
  document_type: string
  document_name: string
  document_url: string | null
  status: DocumentStatus
  provided_at: string | null
  verified: boolean
  verification_note: string | null
  extracted_data: Record<string, unknown> | null
  extraction_status: 'not_attempted' | 'extracted_pending_confirmation' | 'confirmed' | 'extraction_failed'
  publicly_visible: boolean
}

export interface SiteIntelligenceLayer {
  id: string
  site_id: string
  layer_category: LayerCategory
  layer_type: string
  label: string
  value_summary: string | null
  value_data: Record<string, unknown> | null
  source: string
  source_type: SourceType
  source_date: string | null
  confidence: Confidence
  evidence_status: EvidenceStatus
  // The four-layer model (blueprint §14) — kept distinct so a
  // component never blurs "what the data says" into "what this means"
  fact: string | null
  interpretation: string | null
  consideration: string | null
  action_note: string | null
  notes: string | null
}

export interface InvestigationItem {
  id: string
  site_id: string | null
  development_id: string | null
  label: string
  status: InvestigationStatus
  resolution_note: string | null
}

// ── Site status — workflow, never a verdict ─────────────────────
export function getSiteStatusStyle(dark: boolean): Record<SiteStatus, { label: string; color: string; bg: string }> {
  const c = getDesignColors(dark)
  return {
    draft:          { label: 'Draft',          color: c.textMuted,        bg: 'transparent' },
    pending_review: { label: 'Pending Review', color: c.statusAmber,      bg: c.statusAmberBg },
    published:      { label: 'Published',      color: c.verificationTeal, bg: c.verificationTealBg },
    archived:       { label: 'Archived',       color: c.textFaint,        bg: 'transparent' },
  }
}

// ── Confidence — how sure MANOP is in the interpretation ─────────
export function getConfidenceStyle(dark: boolean): Record<Confidence, { label: string; color: string }> {
  const c = getDesignColors(dark)
  return {
    high:        { label: 'High confidence',   color: c.verificationTeal },
    medium:      { label: 'Medium confidence', color: c.statusAmber },
    low:         { label: 'Low confidence',    color: c.statusAmber },
    unconfirmed: { label: 'Unconfirmed',       color: c.textMuted },
  }
}

// ── Evidence status — the state of a piece of evidence, per the
// blueprint's own vocabulary (§12). Deliberately six states, not a
// verified/unverified binary.
export function getEvidenceStatusStyle(dark: boolean): Record<EvidenceStatus, { label: string; color: string; bg: string }> {
  const c = getDesignColors(dark)
  return {
    provided:                       { label: 'Provided',                      color: c.textMuted,        bg: 'transparent' },
    source_derived:                 { label: 'Source-derived',                color: c.intelligencePurple, bg: c.intelligencePurpleBg },
    cross_referenced:               { label: 'Cross-referenced',              color: c.intelligencePurple, bg: c.intelligencePurpleBg },
    reviewed:                       { label: 'MANOP Reviewed',                color: c.verificationTeal, bg: c.verificationTealBg },
    unable_to_establish:            { label: 'Unable to Establish',           color: c.statusRed,        bg: c.statusRedBg },
    requires_further_verification:  { label: 'Requires Further Verification', color: c.statusAmber,      bg: c.statusAmberBg },
  }
}

// ── Document status (mirrors Reviewed Developments' vocabulary) ──
export function getDocumentStatusStyle(dark: boolean): Record<DocumentStatus, { label: string; color: string; bg: string }> {
  const c = getDesignColors(dark)
  return {
    provided:                       { label: 'Provided',                      color: c.textMuted,        bg: 'transparent' },
    under_review:                   { label: 'Under Review',                  color: c.statusAmber,      bg: c.statusAmberBg },
    reviewed:                       { label: 'Reviewed',                      color: c.verificationTeal, bg: c.verificationTealBg },
    unable_to_verify:               { label: 'Unable to Verify',              color: c.statusRed,        bg: c.statusRedBg },
    requires_further_verification:  { label: 'Requires Further Verification', color: c.statusAmber,      bg: c.statusAmberBg },
  }
}

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  vacant_land:            'Vacant Land',
  active_development:     'Active Development',
  completed_development:  'Completed Development',
  redevelopment:           'Redevelopment Opportunity',
  jv_opportunity:          'JV Opportunity',
  land_for_sale:           'Land for Sale',
}

export const LAYER_CATEGORY_LABEL: Record<LayerCategory, string> = {
  planning:               'Planning Context',
  environmental:          'Environmental',
  infrastructure:         'Infrastructure Access',
  development_activity:   'Development Activity',
  market_context:         'Market Context',
}

export const ENTRY_SOURCE_LABEL: Record<EntrySource, string> = {
  landowner:          'Landowner',
  agency_submission:  'Agency',
  developer_self:     'Developer',
  manop_sourced:      'MANOP',
}

export function formatArea(sqm: number | null): string {
  if (sqm == null) return 'Data unavailable'
  return `${sqm.toLocaleString(undefined, { maximumFractionDigits: 0 })} sqm`
}

export function formatSourceLine(source: string, sourceDate: string | null): string {
  return sourceDate ? `${source} · ${sourceDate}` : source
}

/** True when `c` is a finite [lng, lat] pair inside valid WGS84 ranges. */
function isLngLat(c: unknown): boolean {
  return Array.isArray(c) && c.length >= 2
    && typeof c[0] === 'number' && typeof c[1] === 'number'
    && Number.isFinite(c[0]) && Number.isFinite(c[1])
    && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90
}
const isLine = (c: unknown, min: number) => Array.isArray(c) && c.length >= min && c.every(isLngLat)
const isRing = (c: unknown) => isLine(c, 4) && JSON.stringify((c as number[][])[0]) === JSON.stringify((c as number[][])[(c as number[][]).length - 1])

/**
 * Strict structural validation of a GeoJSON geometry. A layer's geometry is only
 * ever drawn if it passes this — malformed, out-of-range (e.g. projected E/N
 * coordinates mistaken for lng/lat), or empty geometry is treated as "no
 * geometry", never repaired or guessed at. Supports Point, LineString, Polygon,
 * MultiPolygon.
 */
export function isValidLayerGeometry(g: unknown): g is GeoJSON.Geometry {
  if (!g || typeof g !== 'object') return false
  const { type, coordinates } = g as { type?: unknown; coordinates?: unknown }
  switch (type) {
    case 'Point': return isLngLat(coordinates)
    case 'LineString': return isLine(coordinates, 2)
    case 'Polygon': return Array.isArray(coordinates) && coordinates.length >= 1 && coordinates.every(isRing)
    case 'MultiPolygon': return Array.isArray(coordinates) && coordinates.length >= 1
      && coordinates.every(poly => Array.isArray(poly) && poly.length >= 1 && poly.every(isRing))
    default: return false
  }
}

/**
 * Spatial layer toggle system (Site Studio composable-scenario
 * directive, §3–4): "if MANOP has a real polygon, show the polygon;
 * if MANOP has a point, show the point; if MANOP has no geometry, do
 * not invent one." This function is the enforcement point for that
 * rule — it looks for geometry ONLY in value_data, in one of two
 * shapes, and returns null for anything else, including a layer that
 * merely LOOKS like it should have a location (a "Flood Zone" layer
 * with no coordinates gets null, same as everything else):
 *   - value_data.geometry: a GeoJSON Point/LineString/Polygon/MultiPolygon in WGS84 lng/lat
 *   - value_data.point: { lat: number; lng: number }
 * AUDIT FINDING, stated plainly: as of the last Repomix, value_data is declared
 * on SiteIntelligenceLayer but never written or read anywhere else in the
 * codebase — no Site Intelligence ingestion path populates it yet. So every
 * layer resolves to null today. That is the CORRECT behavior of this function
 * given the current data. See docs/SITE_INTELLIGENCE_LAYER_GEOMETRY_CONTRACT.md
 * for the upstream dependency and the exact payload shapes Site Intelligence
 * must write for these toggles to light up.
 */
export function resolveLayerGeometry(layer: SiteIntelligenceLayer): GeoJSON.Geometry | null {
  const data = layer.value_data
  if (!data) return null
  const geometry = (data as { geometry?: unknown }).geometry
  if (isValidLayerGeometry(geometry)) return geometry
  const point = (data as { point?: unknown }).point as { lat?: unknown; lng?: unknown } | undefined
  if (point && isLngLat([point.lng, point.lat])) {
    return { type: 'Point', coordinates: [point.lng as number, point.lat as number] }
  }
  return null
}

/** One color per Site Intelligence layer category, used consistently
 * wherever a layer's real geometry is drawn (map + legend), so a
 * planning constraint is always the same color regardless of which
 * layer_type produced it. */
export const LAYER_CATEGORY_COLOR: Record<LayerCategory, string> = {
  planning: '#2563EB',
  environmental: '#16A34A',
  infrastructure: '#D97706',
  development_activity: '#DB2777',
  market_context: '#64748B',
}