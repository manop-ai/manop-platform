'use client'
// app/site-intelligence/DiscoveryViewToggle.tsx
//
// A two-button toggle between list and map view on Discovery. Kept as
// its own tiny client component (rather than making the whole
// Discovery page a client component) so the page keeps rendering as
// a server component by default — only this toggle needs interactivity,
// and even it works via plain links (no JS required to switch views).

import Link from 'next/link'
import { getDesignColors, designTokens } from '../../lib/theme'

export default function DiscoveryViewToggle({
  currentView, searchParams, dark,
}: {
  currentView: 'list' | 'map'
  searchParams: Record<string, string | undefined>
  dark: boolean
}) {
  const c = getDesignColors(dark)

  function hrefFor(view: 'list' | 'map') {
    const params = new URLSearchParams()
    if (searchParams.city) params.set('city', searchParams.city)
    if (searchParams.opportunity_type) params.set('opportunity_type', searchParams.opportunity_type)
    params.set('view', view)
    return `/site-intelligence?${params.toString()}`
  }

  const btn = (view: 'list' | 'map', label: string) => {
    const active = currentView === view
    return (
      <Link
        href={hrefFor(view)}
        style={{
          padding: '8px 14px', fontSize: 13, textDecoration: 'none',
          color: active ? '#fff' : c.textMuted,
          background: active ? c.intelligencePurple : 'transparent',
          border: `1px solid ${active ? c.intelligencePurple : c.border}`,
          borderRadius: designTokens.radius.sm,
        }}
      >
        {label}
      </Link>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {btn('list', 'List')}
      {btn('map', 'Map')}
    </div>
  )
}