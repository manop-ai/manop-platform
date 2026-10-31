'use client'

// components/LocationSearch.tsx
// Search → resolve → open the location's intelligence page. Locations come from the canonical
// taxonomy (lib/locations.ts), so nothing here is hard-coded. A place MANOP does not track
// is said to be untracked, never given placeholder numbers.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { searchLocations } from '../lib/locations'
import type { MarketColors } from './market/MarketUI'

export default function LocationSearch({ c, autoFocus = false }: { c: MarketColors; autoFocus?: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchLocations(q), [q])
  const go = (slug: string) => router.push(`/markets/${slug}`)

  return (
    <div style={{ position: 'relative', maxWidth: 560 }}>
      <label htmlFor="mi-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search for a location</label>
      <input
        id="mi-search" role="combobox" aria-expanded={results.length > 0} aria-controls="mi-results" aria-autocomplete="list"
        autoFocus={autoFocus} value={q} autoComplete="off" placeholder="Search a city or area, for example Lagos or Ikoyi"
        onChange={e => { setQ(e.target.value); setActive(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && results[active]) go(results[active].location.slug)
        }}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: 52, padding: '0.85rem 1rem', fontSize: 16, fontFamily: 'inherit', color: c.textPrimary, background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: 4, outline: 'none' }}
      />
      {q.trim().length >= 2 && (
        <ul id="mi-results" role="listbox" style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, border: `1px solid ${c.border}`, borderRadius: 4, background: c.surfaceCard, overflow: 'hidden' }}>
          {results.length === 0 && (
            <li style={{ padding: '0.9rem 1rem', fontSize: 14, color: c.textMuted, lineHeight: 1.6 }}>
              MANOP does not track &ldquo;{q.trim()}&rdquo; yet, so there is no intelligence to show for it.
            </li>
          )}
          {results.map((m, i) => (
            <li key={m.location.slug} role="option" aria-selected={i === active}>
              <button onClick={() => go(m.location.slug)} onMouseEnter={() => setActive(i)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.8rem 1rem', minHeight: 48, border: 0, borderTop: i ? `1px solid ${c.border}` : 0, background: i === active ? c.surfaceCardHigh : 'transparent', color: c.textPrimary, fontFamily: 'inherit', cursor: 'pointer' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{m.location.label}</span>
                <span style={{ fontSize: 13, color: c.textMuted }}> · {m.location.kind === 'city' ? m.location.countryLabel : `${m.location.cityLabel}, ${m.location.countryLabel}`}{m.matchedMicro ? ` · includes ${m.matchedMicro}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}