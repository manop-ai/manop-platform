'use client'
// app/developments/DevelopmentsViewToggle.tsx
//
// Same pattern as Site Intelligence's DiscoveryViewToggle — plain links,
// no JS required to switch views, kept as its own tiny client component
// so the page itself stays a server component. Params differ (area only,
// no opportunity_type), so this is its own small file rather than a fork.

import Link from 'next/link'
import { getDesignColors, designTokens } from '../../lib/theme'

export default function DevelopmentsViewToggle({
  currentView, searchParams, dark,
}: {
  currentView: 'list' | 'map'
  searchParams: Record<string, string | undefined>
  dark: boolean
}) {
  const c = getDesignColors(dark)

  function hrefFor(view: 'list' | 'map') {
    const params = new URLSearchParams()
    if (searchParams.area) params.set('area', searchParams.area)
    if (searchParams.category) params.set('category', searchParams.category)
    params.set('view', view)
    return `/developments?${params.toString()}`
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