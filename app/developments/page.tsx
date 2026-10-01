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
import { Card, Fact, Muted } from '../../components/site-intelligence-ui'
import { ManopReviewTag } from '../../components/ManopMark'
import { getDesignColors, designTokens } from '../../lib/theme'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const dark = true
const c = getDesignColors(dark)

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

export default async function DevelopmentsDiscoveryPage({ searchParams }: { searchParams: SearchParams }) {
  let query = sb
    .from('developer_projects')
    .select('id,name,neighborhood,city,stage,total_units,handover_date,reviewed_at,images,lat,lng,developer_id')
    .eq('publish_status', 'published')
    .order('reviewed_at', { ascending: false })

  if (searchParams.area) {
    query = query.or(`neighborhood.ilike.%${searchParams.area}%,city.ilike.%${searchParams.area}%`)
  }

  const category: DevCategory = searchParams.category === 'new_build' || searchParams.category === 'off_plan'
    ? searchParams.category : 'all'
  if (category === 'new_build') query = query.eq('stage', 'Completed')
  if (category === 'off_plan') query = query.in('stage', OFF_PLAN_STAGES)

  const { data, error } = await query
  const projects = (data || []) as unknown as DevProject[]
  const view = searchParams.view === 'map' ? 'map' : 'list'

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px',
    }}>
      <DevelopmentsHero dark={dark} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, marginTop: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          {projects.length} reviewed development{projects.length === 1 ? '' : 's'}
          {category === 'new_build' ? ' · New Build' : category === 'off_plan' ? ' · Off Plan' : ''}
          {searchParams.area ? ` in ${searchParams.area}` : ''}
        </h1>
      </div>

      <CategoryTabs current={category} area={searchParams.area} view={view} dark={dark} />

      {/* ── Filter + view toggle — plain GET form, works without JS ── */}
      <form
        method="get"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' as const }}
      >
        <input
          name="area"
          defaultValue={searchParams.area}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {projects.map(p => <DevelopmentCard key={p.id} project={p} />)}
        </div>
      )}

      {view === 'map' && <MapView projects={projects} />}
    </div>
  )
}

function MapView({ projects }: { projects: DevProject[] }) {
  const markers = projects
    .filter(p => p.lat != null && p.lng != null)
    .map(p => ({ id: p.id, lat: p.lat as number, lng: p.lng as number, label: p.name }))

  if (markers.length === 0) {
    return <Muted c={c}>None of the currently filtered developments have coordinates yet.</Muted>
  }
  return <SitesOverviewMap markers={markers} height={480} linkPrefix="/development" />
}

function stageCategory(stage: string | null): { label: string; color: string; bg: string } | null {
  if (!stage) return null
  return stage === 'Completed'
    ? { label: 'New Build', color: '#0D9488', bg: 'rgba(13,148,136,0.1)' }
    : { label: 'Off Plan',  color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' }
}

function DevelopmentCard({ project: p }: { project: DevProject }) {
  const cat = stageCategory(p.stage)
  return (
    <Link href={`/development/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <Card c={c}>
        {/* Save button lives strictly inside the image zone, never over
            the badge/text rows below it — that overlap was the bug in
            the last screenshot. Click-cancellation (so it doesn't also
            trigger the card's own Link) lives inside SaveDevelopmentButton
            itself, since this file is a Server Component and can't
            attach event handlers directly. */}
        <div style={{
          position: 'relative', height: 140, borderRadius: designTokens.radius.sm, marginBottom: 10,
          background: p.images?.[0] ? `url(${p.images[0]}) center/cover` : c.surfaceCardHigh,
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}>
            <SaveDevelopmentButton projectId={p.id} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' as const }}>
          {cat && (
            <span style={{ fontSize: 11, fontWeight: 700, color: cat.color, background: cat.bg, borderRadius: designTokens.radius.badge, padding: '3px 8px' }}>
              {cat.label}
            </span>
          )}
          {p.reviewed_at && <ManopReviewTag date={new Date(p.reviewed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
        <div style={{ fontSize: 12.5, color: c.textMuted, marginBottom: 10 }}>
          {p.neighborhood ? `${p.neighborhood}, ` : ''}{p.city}
        </div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: c.textMuted }}>Developer: </span>
          <GatedDeveloperName developerId={p.developer_id} dark={dark} />
        </div>
        <Fact c={c} label="Stage" value={p.stage || '—'} />
        {p.total_units != null && <Fact c={c} label="Total units" value={String(p.total_units)} />}
      </Card>
    </Link>
  )
}