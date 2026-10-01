// app/developments/CategoryTabs.tsx
//
// Splits Reviewed Developments into New Build vs Off Plan — derived
// directly from developer_projects.stage, which already distinguishes
// this (Planning/Foundation/Structure/Finishing = still under
// construction = Off Plan; Completed = New Build). No new schema —
// this is a read of data that was already there.
//
// Server-rendered, same "plain links, works without JS" pattern as the
// list/map toggle — no client component needed for a set of filter links.

import Link from 'next/link'
import { getDesignColors, designTokens } from '../../lib/theme'

export type DevCategory = 'all' | 'new_build' | 'off_plan'

const TABS: { key: DevCategory; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'new_build', label: 'New Build' },
  { key: 'off_plan',  label: 'Off Plan' },
]

export default function CategoryTabs({
  current, area, view, dark,
}: { current: DevCategory; area?: string; view: 'list' | 'map'; dark: boolean }) {
  const c = getDesignColors(dark)

  function hrefFor(cat: DevCategory) {
    const params = new URLSearchParams()
    if (area) params.set('area', area)
    if (cat !== 'all') params.set('category', cat)
    params.set('view', view)
    return `/developments?${params.toString()}`
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
      {TABS.map(t => {
        const active = current === t.key
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            style={{
              padding: '9px 16px', fontSize: 13.5, fontWeight: active ? 700 : 500, textDecoration: 'none',
              color: active ? '#fff' : c.textMuted,
              background: active ? c.intelligencePurple : 'transparent',
              border: `1px solid ${active ? c.intelligencePurple : c.border}`,
              borderRadius: designTokens.radius.sm,
            }}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}