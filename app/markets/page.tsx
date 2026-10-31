// app/markets/page.tsx — Market Intelligence (public, server-rendered)
// What MANOP currently knows about a market. Real data only; no raw platform activity.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getDesignColors, designTokens } from '../../lib/theme'
import { getServerDark } from '../../lib/theme-server'
import { SITE_URL } from '../../lib/market-intelligence'
import { getEvidenceLocations } from '../../lib/market-intelligence-server'
import { getPublishedArticles } from '../../lib/research-public'
import { searchLocations } from '../../lib/locations'
import LocationSearch from '../../components/LocationSearch'
import ArticleCard from '../../components/ArticleCard'
import { Eyebrow, Section, wrap } from '../../components/market/MarketUI'

export const metadata: Metadata = {
  title: 'Market Intelligence | MANOP',
  description: 'Explore the evidence, development activity and intelligence currently available for a location. As evidence grows, so does the picture.',
  alternates: { canonical: `${SITE_URL}/markets` },
  openGraph: { title: 'Market Intelligence | MANOP', description: 'What MANOP currently knows about this market.', url: `${SITE_URL}/markets`, type: 'website' },
}

export default async function MarketsPage({ searchParams }: { searchParams: { area?: string } }) {
  // Older links (footer, calculator) use /markets?area=Ikoyi — resolve through the location taxonomy.
  const legacy = typeof searchParams?.area === 'string' ? searchParams.area.slice(0, 80) : ''
  if (legacy) {
    const hit = searchLocations(legacy, 1)[0]
    if (hit) redirect(`/markets/${hit.location.slug}`)
  }
  const dark = await getServerDark()
  const c = getDesignColors(dark)
  const [locations, research] = await Promise.all([getEvidenceLocations(), getPublishedArticles({ limit: 3 })])

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }}>
      <div style={wrap()}>
        <header style={{ padding: 'clamp(2.5rem,7vw,5rem) 0 clamp(2rem,5vw,3.25rem)' }}>
          <Eyebrow c={c}>Market Intelligence</Eyebrow>
          <h1 style={{ fontSize: 'clamp(1.9rem,5vw,3.1rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.1, margin: '0 0 16px', maxWidth: 760 }}>
            What MANOP currently knows about this market.
          </h1>
          <p style={{ fontSize: 'clamp(1rem,2vw,1.12rem)', color: c.textMuted, lineHeight: 1.7, maxWidth: 620, margin: '0 0 28px' }}>
            Explore the evidence, development activity and intelligence currently available for a location. As evidence grows, so does the picture.
          </p>
          <LocationSearch c={c} />
        </header>

        <Section id="evidence" c={c} title="Where MANOP holds evidence"
          intro="Locations with reviewed developments or sites on MANOP. A location appears here only when there is something real to show.">
          {locations === null ? (
            <p style={{ fontSize: 14.5, color: c.textMuted }}>Location evidence is currently unavailable.</p>
          ) : locations.length === 0 ? (
            <p style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 1.7 }}>No location has published evidence yet. Search any location above to see what MANOP does and does not hold for it.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
              {locations.map(({ location: l, developments, sites }) => (
                <Link key={l.slug} href={`/markets/${l.slug}`} style={{ border: `1px solid ${c.border}`, borderRadius: 4, padding: '1rem 1.1rem', textDecoration: 'none', color: c.textPrimary, background: c.surfaceCard, minHeight: 44 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{l.label}</div>
                  <div style={{ fontSize: 12.5, color: c.textMuted, margin: '2px 0 8px' }}>{l.path}</div>
                  <div style={{ fontSize: 13.5, color: c.textMuted }}>
                    {[developments ? `${developments} reviewed development${developments === 1 ? '' : 's'}` : null, sites ? `${sites} site${sites === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section id="reading" c={c} title="How to read this page">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
            {[
              ['Evidence-led', 'Figures come from reviewed developments, submitted sites and verified transactions. Nothing is estimated to fill a gap.'],
              ['Honest about gaps', '“Insufficient information” and “further investigation required” are answers, not errors. Each location lists what MANOP does not yet know.'],
              ['Sourced', 'Every figure carries its source, date and status under “Source details”. MANOP data, development evidence, site evidence and external sources are kept apart.'],
            ].map(([t, d]) => (
              <div key={t} style={{ borderTop: `2px solid ${c.verificationTeal}`, paddingTop: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{t}</div>
                <div style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.7 }}>{d}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="research" c={c} title="MANOP Research" intro="Editorial research on how development decisions are made, and what it takes to understand one.">
          {!research.ok ? (
            <p style={{ fontSize: 14.5, color: c.textMuted }}>Research is currently unavailable.</p>
          ) : research.rows.length === 0 ? (
            <p style={{ fontSize: 14.5, color: c.textMuted }}>No research has been published yet.</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
                {research.rows.map((a, i) => <ArticleCard key={a.id} a={a} c={c} featured={i === 0 && research.rows.length > 1} />)}
              </div>
              <div style={{ marginTop: 20 }}>
                <Link href="/markets/research" style={{ color: c.verificationTeal, fontWeight: 700, fontSize: 14.5, textDecoration: 'none' }}>All MANOP Research →</Link>
              </div>
            </>
          )}
        </Section>

        <p style={{ fontSize: 12, color: c.textFaint, lineHeight: 1.7, maxWidth: 640, padding: '0 0 3rem', margin: 0 }}>
          Information on MANOP may be based on available evidence. MANOP does not provide legal, financial or investment advice.
        </p>
      </div>
    </div>
  )
}