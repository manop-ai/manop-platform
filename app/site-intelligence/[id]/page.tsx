// app/site-intelligence/[id]/page.tsx

import { sbServerRead as sb } from '../../../lib/supabase/server-read'
import { Clock, FileWarning, ListChecks, AlertTriangle } from 'lucide-react'
import SiteBoundaryMap from '../../../components/SiteBoundaryMap'
import { BackToDiscovery } from '../../../components/SiteIntelligenceNav'
import RequestFullReviewButton from './RequestFullReviewButton'
import {
  Card, Section, Fact, Muted, Badge, EvidenceBadge, DocStatusBadge,
} from '../../../components/site-intelligence-ui'
import { ManopMark } from '../../../components/ManopMark'
import {
  Site, SharedDocument, SiteIntelligenceLayer, InvestigationItem,
  OPPORTUNITY_TYPE_LABEL, ENTRY_SOURCE_LABEL,
  formatArea, formatSourceLine,
} from '../../../lib/site-intelligence'
import { getDesignColors, designTokens } from '../../../lib/theme'
import { getServerDark } from '../../../lib/theme-server'
import LogSiteView from './LogSiteView'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type C = ReturnType<typeof getDesignColors>

const EXPECTED_LAYER_TYPES: { category: string; type: string; label: string }[] = [
  { category: 'planning',       type: 'zoning_designation',  label: 'Zoning designation' },
  { category: 'planning',       type: 'master_plan_context', label: 'Master plan relationship' },
  { category: 'environmental',  type: 'flood_risk_zone',     label: 'Flood risk zone' },
  { category: 'infrastructure', type: 'road_access',         label: 'Road access' },
  { category: 'market_context', type: 'nearby_developments', label: 'Nearby development activity' },
]

export default async function SiteIntelligencePage({ params }: { params: { id: string } }) {
  const dark = await getServerDark()
  const c = getDesignColors(dark)

  const [{ data: site }, { data: documents }, { data: layers }, { data: investigations }, { data: boundaryGeoJson }] = await Promise.all([
    sb.from('sites').select('*').eq('id', params.id).single(),
    sb.from('developer_documents').select('*').eq('site_id', params.id).eq('publicly_visible', true).order('provided_at', { ascending: false }),
    sb.from('site_intelligence_layers').select('*').eq('site_id', params.id),
    sb.from('investigation_items').select('*').eq('site_id', params.id).order('status', { ascending: true }),
    sb.rpc('get_site_boundary_geojson', { p_site_id: params.id }),
  ])

  if (!site) {
    return (
      <div style={{ padding: 40, fontFamily: designTokens.font.family, background: c.background, color: c.textPrimary, minHeight: '100vh' }}>
        <BackToDiscovery dark={dark} />
        <div style={{ color: c.textMuted }}>Site not found, or not yet published.</div>
      </div>
    )
  }

  const s = site as Site
  const docs = (documents || []) as SharedDocument[]
  const intel = (layers || []) as SiteIntelligenceLayer[]
  const investigation = (investigations || []) as InvestigationItem[]

  const presentTypes = new Set(intel.map(l => l.layer_type))
  const missingLayers = EXPECTED_LAYER_TYPES.filter(e => !presentTypes.has(e.type))
  const unestablished = intel.filter(l => l.evidence_status === 'unable_to_establish')
  const openInvestigations = investigation.filter(i => i.status === 'open')

  const hasCategory = (cat: string) =>
    intel.some(l => l.layer_category === cat && l.evidence_status !== 'unable_to_establish')

  const availability: { label: string; status: 'available' | 'partial' | 'unknown' }[] = [
    { label: 'Geometry', status: s.lat == null || s.lng == null ? 'unknown' : (s.boundary_area_sqm ? 'available' : 'partial') },
    { label: 'Planning', status: hasCategory('planning') ? 'available' : 'unknown' },
    { label: 'Infrastructure', status: hasCategory('infrastructure') ? 'available' : 'unknown' },
    { label: 'Environmental', status: hasCategory('environmental') ? 'available' : 'unknown' },
    { label: 'Market context', status: hasCategory('market_context') ? 'available' : 'unknown' },
    { label: 'Documents', status: docs.length > 0 ? 'available' : 'unknown' },
  ]

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family, padding: '32px' }}>
      <BackToDiscovery dark={dark} />
      <LogSiteView siteId={s.id} city={s.city} neighborhood={s.neighborhood} countryCode={s.country_code} />

      {/* ── Header banner ──────────────────────────────────── */}
      <div style={{
        border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.intelligencePurple}`,
        borderRadius: designTokens.radius.sm, padding: '18px 20px', marginBottom: 16,
        background: c.surfaceCard,
      }}>
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>
          Site Intelligence {s.reference ? `· ${s.reference}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {s.neighborhood ? `${s.neighborhood}, ` : ''}{s.city}
          </h1>
          <Badge label={OPPORTUNITY_TYPE_LABEL[s.opportunity_type]} color={c.intelligencePurple} bg={c.intelligencePurpleBg} />
          {s.is_quick_review
            ? <Badge label="Quick Review — Not MANOP Reviewed" color={c.statusAmber} bg={c.statusAmberBg} icon={<AlertTriangle size={12} />} />
            : s.reviewed_at
              ? <Badge label="MANOP Reviewed" color={c.verificationTeal} bg={c.verificationTealBg} icon={<ManopMark size={12} color={c.verificationTeal} />} />
              : <Badge label="Pending Review" color={c.statusAmber} bg={c.statusAmberBg} icon={<Clock size={12} />} />}
        </div>
        <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 14 }}>
          Submitted via {ENTRY_SOURCE_LABEL[s.entry_source]}
        </div>

        {s.is_quick_review && s.site_status === 'draft' && (
          <div style={{
            fontSize: 13, marginBottom: 14, padding: '12px 14px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between', gap: 12,
            border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm,
          }}>
            <span style={{ color: c.textMuted }}>
              This is an instant, automated check only — no MANOP staff have reviewed this site,
              and no documents have been collected.
            </span>
            <RequestFullReviewButton siteId={s.id} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <a href={`/site-intelligence/${s.id}/studio`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            padding: '9px 15px', borderRadius: designTokens.radius.sm,
            border: `1px solid ${c.intelligencePurple}`, background: 'transparent',
            color: c.intelligencePurple, textDecoration: 'none',
          }}>
            Explore This Site
          </a>
          <a href={`/site-intelligence/${s.id}/appraisal`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            padding: '9px 15px', borderRadius: designTokens.radius.sm, border: 'none',
            background: c.intelligencePurple, color: '#fff', textDecoration: 'none',
          }}>
            Run Construction Appraisal
          </a>
        </div>
      </div>

      {/* ── Data availability strip ───────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {availability.map(a => {
          const style = a.status === 'available'
            ? { color: c.verificationTeal, bg: c.verificationTealBg }
            : a.status === 'partial'
              ? { color: c.statusAmber, bg: c.statusAmberBg }
              : { color: c.textMuted, bg: 'transparent' }
          return (
            <span key={a.label} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
              padding: '5px 10px', borderRadius: designTokens.radius.badge,
              color: style.color, background: style.bg,
              border: a.status === 'unknown' ? `1px solid ${c.border}` : 'none',
            }}>
              {a.label} · {a.status === 'available' ? 'Available' : a.status === 'partial' ? 'Partial' : 'Unknown'}
            </span>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* ── Left column ─────────────────────────────────── */}
        <div>
          <Section c={c} title="Spatial Identity">
            <SiteBoundaryMap lat={s.lat} lng={s.lng} boundary={boundaryGeoJson || null} height={340} dark={dark} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
              <Fact c={c} label="Area" value={formatArea(s.area_sqm ?? s.boundary_area_sqm)} />
              <Fact c={c} label="Coordinate source" value={s.coordinate_source || 'Not provided'} />
              <Fact
                c={c} label="Coordinate reference system"
                value={s.crs_status === 'confirmed' ? (s.coordinate_reference_system || 'Confirmed') : 'Requires verification'}
              />
            </div>
          </Section>

          <Section c={c} title="Planning Context">
            <LayerList layers={intel.filter(l => l.layer_category === 'planning')} c={c} dark={dark} />
          </Section>
          <Section c={c} title="Infrastructure Context">
            <LayerList layers={intel.filter(l => l.layer_category === 'infrastructure')} c={c} dark={dark} />
          </Section>
          <Section c={c} title="Environmental">
            <LayerList layers={intel.filter(l => l.layer_category === 'environmental')} c={c} dark={dark} />
          </Section>
          <Section c={c} title="Market Context">
            <LayerList layers={intel.filter(l => l.layer_category === 'market_context')} c={c} dark={dark} />
          </Section>
          <Section c={c} title={`Evidence (${docs.length} document${docs.length === 1 ? '' : 's'})`}>
            {docs.length === 0
              ? <Muted c={c}>No documents supplied yet.</Muted>
              : docs.map(d => <DocumentRow key={d.id} doc={d} c={c} dark={dark} />)}
          </Section>
        </div>

        {/* ── Right column ────────────────────────────────── */}
        <div>
          <Card c={c}>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 4 }}>SITE OVERVIEW</div>
            <Fact c={c} label="Country" value={s.country_code} />
            <Fact c={c} label="State" value={s.state || '—'} />
            <Fact c={c} label="City" value={s.city} />
            <Fact c={c} label="Transaction structure" value={s.transaction_structure || 'Not specified'} />
            {s.asking_price && (
              <Fact c={c} label="Asking price" value={`${s.asking_price_currency} ${s.asking_price.toLocaleString()}`} />
            )}
          </Card>

          <Card c={c}>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>CONSIDERATIONS</div>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{s.considerations || 'None identified yet.'}</p>
          </Card>

          <div style={{
            background: c.surfaceCard, border: `1px solid ${c.border}`,
            borderLeft: `4px solid ${missingLayers.length + unestablished.length > 0 ? c.statusAmber : c.border}`,
            borderRadius: designTokens.radius.sm, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileWarning size={13} /> INFORMATION GAPS ({missingLayers.length + unestablished.length})
            </div>
            {missingLayers.length === 0 && unestablished.length === 0
              ? <Muted c={c}>No known gaps in the layers MANOP currently tracks for this site.</Muted>
              : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                  {missingLayers.map(m => <li key={m.type}>{m.label} — not yet established</li>)}
                  {unestablished.map(l => <li key={l.id}>{l.label} — {l.notes || 'unable to establish from available sources'}</li>)}
                </ul>
              )}
          </div>

          <div style={{
            background: c.surfaceCard, border: `1px solid ${c.border}`,
            borderLeft: `4px solid ${openInvestigations.length > 0 ? c.intelligencePurple : c.border}`,
            borderRadius: designTokens.radius.sm, padding: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ListChecks size={13} /> FURTHER INVESTIGATION ({openInvestigations.length})
            </div>
            {openInvestigations.length === 0
              ? <Muted c={c}>No open investigation items.</Muted>
              : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
                  {openInvestigations.map(i => <li key={i.id}>{i.label}</li>)}
                </ul>
              )}
          </div>

          <div style={{
            fontSize: 12, color: c.textFaint, lineHeight: 1.6, marginTop: 16,
            padding: '12px 14px', border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm,
          }}>
            This intelligence is based on available information and identified sources.
            It is intended to support preliminary development research and does not
            replace professional surveying, planning, legal, valuation, or other due diligence.
          </div>
        </div>
      </div>
    </div>
  )
}

function LayerList({ layers, c, dark }: { layers: SiteIntelligenceLayer[]; c: C; dark: boolean }) {
  if (layers.length === 0) return <Muted c={c}>Data unavailable for this section.</Muted>
  return (
    <div>
      {layers.map(l => (
        <Card key={l.id} c={c}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{l.label}</div>
            <EvidenceBadge status={l.evidence_status} dark={dark} />
          </div>
          {l.value_summary && <div style={{ fontSize: 13.5, marginBottom: 6 }}>{l.value_summary}</div>}
          {l.fact && <div style={{ fontSize: 13, marginBottom: 4 }}><b>Observed:</b> {l.fact}</div>}
          {l.consideration && <div style={{ fontSize: 13, marginBottom: 4, color: c.statusAmber }}><b>Consideration:</b> {l.consideration}</div>}
          <div style={{ fontSize: 11.5, color: c.textFaint, marginTop: 8 }}>{formatSourceLine(l.source, l.source_date)}</div>
        </Card>
      ))}
    </div>
  )
}

function DocumentRow({ doc, c, dark }: { doc: SharedDocument; c: C; dark: boolean }) {
  return (
    <Card c={c}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14 }}>{doc.document_name}</div>
          <div style={{ fontSize: 11.5, color: c.textMuted, textTransform: 'capitalize' }}>{doc.document_type.replace(/_/g, ' ')}</div>
        </div>
        <DocStatusBadge status={doc.status} dark={dark} />
      </div>
    </Card>
  )
}