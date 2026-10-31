// lib/locations.ts
//
// Market Intelligence locations, derived ENTIRELY from the canonical taxonomy
// (lib/location-taxonomy.ts). No place name is hard-coded here: add a place to
// the taxonomy and it becomes searchable and routable. Two levels are exposed:
// city and primary neighbourhood. Micro-locations resolve to their parent
// neighbourhood.

import { TAXONOMY, COUNTRY_CURRENCY } from './location-taxonomy'

export type LocationKind = 'city' | 'neighborhood'

export interface MarketLocation {
  slug: string
  kind: LocationKind
  label: string
  cityLabel: string
  stateLabel: string
  countryCode: string
  countryLabel: string
  /** "Ikoyi, Lagos, Nigeria" */
  path: string
  /** micro-location labels that belong to a neighbourhood */
  micros: string[]
  currencyCode: string | null
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90)

let cache: MarketLocation[] | null = null

export function getLocations(): MarketLocation[] {
  if (cache) return cache
  const list: MarketLocation[] = []
  const used = new Set<string>()
  const cityIdx: MarketLocation[] = []
  for (const country of TAXONOMY) {
    for (const state of country.states) {
      for (const city of state.cities) {
        for (const d of city.districts) for (const n of d.neighborhoods) {
          if (used.has(n.slug)) continue
          used.add(n.slug)
          list.push({
            slug: n.slug, kind: 'neighborhood', label: n.label, cityLabel: city.label, stateLabel: state.label,
            countryCode: country.code, countryLabel: country.label, path: `${n.label}, ${city.label}, ${country.label}`,
            micros: n.micros.map(m => m.label), currencyCode: COUNTRY_CURRENCY[country.code]?.code ?? null,
          })
        }
        let cs = slugify(city.label)
        if (used.has(cs)) cs = `${cs}-city`
        // a city can appear once per state; keep the first
        if (!used.has(cs)) {
          used.add(cs)
          cityIdx.push({
            slug: cs, kind: 'city', label: city.label, cityLabel: city.label, stateLabel: state.label,
            countryCode: country.code, countryLabel: country.label, path: `${city.label}, ${country.label}`,
            micros: [], currencyCode: COUNTRY_CURRENCY[country.code]?.code ?? null,
          })
        }
      }
    }
  }
  cache = [...cityIdx, ...list]
  return cache
}

export function resolveLocation(slug: string): MarketLocation | null {
  return getLocations().find(l => l.slug === slug) ?? null
}

export interface LocationMatch { location: MarketLocation; matchedMicro?: string }

/** Typeahead: label prefix > label contains > micro-location contains. */
export function searchLocations(query: string, limit = 8): LocationMatch[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const all = getLocations()
  const out: { m: LocationMatch; rank: number }[] = []
  for (const l of all) {
    const lab = l.label.toLowerCase()
    if (lab.startsWith(q)) out.push({ m: { location: l }, rank: 0 })
    else if (lab.includes(q)) out.push({ m: { location: l }, rank: 1 })
    else {
      const mi = l.micros.find(x => x.toLowerCase().includes(q))
      if (mi) out.push({ m: { location: l, matchedMicro: mi }, rank: 2 })
    }
  }
  return out.sort((a, b) => a.rank - b.rank || (a.m.location.kind === 'city' ? -1 : 1)).slice(0, limit).map(x => x.m)
}

/** True when a free-text DB value (e.g. developer_projects.neighborhood) refers to this location. */
export function matchesLocation(loc: MarketLocation, neighborhood: string | null | undefined, city: string | null | undefined): boolean {
  const n = (neighborhood ?? '').trim().toLowerCase()
  const c = (city ?? '').trim().toLowerCase()
  if (loc.kind === 'city') return c === loc.label.toLowerCase() || (!c && n === loc.label.toLowerCase())
  if (!n) return false
  if (loc.cityLabel && c && c !== loc.cityLabel.toLowerCase()) return false
  return n === loc.label.toLowerCase() || n.includes(loc.label.toLowerCase()) || loc.micros.some(m => n === m.toLowerCase())
}