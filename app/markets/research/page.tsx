// app/markets/research/page.tsx — MANOP Research index (published articles only)

import Link from 'next/link'
import type { Metadata } from 'next'
import { getDesignColors, designTokens } from '../../../lib/theme'
import { getServerDark } from '../../../lib/theme-server'
import { SITE_URL } from '../../../lib/market-intelligence'
import { getPublishedArticles } from '../../../lib/research-public'
import ArticleCard from '../../../components/ArticleCard'
import { Eyebrow, wrap } from '../../../components/market/MarketUI'

export const metadata: Metadata = {
  title: 'MANOP Research | Real estate development intelligence',
  description: 'Editorial research from MANOP on how development decisions are made, and what it takes to understand one.',
  alternates: { canonical: `${SITE_URL}/markets/research` },
  openGraph: { title: 'MANOP Research', description: 'Editorial research on real estate development intelligence.', url: `${SITE_URL}/markets/research`, type: 'website' },
}

export default async function ResearchIndex() {
  const c = getDesignColors(await getServerDark())
  const { rows, ok } = await getPublishedArticles({ limit: 60 })
  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }}>
      <div style={wrap()}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, padding: '1.5rem 0 0' }}>
          <Link href="/markets" style={{ color: c.textMuted, textDecoration: 'none' }}>← Market Intelligence</Link>
        </nav>
        <header style={{ padding: 'clamp(2rem,5vw,3.5rem) 0 clamp(1.5rem,4vw,2.5rem)' }}>
          <Eyebrow c={c}>MANOP Research</Eyebrow>
          <h1 style={{ fontSize: 'clamp(1.9rem,4.6vw,2.8rem)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 12px', maxWidth: 700 }}>Thinking through the development.</h1>
          <p style={{ fontSize: 'clamp(1rem,2vw,1.1rem)', color: c.textMuted, lineHeight: 1.7, maxWidth: 600, margin: 0 }}>Research on evidence, assumptions and the unknowns that shape real estate development decisions.</p>
        </header>
        {!ok ? <p style={{ color: c.textMuted }}>Research is currently unavailable.</p>
          : rows.length === 0 ? <p style={{ color: c.textMuted, paddingBottom: '4rem' }}>No research has been published yet.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))', gap: 18, paddingBottom: '4rem' }}>
              {rows.map(a => <ArticleCard key={a.id} a={a} c={c} />)}
            </div>
          )}
      </div>
    </div>
  )
}