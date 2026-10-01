
// app/site-intelligence/page.tsx

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import SiteIntelligenceNav from '../../components/SiteIntelligenceNav'
import DiscoveryHero from './DiscoveryHero'
import DiscoveryViewToggle from './DiscoveryViewToggle'
import SitesOverviewMap from '../../components/SitesOverviewMap'
import { Card, Fact, Muted, SiteStatusBadge, Badge } from '../../components/site-intelligence-ui'
import { Site, OPPORTUNITY_TYPE_LABEL, formatArea } from '../../lib/site-intelligence'
import { getDesignColors, designTokens } from '../../lib/theme'
import { getServerDark } from '../../lib/theme-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface SearchParams {
  city?: string
  opportunity_type?: string
  view?: 'list' | 'map'
  [key: string]: string | undefined
}

export default async function SiteDiscoveryPage({ searchParams }: { searchParams: SearchParams }) {
  const dark = await getServerDark()
  const c = getDesignColors(dark)

  let query = sb
    .from('sites')
    .select('*')
    .eq('site_status', 'published')
    .order('reviewed_at', { ascending: false })

  if (searchParams.city) query = query.ilike('city', `%${searchParams.city}%`)
  if (searchParams.opportunity_type) {
    const types = searchParams.opportunity_type.split(',').map(t => t.trim()).filter(Boolean)
    query = types.length > 1 ? query.in('opportunity_type', types) : query.eq('opportunity_type', types[0])
  }

  const { data, error } = await query
  const sites = (data || []) as Site[]
  const view = searchParams.view === 'map' ? 'map' : 'list'

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px',
    }}>
      <SiteIntelligenceNav dark={dark} />
      <DiscoveryHero dark={dark} initialCity={searchParams.city} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {sites.length} published site{sites.length === 1 ? '' : 's'}
          {searchParams.city ? ` in ${searchParams.city}` : ''}
        </h1>
      </div>

      <form method="get" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          name="city" defaultValue={searchParams.city} placeholder="Search by city…"
          style={{ padding: '9px 12px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary, fontSize: 13.5, minWidth: 200 }}
        />
        <select
          name="opportunity_type" defaultValue={searchParams.opportunity_type || ''}
          style={{ padding: '9px 12px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary, fontSize: 13.5 }}
        >
          <option value="">All opportunity types</option>
          {Object.entries(OPPORTUNITY_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="hidden" name="view" value={view} />
        <button type="submit" style={{ padding: '9px 14px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary, fontSize: 13.5, cursor: 'pointer' }}>
          Filter
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <DiscoveryViewToggle currentView={view} searchParams={searchParams} dark={dark} />
        </div>
      </form>

      {error && <Muted c={c}>Could not load sites right now.</Muted>}

      {sites.length === 0 && !error && (
        <Card c={c}>
          <Muted c={c}>
            No published sites match this search yet. Submitted sites appear here once MANOP has
            reviewed them — see <Link href="/site-intelligence/submit" style={{ color: c.intelligencePurple }}>Submit a Site</Link> to add one.
          </Muted>
        </Card>
      )}

      {view === 'list' && sites.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {sites.map((s) => <SiteCard key={s.id} site={s} c={c} dark={dark} />)}
        </div>
      )}

      {view === 'map' && <MapView sites={sites} c={c} />}
    </div>
  )
}

function MapView({ sites, c }: { sites: Site[]; c: ReturnType<typeof getDesignColors> }) {
  const markers = sites
    .filter((s) => s.lat != null && s.lng != null)
    .map((s) => ({ id: s.id, lat: s.lat as number, lng: s.lng as number, label: s.neighborhood || s.city }))

  if (markers.length === 0) {
    return <Muted c={c}>None of the currently filtered sites have coordinates yet.</Muted>
  }
  return <SitesOverviewMap markers={markers} height={480} />
}

function SiteCard({ site, c, dark }: { site: Site; c: ReturnType<typeof getDesignColors>; dark: boolean }) {
  return (
    <Link href={`/site-intelligence/${site.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card c={c}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {site.neighborhood ? `${site.neighborhood}, ` : ''}{site.city}
          </div>
          <SiteStatusBadge status={site.site_status} dark={dark} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <Badge label={OPPORTUNITY_TYPE_LABEL[site.opportunity_type]} color={c.intelligencePurple} bg={c.intelligencePurpleBg} />
        </div>
        <Fact c={c} label="Area" value={formatArea(site.area_sqm ?? site.boundary_area_sqm)} />
        {site.asking_price && (
          <Fact c={c} label="Asking price" value={`${site.asking_price_currency} ${site.asking_price.toLocaleString()}`} />
        )}
        {site.reference && <div style={{ fontSize: 11, color: c.textFaint, marginTop: 8 }}>{site.reference}</div>}
      </Card>
    </Link>
  )
}