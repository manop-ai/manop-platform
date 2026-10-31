// components/ArticleCard.tsx — a MANOP Research card. Real hero image when the article has one;
// otherwise a typographic block (never a placeholder picture).

import Link from 'next/link'
import type { ArticleListRow } from '../lib/research'
import type { MarketColors } from './market/MarketUI'

export default function ArticleCard({ a, c, featured = false }: { a: ArticleListRow; c: MarketColors; featured?: boolean }) {
  const date = a.published_at ? new Date(a.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null
  return (
    <Link href={`/markets/research/${a.slug}`} style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: c.textPrimary, border: `1px solid ${c.border}`, borderRadius: 4, background: c.surfaceCard, overflow: 'hidden', minWidth: 0, height: '100%' }}>
      {a.hero_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.hero_image_url} alt={a.hero_image_alt || ''} loading="lazy" style={{ width: '100%', aspectRatio: featured ? '16 / 8' : '16 / 10', objectFit: 'cover', display: 'block', background: c.surfaceCardHigh }} />
      ) : (
        <div aria-hidden style={{ aspectRatio: featured ? '16 / 8' : '16 / 10', background: c.surfaceCardHigh, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-end', padding: '1rem' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: c.intelligencePurple, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{a.category}</span>
        </div>
      )}
      <div style={{ padding: '1.1rem 1.2rem 1.25rem', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: c.verificationTeal, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{a.category}</div>
        <div style={{ fontSize: featured ? 'clamp(1.3rem,2.6vw,1.7rem)' : '1.15rem', fontWeight: 800, lineHeight: 1.28, letterSpacing: '-0.015em' }}>{a.title}</div>
        {a.excerpt && <div style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 1.65, flex: 1 }}>{a.excerpt}</div>}
        <div style={{ fontSize: 12.5, color: c.textFaint, display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          {a.reading_minutes && <span>{a.reading_minutes} min read</span>}
          <span>{a.author_name}</span>
          {date && <span>{date}</span>}
        </div>
      </div>
    </Link>
  )
}