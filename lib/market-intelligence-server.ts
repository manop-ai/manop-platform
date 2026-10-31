// lib/market-intelligence-server.ts
//
// Loads what MANOP actually holds for a location. Server Components only; uses
// sbServerRead (anonymous, RLS applies) — the same public-read path the development
// and Site Intelligence pages use. No privileged client, no activity_log, no views or
// enquiries: raw platform activity is never part of public Market Intelligence.
// A table that fails to load is reported in `unavailable` (shown as "unavailable"),
// never silently as zero.

import { sbServerRead as sb } from './supabase/server-read'
import { unstable_noStore as noStore } from 'next/cache'
import { getLocations, matchesLocation, resolveLocation, slugify, type MarketLocation } from './locations'
import { getPublishedArticles } from './research-public'
import {
  transactionStats, type LocationIntelligence, type MiDevelopment, type MiSection, type MiSite,
} from './market-intelligence'

const esc = (v: string) => v.replace(/[\\%_]/g, m => '\\' + m)
const CAP = 500

export function citySlugFor(loc: MarketLocation): string | null {
  if (loc.kind === 'city') return loc.slug
  return getLocations().find(l => l.kind === 'city' && l.label === loc.cityLabel && l.countryCode === loc.countryCode)?.slug ?? null
}

export async function getLocationIntelligence(loc: MarketLocation): Promise<LocationIntelligence> {
  noStore() // never serve a cached copy: unpublishing must take effect immediately
  const city = esc(loc.cityLabel)
  const unavailable: MiSection[] = []

  const [dev, sites, txns, arts] = await Promise.all([
    sb.from('developer_projects').select('id,name,neighborhood,city,stage,total_units,handover_date,reviewed_at')
      .eq('publish_status', 'published').ilike('city', city).limit(CAP),
    sb.from('sites').select('id,reference,city,neighborhood,area_sqm,opportunity_type,reviewed_at')
      .eq('site_status', 'published').eq('is_sandbox', false).ilike('city', city).limit(CAP),
    sb.from('market_transactions').select('neighborhood,city,sold_price,sold_at')
      .eq('verification_status', 'verified').ilike('city', city).limit(2000),
    getPublishedArticles({ locationSlugs: [loc.slug, citySlugFor(loc)].filter((s): s is string => !!s), limit: 6 }),
  ])
  if (dev.error) unavailable.push('developments')
  if (sites.error) unavailable.push('sites')
  if (txns.error) unavailable.push('transactions')
  if (!arts.ok) unavailable.push('articles')

  const developments = ((dev.data as MiDevelopment[]) ?? []).filter(d => matchesLocation(loc, d.neighborhood, d.city))
  const siteRows = ((sites.data as MiSite[]) ?? []).filter(s => matchesLocation(loc, s.neighborhood, s.city))
  const txRows = ((txns.data as { neighborhood: string | null; city: string | null; sold_price: number | null; sold_at: string | null }[]) ?? [])
    .filter(t => matchesLocation(loc, t.neighborhood, t.city))

  // Planning evidence: how many of these reviewed developments have DOCUMENTED or VERIFIED planning evidence.
  let planning: LocationIntelligence['planning'] = null
  if (developments.length) {
    const ev = await sb.from('development_evidence').select('project_id,category,status')
      .in('project_id', developments.map(d => d.id)).eq('category', 'planning')
    if (ev.error) unavailable.push('evidence')
    else {
      const strong = new Set(['documented', 'manop_observed', 'manop_derived', 'independently_verified', 'professional_opinion'])
      const ids = new Set((ev.data ?? []).filter(e => strong.has(e.status)).map(e => e.project_id))
      planning = { developmentsWithPlanningEvidence: ids.size, total: developments.length }
    }
  }

  return { location: loc, developments, sites: siteRows, transactions: transactionStats(txRows), planning, articles: arts.rows, unavailable }
}

/** Locations where MANOP holds published evidence, with real counts. Powers the Market Intelligence index. */
export async function getEvidenceLocations(): Promise<{ location: MarketLocation; developments: number; sites: number }[] | null> {
  noStore() // never serve a cached copy: unpublishing must take effect immediately
  const [dev, sites] = await Promise.all([
    sb.from('developer_projects').select('neighborhood,city').eq('publish_status', 'published').limit(2000),
    sb.from('sites').select('neighborhood,city').eq('site_status', 'published').eq('is_sandbox', false).limit(2000),
  ])
  if (dev.error && sites.error) return null
  const out: { location: MarketLocation; developments: number; sites: number }[] = []
  for (const l of getLocations()) {
    const d = (dev.data ?? []).filter(r => matchesLocation(l, r.neighborhood, r.city)).length
    const s = (sites.data ?? []).filter(r => matchesLocation(l, r.neighborhood, r.city)).length
    if (d + s > 0) out.push({ location: l, developments: d, sites: s })
  }
  return out.sort((a, b) => (b.developments + b.sites) - (a.developments + a.sites))
}

export { resolveLocation, slugify }