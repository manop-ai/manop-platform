// app/developments/page.tsx — Reviewed Developments Discovery
//
// Rebuilt on the exact same pattern as Site Intelligence's Discovery
// page (app/site-intelligence/page.tsx) — reused directly, not
// recreated from scratch: server component for the data fetch and
// filtering, a hero search as a small client island, list/map toggle
// via plain links (works without JS), Card/Fact/Muted from the shared
// site-intelligence-ui primitives, and the shared multi-marker map
// component (now generalized with a linkPrefix prop so both Sites and
// Developments can use the same Mapbox logic instead of two copies).
//
// Different on purpose: a Lagos Island high-rise hero image (Site
// Intelligence uses the Third Mainland Bridge), and the MANOP Review
// tag on cards instead of a site-status badge — a development is either
// reviewed or it isn't, never a verdict.

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import DevelopmentsHero from './DevelopmentsHero'
import DevelopmentsViewToggle from './DevelopmentsViewToggle'
import CategoryTabs, { DevCategory } from './CategoryTabs'
import SitesOverviewMap from '../../components/SitesOverviewMap'
import SaveDevelopmentButton from '../../components/SaveDevelopmentButton'
import GatedDeveloperName from '../../components/GatedDeveloperName'
import { Card, Muted } from '../../components/site-intelligence-ui'
import { getDesignColors, designTokens } from '../../lib/theme'
import { getServerDark } from '../../lib/theme-server'
import { ngnShort } from '../../lib/dossier-format'
import '../../components/dossier/dossier.css'
import './listing.css'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)


interface DevProject {
  id: string
  name: string
  neighborhood: string | null
  city: string | null
  stage: string | null
  total_units: number | null
  handover_date: string | null
  reviewed_at: string | null
  images: string[] | null
  lat: number | null
  lng: number | null
  developer_id: string
}

interface SearchParams {
  area?: string
  category?: string
  view?: 'list' | 'map'
  [key: string]: string | undefined
}

// Stages that count as still under construction. Everything else
// (Completed) reads as New Build. Keeping this list here, next to the
// query that uses it, rather than duplicating it elsewhere.
const OFF_PLAN_STAGES = ['Planning', 'Foundation', 'Structure', 'Finishing']

// Strip the characters that have meaning inside a PostgREST .or() filter, so a typed search can never add filters of its own.
const cleanArea = (v: string) => v.replace(/[,()%*\\:"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)

// Optimised Cloudinary delivery for the card images (other hosts are used as-is).
const cld = (u: string, w: number) => {
  const m = u.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  return m ? `${m[1]}f_auto,q_auto,w_${w},c_fill,ar_4:3/${m[2]}` : u
}

export default async function DevelopmentsDiscoveryPage({ searchParams }: { searchParams: SearchParams }) {
  const dark = await getServerDark()
  const c = getDesignColors(dark)
  let query = sb
    .from('developer_projects')
    .select('id,name,neighborhood,city,stage,total_units,handover_date,reviewed_at,images,lat,lng,developer_id')
    .eq('publish_status', 'published')
    .order('reviewed_at', { ascending: false })

  const area = searchParams.area ? cleanArea(searchParams.area) : ''
  if (area) {
    query = query.or(`neighborhood.ilike.%${area}%,city.ilike.%${area}%`)
  }

  const category: DevCategory = searchParams.category === 'new_build' || searchParams.category === 'off_plan'
    ? searchParams.category : 'all'
  if (category === 'new_build') query = query.eq('stage', 'Completed')
  if (category === 'off_plan') query = query.in('stage', OFF_PLAN_STAGES)

  const { data, error } = await query
  const projects = (data || []) as unknown as DevProject[]
  const view = searchParams.view === 'map' ? 'map' : 'list'

  // Two small batched reads so each card can show what a buyer actually wants at a glance: the lowest published unit price and how much of
  // the evidence register is backed. Both tables are public-read for published developments (same RLS gate as the dossier page).
  const ids = projects.map(p => p.id)
  const [{ data: unitRows }, { data: evRows }] = ids.length
    ? await Promise.all([
        sb.from('developer_unit_types').select('project_id,price_ngn').in('project_id', ids),
        sb.from('development_evidence').select('project_id,status').in('project_id', ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]
  const BACKED = ['independently_verified', 'documented', 'manop_observed', 'manop_derived']
  const facts: Record<string, CardFacts> = {}
  for (const p of projects) {
    const prices = (unitRows ?? []).filter((u: any) => u.project_id === p.id).map((u: any) => Number(u.price_ngn)).filter(n => n > 0)
    const ev = (evRows ?? []).filter((e: any) => e.project_id === p.id)
    const backed = ev.filter((e: any) => BACKED.includes(e.status)).length
    const stated = ev.filter((e: any) => e.status === 'developer_stated').length
    facts[p.id] = { from: prices.length ? ngnShort(Math.min(...prices)) : null, total: ev.length, backed, stated, open: ev.length - backed - stated }
  }

  return (
    <div className="dx dxl" style={{ fontFamily: designTokens.font.family }}>
      <div className="dxl-wrap">
      <DevelopmentsHero dark={dark} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, marginTop: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {projects.length} reviewed development{projects.length === 1 ? '' : 's'}
          {category === 'new_build' ? ' · New Build' : category === 'off_plan' ? ' · Off Plan' : ''}
          {area ? ` in ${area}` : ''}
        </h1>
      </div>

      <CategoryTabs current={category} area={area || undefined} view={view} dark={dark} />

      {/* ── Filter + view toggle — plain GET form, works without JS ── */}
      <form
        method="get"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' as const }}
      >
        <input
          name="area"
          defaultValue={area}
          placeholder="Search by neighborhood or city…"
          style={{
            padding: '9px 12px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`,
            background: c.surfaceCard, color: c.textPrimary, fontSize: 13.5, minWidth: 240,
          }}
        />
        <input type="hidden" name="category" value={category === 'all' ? '' : category} />
        <input type="hidden" name="view" value={view} />
        <button
          type="submit"
          style={{
            padding: '9px 14px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`,
            background: 'transparent', color: c.textPrimary, fontSize: 13.5, cursor: 'pointer',
          }}
        >
          Filter
        </button>

        <div style={{ marginLeft: 'auto' }}>
          <DevelopmentsViewToggle currentView={view} searchParams={searchParams} dark={dark} />
        </div>
      </form>

      {error && <Muted c={c}>Could not load developments right now.</Muted>}

      {projects.length === 0 && !error && (
        <Card c={c}>
          <Muted c={c}>
            No {category === 'new_build' ? 'new build' : category === 'off_plan' ? 'off-plan' : 'reviewed'} developments
            match this search yet. Developments appear here once MANOP has reviewed them — see{' '}
            <Link href="/agency/onboard" style={{ color: c.intelligencePurple }}>Become a partner</Link> or{' '}
            <Link href="/developer/onboard" style={{ color: c.intelligencePurple }}>open a developer account</Link>{' '}
            to bring one to MANOP.
          </Muted>
        </Card>
      )}

      {view === 'list' && projects.length > 0 && (
        <div className="dxl-grid">
          {projects.map(p => <DevelopmentCard key={p.id} project={p} facts={facts[p.id]} dark={dark} />)}
        </div>
      )}

      {view === 'map' && <MapView projects={projects} c={c} />}
      </div>
    </div>
  )
}

function MapView({ projects, c }: { projects: DevProject[]; c: ReturnType<typeof getDesignColors> }) {
  const markers = projects
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, label: p.name }))

  if (markers.length === 0) {
    return <Muted c={c}>None of the currently filtered developments have coordinates yet.</Muted>
  }
  return <SitesOverviewMap markers={markers} height={480} linkPrefix="/development" />
}

interface CardFacts { from: string | null; total: number; backed: number; stated: number; open: number }

function DevelopmentCard({ project: p, facts: f, dark }: { project: DevProject; facts: CardFacts; dark: boolean }) {
  const isNew = p.stage === 'Completed'
  const where = [p.neighborhood, p.city].filter(Boolean).join(', ')
  return (
    <Link href={`/development/${p.id}`} className="dxl-card">
      <div className="im">
        {p.images?.[0]
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cld(p.images[0], 700)} alt={p.name} loading="lazy" />
          : <div className="noimg">Photos not provided yet</div>}
        {p.stage && <span className={`tag ${isNew ? 'new' : 'off'}`}>{isNew ? 'New build' : 'Off plan'}</span>}
        {/* Save sits inside the image zone; its click is cancelled inside SaveDevelopmentButton so it does not also open the card. */}
        <div className="save"><SaveDevelopmentButton projectId={p.id} /></div>
      </div>
      <div className="bd">
        <div className="rv">{p.reviewed_at ? `MANOP reviewed · ${new Date(p.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'MANOP review'}</div>
        <h2>{p.name}</h2>
        <div className="l">{where}</div>
        <div className="dv"><span>Developer</span> <GatedDeveloperName developerId={p.developer_id} dark={dark} /></div>
        <div className="ft">
          <div><small>Units from</small><b>{f.from ?? '—'}</b></div>
          <div><small>Stage</small><b className="s">{p.stage || '—'}</b></div>
          {p.total_units != null && <div><small>Units</small><b className="s">{p.total_units}</b></div>}
        </div>
        <div className="ev">
          {f.total > 0 ? (
            <>
              <div className="bar" role="img" aria-label={`${f.backed} of ${f.total} claims backed`}>
                {f.backed > 0 && <i style={{ flex: f.backed, background: 'var(--dx-teal)' }} />}
                {f.stated > 0 && <i style={{ flex: f.stated, background: 'var(--dx-amber)' }} />}
                {f.open > 0 && <i style={{ flex: f.open, background: 'var(--dx-faint)' }} />}
              </div>
              <span>{f.backed} of {f.total} claims backed</span>
            </>
          ) : <span>Evidence register in progress</span>}
        </div>
      </div>
    </Link>
  )
}