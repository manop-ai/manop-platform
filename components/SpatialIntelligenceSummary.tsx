// components/SpatialIntelligenceSummary.tsx
//
// A compact summary of a site's spatial intelligence, meant to be
// embedded on a Development's own profile page (blueprint §19: "the
// two products aren't competitors, they're two states of the same
// development intelligence system" — a development's dossier should
// be able to show its underlying site).
//
// HAND-OFF NOTE: this component is self-contained and safe to import
// into app/development/[id]/page.tsx (Reviewed Developments' file) —
// I'm not editing that file myself, since it belongs to the other
// track. Usage there would look like:
//
//   {project.site_id && <SpatialIntelligenceSummary siteId={project.site_id} dark={dark} />}
//
// That assumes `developer_projects` gains a `site_id` column pointing
// back at `sites.id` — the reverse of `sites.development_id`, which
// already exists. Either FK works for the link; whoever sets it just
// needs to pick one direction and use it consistently. Flag this to
// the other Claude Code before wiring it in.

import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Site, OPPORTUNITY_TYPE_LABEL, formatArea } from '../lib/site-intelligence'
import { getDesignColors, designTokens } from '../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export default async function SpatialIntelligenceSummary({
  siteId, dark = true,
}: { siteId: string; dark?: boolean }) {
  const c = getDesignColors(dark)
  const { data: site } = await sb.from('sites').select('*').eq('id', siteId).single()
  const { count: layerCount } = await sb
    .from('site_intelligence_layers')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId)

  if (!site) return null
  const s = site as Site

  return (
    <div style={{
      background: c.surfaceCard, border: `1px solid ${c.border}`,
      borderRadius: designTokens.radius.sm, padding: 16, fontFamily: designTokens.font.family,
    }}>
      <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 8 }}>SPATIAL INTELLIGENCE</div>
      <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: c.textMuted }}>Opportunity type</div>
          <div style={{ fontSize: 14 }}>{OPPORTUNITY_TYPE_LABEL[s.opportunity_type]}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: c.textMuted }}>Area</div>
          <div style={{ fontSize: 14 }}>{formatArea(s.area_sqm ?? s.boundary_area_sqm)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: c.textMuted }}>Intelligence layers on record</div>
          <div style={{ fontSize: 14 }}>{layerCount ?? 0}</div>
        </div>
      </div>
      <Link
        href={`/site-intelligence/${s.id}`}
        style={{ fontSize: 13, color: c.intelligencePurple, textDecoration: 'none' }}
      >
        View full Site Intelligence Profile →
      </Link>
    </div>
  )
}