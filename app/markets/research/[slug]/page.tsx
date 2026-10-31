// app/markets/research/[slug]/page.tsx — one MANOP Research article (published only)

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDesignColors, designTokens } from '../../../../lib/theme'
import { getServerDark } from '../../../../lib/theme-server'
import { SITE_URL } from '../../../../lib/market-intelligence'
import { getArticleBySlug, getPublishedArticles } from '../../../../lib/research-public'
import { citySlugFor } from '../../../../lib/market-intelligence-server'
import { resolveLocation } from '../../../../lib/locations'
import { SOURCE_TYPE_LABEL } from '../../../../lib/research'
import { ArticleBody } from '../../../../lib/markdown'
import { sbServerRead as sb } from '../../../../lib/supabase/server-read'
import ArticleCard from '../../../../components/ArticleCard'
import { Eyebrow, wrap } from '../../../../components/market/MarketUI'

type Props = { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await getArticleBySlug(params.slug)
  if (!a) return { title: 'Article not found | MANOP', robots: { index: false } }
  const url = `${SITE_URL}/markets/research/${a.slug}`
  const description = a.excerpt || undefined
  return {
    title: `${a.title} | MANOP Research`, description, alternates: { canonical: url },
    authors: [{ name: a.author_name }],
    openGraph: { title: a.title, description, url, type: 'article', publishedTime: a.published_at ?? undefined, modifiedTime: a.updated_at, authors: [a.author_name], images: a.hero_image_url ? [{ url: a.hero_image_url, alt: a.hero_image_alt ?? a.title }] : undefined },
    twitter: { card: a.hero_image_url ? 'summary_large_image' : 'summary', title: a.title, description, images: a.hero_image_url ? [a.hero_image_url] : undefined },
  }
}

export default async function ArticlePage({ params }: Props) {
  const a = await getArticleBySlug(params.slug)
  if (!a) return notFound()
  const dark = await getServerDark()
  const c = getDesignColors(dark)
  const loc = a.location_slug ? resolveLocation(a.location_slug) : null
  const locSlugs = [a.location_slug, loc ? citySlugFor(loc) : null].filter((s): s is string => !!s)

  const [related, devs] = await Promise.all([
    getPublishedArticles({ excludeSlug: a.slug, limit: 3, locationSlugs: undefined }),
    loc
      ? sb.from('developer_projects').select('id,name,stage,neighborhood,city').eq('publish_status', 'published').ilike('city', loc.cityLabel.replace(/[\\%_]/g, m => '\\' + m)).limit(60)
      : Promise.resolve({ data: null }),
  ])
  const relatedDevs = ((devs.data as { id: string; name: string; stage: string | null; neighborhood: string | null }[]) ?? [])
    .filter(d => !loc || loc.kind === 'city' || (d.neighborhood ?? '').toLowerCase().includes(loc.label.toLowerCase())).slice(0, 3)
  const date = a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null

  const ld = {
    '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.excerpt ?? undefined,
    datePublished: a.published_at ?? undefined, dateModified: a.updated_at, image: a.hero_image_url ?? undefined,
    author: { '@type': 'Organization', name: a.author_name }, publisher: { '@type': 'Organization', name: 'MANOP', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/markets/research/${a.slug}`,
  }

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <article>
        <div style={wrap(760)}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, padding: '1.5rem 0 0' }}>
            <Link href="/markets/research" style={{ color: c.textMuted, textDecoration: 'none' }}>← MANOP Research</Link>
          </nav>
          <header style={{ padding: 'clamp(1.75rem,5vw,3rem) 0 clamp(1.5rem,4vw,2rem)' }}>
            <Eyebrow c={c}>{a.category}</Eyebrow>
            <h1 style={{ fontSize: 'clamp(1.9rem,5.2vw,3rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.12, margin: '0 0 16px' }}>{a.title}</h1>
            {a.excerpt && <p style={{ fontSize: 'clamp(1.1rem,2.4vw,1.3rem)', lineHeight: 1.6, color: c.textMuted, margin: '0 0 20px' }}>{a.excerpt}</p>}
            <div style={{ fontSize: 13, color: c.textFaint, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>{a.author_name}</span>{date && <time dateTime={a.published_at ?? undefined}>{date}</time>}{a.reading_minutes && <span>{a.reading_minutes} min read</span>}
            </div>
          </header>
        </div>

        {a.hero_image_url && (
          <figure style={{ ...wrap(1040), margin: '0 auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.hero_image_url} alt={a.hero_image_alt || ''} style={{ width: '100%', aspectRatio: '16 / 8', objectFit: 'cover', display: 'block', borderRadius: 4 }} />
            {(a.hero_image_credit) && <figcaption style={{ fontSize: 12, color: c.textFaint, marginTop: 8 }}>{a.hero_image_credit}</figcaption>}
          </figure>
        )}

        <div style={{ ...wrap(760), padding: 'clamp(2rem,5vw,3.25rem) clamp(1.25rem,4vw,2.5rem) 0' }}>
          <div style={{ fontSize: 'clamp(1.05rem,2.1vw,1.15rem)', lineHeight: 1.85, color: c.textMuted }}>
            <ArticleBody source={a.body} colors={{ textPrimary: c.textPrimary, textMuted: c.textMuted, textFaint: c.textFaint, border: c.border, accent: c.verificationTeal, surface: c.surfaceCard }} />
          </div>

          {a.sources?.length > 0 && (
            <aside aria-labelledby="sources-h" style={{ borderTop: `1px solid ${c.border}`, marginTop: 40, paddingTop: 24 }}>
              <h2 id="sources-h" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: c.textFaint, margin: '0 0 12px' }}>Sources and references</h2>
              <ol style={{ margin: 0, paddingLeft: '1.2em', fontSize: 14.5, color: c.textMuted, lineHeight: 1.7 }}>
                {a.sources.map((s, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: c.verificationTeal }}>{s.label}</a> : s.label}
                    <span style={{ color: c.textFaint }}>{[s.type ? SOURCE_TYPE_LABEL[s.type] : null, s.date].filter(Boolean).map(x => ` · ${x}`).join('')}</span>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      </article>

      {(loc || relatedDevs.length > 0 || related.rows.length > 0) && (
        <div style={{ ...wrap(1040), paddingTop: 'clamp(2.5rem,6vw,4rem)', paddingBottom: '4rem' }}>
          <h2 style={{ fontSize: 'clamp(1.2rem,2.5vw,1.5rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 18px', paddingTop: 24, borderTop: `1px solid ${c.border}` }}>Related MANOP intelligence</h2>
          {loc && (
            <Link href={`/markets/${loc.slug}`} style={{ display: 'block', border: `1px solid ${c.border}`, borderRadius: 4, padding: '1rem 1.2rem', textDecoration: 'none', color: c.textPrimary, background: c.surfaceCard, marginBottom: 14, maxWidth: 560 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.verificationTeal, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Related location</div>
              <div style={{ fontSize: 17, fontWeight: 800, margin: '4px 0' }}>{loc.label}</div>
              <div style={{ fontSize: 14, color: c.textMuted }}>What MANOP currently knows about this market →</div>
            </Link>
          )}
          {relatedDevs.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Reviewed developments{loc ? ` in ${loc.label}` : ''}</div>
              {relatedDevs.map(d => <Link key={d.id} href={`/development/${d.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '0.8rem 0', borderTop: `1px solid ${c.border}`, textDecoration: 'none', color: c.textPrimary, minHeight: 44, maxWidth: 560 }}><span style={{ fontWeight: 700 }}>{d.name}</span><span style={{ fontSize: 13.5, color: c.textMuted }}>{d.stage}</span></Link>)}
            </div>
          )}
          {related.rows.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: 16 }}>
              {related.rows.map(r => <ArticleCard key={r.id} a={r} c={c} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}