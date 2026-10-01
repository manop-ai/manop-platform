// app/site-intelligence/sandbox/page.tsx
//
// MANOP Site Studio Test Environment (product evolution directive
// §10-11). Sandbox sites are seeded as site_status = 'draft' and
// never reviewed, so they're already excluded from the real Site
// Discovery listing — this page is the only way to reach them.
//
// FAILS LOUDLY, not silently: earlier versions of this page (and
// app/admin/sites/page.tsx) queried `is_sandbox` without checking
// `error`, so when the migration that adds that column hadn't
// actually been run against the live database yet, the query threw,
// `data` came back null, and the page just showed an empty "no
// sandbox sites seeded" message — which looked exactly like a real
// regression (and, in admin/sites/page.tsx, made the ENTIRE review
// queue appear empty, not just the sandbox). This version surfaces
// that distinction explicitly.

import Link from 'next/link'
import { sbServerRead as sb } from '../../../lib/supabase/server-read'
import SiteIntelligenceNav from '../../../components/SiteIntelligenceNav'
import { Card, Badge, Fact, Muted } from '../../../components/site-intelligence-ui'
import { Site, OPPORTUNITY_TYPE_LABEL, formatArea } from '../../../lib/site-intelligence'
import { getDesignColors, designTokens } from '../../../lib/theme'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const dark = true
const c = getDesignColors(dark)

interface DocSummary { document_type: string; extraction_status: string | null }

export default async function StudioSandboxPage() {
  const { data, error } = await sb
    .from('sites')
    .select('*')
    .eq('is_sandbox', true)
    .order('reference', { ascending: true })

  // A failed query (e.g. is_sandbox doesn't exist yet because the
  // migration hasn't run) is NOT the same thing as "zero sandbox
  // sites" — show the real error instead of a misleading empty state.
  if (error) {
    return (
      <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family, padding: 32 }}>
        <SiteIntelligenceNav dark={dark} />
        <div style={{ border: `1px solid ${c.statusRed}`, borderRadius: designTokens.radius.sm, padding: 16, maxWidth: 640, marginTop: 20 }}>
          <div style={{ fontWeight: 700, color: c.statusRed, marginBottom: 6 }}>Could not load the test environment</div>
          <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 10 }}>{error.message}</div>
          <div style={{ fontSize: 12.5, color: c.textFaint }}>
            If this mentions <code>is_sandbox</code> or a missing column, the Site Studio sandbox migration
            (sql/2026_site_studio_sandbox_and_credits.sql) hasn't been run against this database yet — this
            page and the admin review queue both depend on that column existing. Run it, then reload.
          </div>
        </div>
      </div>
    )
  }

  const sites = (data || []) as Site[]

  // Per-site document/investigation counts — real substance, not a
  // placeholder card. Small N here (test sites only), fine as N+1.
  const details = await Promise.all(sites.map(async (s) => {
    const [{ data: docs }, { data: investigations }, { data: boundaryGeoJson }] = await Promise.all([
      sb.from('developer_documents').select('document_type, extraction_status').eq('site_id', s.id),
      sb.from('investigation_items').select('id, status').eq('site_id', s.id),
      sb.rpc('get_site_boundary_geojson', { p_site_id: s.id }),
    ])
    return {
      site: s,
      docs: (docs || []) as DocSummary[],
      openInvestigations: (investigations || []).filter(i => i.status === 'open').length,
      hasConfirmedBoundary: !!boundaryGeoJson,
    }
  }))

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family, padding: 32 }}>
      <SiteIntelligenceNav dark={dark} />

      <div style={{
        display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
        color: c.statusAmber, border: `1px solid ${c.statusAmber}`, borderRadius: 4, padding: '3px 8px', marginBottom: 10,
      }}>
        TEST ENVIRONMENT — NOT PRODUCTION SITE INTELLIGENCE
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px' }}>MANOP Site Studio Test Environment</h1>
      <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 28, maxWidth: 680 }}>
        Explore Site Studio using controlled test sites. These records are isolated from public Site Discovery
        and the admin review queue, and exist only for product testing and development — never real submissions
        or MANOP intelligence.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {details.map(({ site: s, docs, openInvestigations, hasConfirmedBoundary }) => (
          <Card key={s.id} c={c}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{s.reference}</span>
              <Badge label="TEST" color={c.statusAmber} bg="transparent" />
            </div>

            <Fact c={c} label="MANOP ID" value={s.id} />
            <Fact c={c} label="Location" value={`${s.neighborhood ? s.neighborhood + ', ' : ''}${s.city}`} />
            <Fact c={c} label="Opportunity Type" value={OPPORTUNITY_TYPE_LABEL[s.opportunity_type]} />
            <Fact c={c} label="Area" value={formatArea(s.area_sqm ?? s.boundary_area_sqm)} />
            <Fact
              c={c}
              label="Geometry"
              value={
                hasConfirmedBoundary ? 'Confirmed polygon boundary'
                : s.raw_boundary_points ? `Raw survey shape — CRS ${s.crs_status.replace(/_/g, ' ')}`
                : s.lat ? 'Point location only'
                : 'No coordinates yet'
              }
            />
            {docs.length > 0 && (
              <Fact c={c} label="Documents" value={docs.map(d => `${d.document_type}${d.extraction_status && d.extraction_status !== 'not_attempted' ? ` (${d.extraction_status.replace(/_/g, ' ')})` : ''}`).join(', ')} />
            )}
            {openInvestigations > 0 && <Fact c={c} label="Open Investigation Items" value={String(openInvestigations)} />}

            {s.reference === 'SITE-TEST-001' && (
              <div style={{ fontSize: 11.5, color: c.statusAmber, marginTop: 8, lineHeight: 1.5 }}>
                This site's survey plan does not close cleanly when its own bearings/distances are walked
                (see the document's extraction note) — kept deliberately unresolved to test MANOP's
                provenance/uncertainty handling. Use SITE-TEST-002 for a clean-geometry Studio walkthrough.
              </div>
            )}

            <Link
              href={`/site-intelligence/${s.id}/studio`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
                padding: '8px 14px', borderRadius: designTokens.radius.sm, background: c.intelligencePurple,
                color: '#fff', textDecoration: 'none', marginTop: 14,
              }}
            >
              Open in Site Studio
            </Link>
          </Card>
        ))}

        {sites.length === 0 && (
          <Muted c={c}>No sandbox sites found — run sql/2026_site_studio_sandbox_and_credits.sql against this database.</Muted>
        )}
      </div>
    </div>
  )
}