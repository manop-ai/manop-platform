// components/MySitesList.tsx
//
// HAND-OFF COMPONENT for the agency dashboard panel. Server component
// — pass the agency's data_partners.id (the value the agency dashboard
// already has in scope from its own auth/session lookup; I don't
// invent a way to get it here, since that's the other track's
// existing session-handling code).
//
// Usage in app/agency/dashboard/page.tsx:
//   import MySitesList from '../../../components/MySitesList'
//   ...
//   <MySitesList agencyId={agency.id} dark={dark} />

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Site, OPPORTUNITY_TYPE_LABEL, getSiteStatusStyle } from '../lib/site-intelligence'
import { getDesignColors, designTokens } from '../lib/theme'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export default async function MySitesList({ agencyId, dark = true }: { agencyId: string; dark?: boolean }) {
  const c = getDesignColors(dark)
  const { data } = await sb
    .from('sites')
    .select('*')
    .eq('submitting_agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(10)

  const sites = (data || []) as Site[]

  if (sites.length === 0) {
    return (
      <div style={{ fontSize: 13, color: c.textMuted, fontFamily: designTokens.font.family }}>
        No sites submitted yet. <Link href="/site-intelligence/submit" style={{ color: c.intelligencePurple }}>Submit one</Link>.
      </div>
    )
  }

  return (
    <div style={{ fontFamily: designTokens.font.family }}>
      {sites.map((s) => {
        const statusStyle = getSiteStatusStyle(dark)[s.site_status]
        return (
          <Link
            key={s.id}
            href={`/site-intelligence/${s.id}`}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: `1px solid ${c.border}`,
              textDecoration: 'none', color: 'inherit',
            }}
          >
            <div>
              <div style={{ fontSize: 13.5 }}>{s.neighborhood ? `${s.neighborhood}, ` : ''}{s.city}</div>
              <div style={{ fontSize: 11, color: c.textFaint }}>{OPPORTUNITY_TYPE_LABEL[s.opportunity_type]}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, color: statusStyle.color, background: statusStyle.bg,
              padding: '3px 8px', borderRadius: designTokens.radius.badge,
            }}>
              {statusStyle.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}