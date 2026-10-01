'use client'
// components/SiteIntelligenceNav.tsx
//
// One shared nav strip across all three Site Intelligence surfaces
// (Discovery, Review, Submit) so a user is never more than one click
// from "see more sites" or "submit a site" — the specific ask this
// round was "make the workflow easy to navigate."
//
// Deliberately its own small component rather than folded into each
// page, so Discovery/Review/Submit all stay visually and structurally
// in sync as the product grows.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getDesignColors, designTokens } from '../lib/theme'

export default function SiteIntelligenceNav({ dark = true }: { dark?: boolean }) {
  const c = getDesignColors(dark)
  const pathname = usePathname()

  const tabs = [
    { href: '/site-intelligence', label: 'Discover Sites', match: (p: string) => p === '/site-intelligence' },
    { href: '/site-intelligence/studio', label: 'Site Studio', match: (p: string) => p.startsWith('/site-intelligence/studio') },
    { href: '/site-intelligence/submit', label: 'Submit a Site', match: (p: string) => p.startsWith('/site-intelligence/submit') },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${c.border}`, marginBottom: 24, paddingBottom: 0,
    }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {tabs.map((tab) => {
          const active = tab.match(pathname || '')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 4px', marginRight: 20, fontSize: 14, textDecoration: 'none',
                color: active ? c.textPrimary : c.textMuted,
                fontWeight: active ? 600 : 400,
                borderBottom: active ? `2px solid ${c.intelligencePurple}` : '2px solid transparent',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: c.textFaint, fontFamily: designTokens.font.family }}>
        Site Intelligence
      </div>
    </div>
  )
}

// A small "back to Discovery" link for pages one level deep (Review),
// so the way back is always visible without relying on the browser's
// back button.
export function BackToDiscovery({ dark = true }: { dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <Link
      href="/site-intelligence"
      style={{ fontSize: 13, color: c.textMuted, textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}
    >
      ← Back to Site Intelligence
    </Link>
  )
}