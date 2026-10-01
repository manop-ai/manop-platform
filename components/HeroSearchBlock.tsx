'use client'
// components/HeroSearchBlock.tsx
//
// The pattern: one big image (not a grid of cards), a search overlay on
// top of it, and results only appear once someone actually searches an
// area — never a default dump of "everything we have." Used identically
// for Properties and Developments, just swapping the copy and the query.
//
// NOTE: heroImage defaults to a placeholder gradient. Pass the real Lagos
// skyline image path from the homepage once you confirm where it lives
// in /public (e.g. '/hero-lagos.jpg') — I don't have that exact filename,
// so I'm not guessing at a path that might not exist.

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { getDesignColors, designTokens } from '../lib/theme'

interface Props {
  dark: boolean
  heroImage?: string
  heading: string
  subheading: string
  placeholder: string
  onSearch: (query: string) => void
  primaryAction: { label: string; onClick: () => void; icon?: React.ReactNode }
  secondaryAction: { label: string; onClick: () => void; icon?: React.ReactNode }
}

export default function HeroSearchBlock({
  dark, heroImage, heading, subheading, placeholder, onSearch, primaryAction, secondaryAction,
}: Props) {
  const c = getDesignColors(dark)
  const [query, setQuery] = useState('')

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ── Hero — one big image, text laid on top, no card grid here ── */}
      <div style={{
        position: 'relative', height: 340, borderRadius: designTokens.radius.sm, overflow: 'hidden',
        background: heroImage ? `url(${heroImage}) center/cover` : 'linear-gradient(135deg, #1A2D4A, #0A192F)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(10,25,47,0.35), rgba(10,25,47,0.75))' }} />
        <div style={{ position: 'relative', textAlign: 'center' as const, padding: '0 1.5rem', maxWidth: 600 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 0 8px', fontFamily: designTokens.font.family }}>
            {heading}
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', margin: '0 0 20px' }}>
            {subheading}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch(query)}
              placeholder={placeholder}
              style={{
                flex: 1, padding: '1.05rem 1.25rem', borderRadius: designTokens.radius.sm, border: 'none',
                fontSize: 16, outline: 'none', fontFamily: designTokens.font.family,
              }}
            />
            <button
              onClick={() => onSearch(query)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '1.05rem 2rem', borderRadius: designTokens.radius.sm, background: c.intelligencePurple,
                color: '#fff', border: 'none', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: designTokens.font.family,
                whiteSpace: 'nowrap' as const,
              }}
            >
              Search <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Two quick-action blocks — always visible, not tied to search ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <button onClick={primaryAction.onClick} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.9rem', borderRadius: designTokens.radius.sm, background: c.surfaceCard,
          border: `1px solid ${c.border}`, color: c.textPrimary, fontWeight: 700, fontSize: 13.5,
          cursor: 'pointer', fontFamily: designTokens.font.family, textAlign: 'left' as const,
        }}>
          {primaryAction.icon}{primaryAction.label}
        </button>
        <button onClick={secondaryAction.onClick} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.9rem', borderRadius: designTokens.radius.sm, background: c.surfaceCard,
          border: `1px solid ${c.border}`, color: c.textPrimary, fontWeight: 700, fontSize: 13.5,
          cursor: 'pointer', fontFamily: designTokens.font.family, textAlign: 'left' as const,
        }}>
          {secondaryAction.icon}{secondaryAction.label}
        </button>
      </div>
    </div>
  )
}