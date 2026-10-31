// app/markets/[location]/page.tsx — the intelligence MANOP currently holds for one location.
// Sections render only where real data exists; gaps and investigation prompts are stated plainly.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDesignColors, designTokens } from '../../../lib/theme'
import { getServerDark } from '../../../lib/theme-server'
import { resolveLocation } from '../../../lib/locations'
import { buildGaps, isMeaningful, summaryLine, SITE_URL, MIN_VERIFIED_TXNS_FOR_PRICE, type LocationIntelligence } from '../../../lib/market-intelligence'
import { getLocationIntelligence, citySlugFor } from '../../../lib/market-intelligence-server'
import { getEconomicContext } from '../../../lib/economic-context'
import { mediaFor } from '../../../lib/location-media'
import { Eyebrow, Fact, Provenance, Section, wrap } from '../../../components/market/MarketUI'
import ArticleCard from '../../../components/ArticleCard'
import LocationSearch from '../../../components/LocationSearch'

type Props = { params: { location: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loc = resolveLocation(params.location)
  if (!loc) return { title: 'Location not found | MANOP', robots: { index: false } }
  const intel = await getLocationIntelligence(loc)
  const url = `${SITE_URL}/markets/${loc.slug}`
  const title = `${loc.label} Real Estate Development Intelligence | MANOP`
  const description = `${summaryLine(intel)} Evidence, development activity, information gaps and further investigation for ${loc.path}.`
  return {
    title, description, alternates: { canonical: url },
    // Only locations where MANOP holds something real are indexed; the rest stay reachable but out of search.
    robots: isMeaningful(intel) ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description, url, type: 'website' },
  }
}

const money = (n: number, code: string | null) => `${code === 'NGN' ? '₦' : code === 'GHS' ? 'GH₵' : ''}${n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString()}`
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null)
const latest = (dates: (string | null)[]) => dates.filter((d): d is string => !!d).sort().pop() ?? null

export default async function LocationPage({ params }: Props) {
  const loc = resolveLocation(params.location)
  if (!loc) return notFound()
  const dark = await getServerDark()
  const c = getDesignColors(dark)
  const [intel, econ]: [LocationIntelligence, Awaited<ReturnType<typeof getEconomicContext>>] = await Promise.all([getLocationIntelligence(loc), getEconomicContext(loc.countryCode)])
  const { gaps, investigate } = buildGaps(intel)
  const un = (s: LocationIntelligence['unavailable'][number]) => intel.unavailable.includes(s)
  const hero = mediaFor(loc.slug, citySlugFor(loc))
  const parentCity = loc.kind === 'neighborhood' ? citySlugFor(loc) : null

  const hasDev = intel.developments.length > 0
  const hasSites = intel.sites.length > 0
  const jump = [
    ['#known', 'What MANOP knows'], hasDev || hasSites ? ['#activity', 'Development activity'] : null,
    intel.transactions.count > 0 ? ['#market', 'Market evidence'] : null, ['#economic', 'Economic context'],
    ['#gaps', 'What we don’t know'], ['#investigate', 'Further investigation'], intel.articles.length ? ['#research', 'Research'] : null,
  ].filter((x): x is string[] => !!x)

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }}>
      {hero && (
        <div style={{ position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.src} alt={hero.alt} style={{ width: '100%', height: 'clamp(200px,38vw,420px)', objectFit: 'cover', display: 'block' }} />
          <div style={{ ...wrap(), position: 'absolute', left: 0, right: 0, bottom: 8, fontSize: 11, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{hero.credit}</div>
        </div>
      )}
      <div style={wrap()}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: c.textFaint, padding: '1.5rem 0 0' }}>
          <Link href="/markets" style={{ color: c.textMuted, textDecoration: 'none' }}>Market Intelligence</Link>
          {parentCity && <> / <Link href={`/markets/${parentCity}`} style={{ color: c.textMuted, textDecoration: 'none' }}>{loc.cityLabel}</Link></>}
          {' / '}<span style={{ color: c.textPrimary }}>{loc.label}</span>
        </nav>

        <header style={{ padding: 'clamp(1.5rem,4vw,2.5rem) 0 clamp(1.5rem,4vw,2.25rem)' }}>
          <Eyebrow c={c}>{loc.kind === 'city' ? 'City' : 'Location'} · {loc.countryLabel}</Eyebrow>
          <h1 style={{ fontSize: 'clamp(2rem,5.5vw,3.3rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.08, margin: '0 0 14px' }}>{loc.label}</h1>
          <p style={{ fontSize: 'clamp(1rem,2vw,1.15rem)', color: c.textMuted, lineHeight: 1.7, maxWidth: 640, margin: '0 0 22px' }}>{summaryLine(intel)}</p>
          <LocationSearch c={c} />
          <nav aria-label="On this page" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 22, paddingBottom: 4 }}>
            {jump.map(([h, l]) => <a key={h} href={h} style={{ flex: '0 0 auto', fontSize: 12.5, fontWeight: 600, color: c.textMuted, textDecoration: 'none', border: `1px solid ${c.border}`, borderRadius: 4, padding: '0.45rem 0.8rem', minHeight: 36, display: 'inline-flex', alignItems: 'center' }}>{l}</a>)}
          </nav>
        </header>

        <Section id="known" c={c} title="What MANOP currently knows" intro={`Structured intelligence for ${loc.label}. Each statement is drawn from rows MANOP holds, not estimated.`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
            <Fact c={c} label="Reviewed developments" value={un('developments') ? '—' : String(intel.developments.length)}
              statement={un('developments') ? 'Currently unavailable.' : hasDev ? 'Published after MANOP review.' : 'None reviewed yet.'}>
              {hasDev && <Provenance c={c} kind="Development evidence" source="MANOP Reviewed Developments" asOf={latest(intel.developments.map(d => d.reviewed_at))} status="Published after MANOP review" note="A review records what was found. It is not a recommendation." />}
            </Fact>
            <Fact c={c} label="Reviewed sites" value={un('sites') ? '—' : String(intel.sites.length)}
              statement={un('sites') ? 'Currently unavailable.' : hasSites ? 'Published through Site Intelligence.' : 'None available yet.'}>
              {hasSites && <Provenance c={c} kind="Site evidence" source="MANOP Site Intelligence" asOf={latest(intel.sites.map(s => s.reviewed_at))} status="Published after MANOP review" />}
            </Fact>
            <Fact c={c} label="Verified transactions" value={un('transactions') ? '—' : String(intel.transactions.count)}
              statement={un('transactions') ? 'Currently unavailable.' : intel.transactions.count >= MIN_VERIFIED_TXNS_FOR_PRICE ? 'Enough to calculate a median.' : intel.transactions.count ? 'Insufficient to calculate a meaningful market statistic.' : 'No verified transactions currently available.'}>
              {intel.transactions.count > 0 && <Provenance c={c} kind="Market evidence" source="MANOP-verified transactions" asOf={intel.transactions.latest} status="Independently verified" note={`A median is shown only from ${MIN_VERIFIED_TXNS_FOR_PRICE} verified transactions.`} />}
            </Fact>
          </div>
        </Section>

        {(hasDev || hasSites) && (
          <Section id="activity" c={c} title="Development activity" intro="Developments and sites MANOP has reviewed for this location.">
            {hasDev && (
              <div style={{ marginBottom: hasSites ? 28 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Reviewed developments</div>
                {intel.developments.map(d => (
                  <Link key={d.id} href={`/development/${d.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '0.9rem 0', borderTop: `1px solid ${c.border}`, textDecoration: 'none', color: c.textPrimary, minHeight: 44 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{d.name}</span>
                    <span style={{ fontSize: 13.5, color: c.textMuted }}>{[d.stage, d.total_units ? `${d.total_units} units` : null, d.handover_date ? `handover ${when(d.handover_date)}` : null].filter(Boolean).join(' · ') || 'Details not recorded'}</span>
                  </Link>
                ))}
              </div>
            )}
            {hasSites && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Reviewed sites</div>
                {intel.sites.map(s => (
                  <Link key={s.id} href={`/site-intelligence/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '0.9rem 0', borderTop: `1px solid ${c.border}`, textDecoration: 'none', color: c.textPrimary, minHeight: 44 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{s.reference || 'Site'}{s.neighborhood ? ` · ${s.neighborhood}` : ''}</span>
                    <span style={{ fontSize: 13.5, color: c.textMuted }}>{[s.opportunity_type?.replace(/_/g, ' '), s.area_sqm ? `${Number(s.area_sqm).toLocaleString()} sq.m.` : null].filter(Boolean).join(' · ') || 'Details not recorded'}</span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        )}

        {intel.transactions.count > 0 && (
          <Section id="market" c={c} title="Market evidence" intro="Verified transaction evidence, shown only where there is enough to mean something.">
            {intel.transactions.median !== null ? (
              <Fact c={c} label="Median verified sold price" value={money(intel.transactions.median, loc.currencyCode)} statement={`Calculated from ${intel.transactions.count} independently verified transactions in ${loc.label}.`}>
                <Provenance c={c} kind="Market evidence" source="MANOP-verified transactions" asOf={intel.transactions.latest} status="Independently verified" note="A single median is not a market trend. Mix of unit types and dates is not adjusted." />
              </Fact>
            ) : (
              <p style={{ fontSize: 15, color: c.textMuted, lineHeight: 1.7, maxWidth: 620, margin: 0 }}>
                {intel.transactions.count} verified transaction{intel.transactions.count === 1 ? '' : 's'} available. Insufficient verified transaction data to calculate a meaningful market statistic.
              </p>
            )}
          </Section>
        )}

        <Section id="economic" c={c} title="Economic context" intro={`Currency and macroeconomic context for ${loc.countryLabel}, from sourced data only.`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
            {econ.fx ? (
              <Fact c={c} label={`${econ.fx.currencyCode} per US dollar`} value={econ.fx.perUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} statement="Live market reference rate, not an official or transaction rate.">
                <Provenance c={c} kind="External source" source={econ.fx.source} asOf={econ.fx.asOf} status="Published reference rate" />
              </Fact>
            ) : (
              <Fact c={c} label="Currency" value="—" statement="Economic data currently unavailable." />
            )}
            {econ.indicators.map(i => (
              <Fact key={i.label} c={c} label={i.label} value={i.value} statement="Sourced indicator.">
                <Provenance c={c} kind="External source" source={i.source} asOf={i.asOf} status="Published" />
              </Fact>
            ))}
            <Fact c={c} label="Inflation" value="—" statement="Economic data currently unavailable." />
          </div>
        </Section>

        <Section id="gaps" c={c} title="What we don’t know yet" intro="Known information gaps for this location.">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 680 }}>
            {gaps.map(g => <li key={g} style={{ fontSize: 15, lineHeight: 1.7, color: c.textMuted, padding: '0.7rem 0 0.7rem 1rem', borderLeft: `2px solid ${c.statusAmber}`, marginBottom: 10 }}>{g}</li>)}
          </ul>
        </Section>

        <Section id="investigate" c={c} title="Further investigation" intro="Questions requiring deeper research or professional verification. These are prompts, not recommendations.">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', maxWidth: 680 }}>
            {investigate.map(q => <li key={q} style={{ fontSize: 15, lineHeight: 1.7, color: c.textPrimary, padding: '0.7rem 0', borderTop: `1px solid ${c.border}` }}>{q}</li>)}
          </ul>
        </Section>

        {intel.articles.length > 0 && (
          <Section id="research" c={c} title={`MANOP Research on ${loc.label}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
              {intel.articles.map(a => <ArticleCard key={a.id} a={a} c={c} />)}
            </div>
          </Section>
        )}

        <p style={{ fontSize: 12, color: c.textFaint, lineHeight: 1.7, maxWidth: 640, padding: '0.5rem 0 3rem', margin: 0 }}>
          Information on MANOP may be based on available evidence. MANOP does not provide legal, financial or investment advice.
        </p>
      </div>
    </div>
  )
}