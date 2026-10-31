'use client'
// components/dossier/DossierTabs.tsx — lets a reader move between the sections of a dossier (Overview, Units, MANOP review, Evidence, Progress,
// Documents) instead of scrolling one long page. The panels are rendered by the server and passed in; this only decides which one is visible.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export interface DossierSection { id: string; label: string; badge?: string | number; node: ReactNode }

export default function DossierTabs({ sections }: { sections: DossierSection[] }) {
  const [active, setActive] = useState(sections[0]?.id)
  const top = useRef<HTMLDivElement>(null)
  const ids = sections.map(s => s.id)

  const select = useCallback((id: string, scroll = true) => {
    setActive(id)
    try { history.replaceState(null, '', `#${id}`) } catch { /* ignore */ }
    if (scroll && top.current) {
      const y = top.current.getBoundingClientRect().top + window.scrollY - 70
      if (window.scrollY > y) window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    const h = window.location.hash.replace('#', '')
    if (h && ids.includes(h)) setActive(h)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const i = Math.max(0, ids.indexOf(active as string))
  const prev = sections[i - 1], next = sections[i + 1]

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const to = sections[(i + (e.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length]
    select(to.id, false)
    requestAnimationFrame(() => document.getElementById(`dx-tab-${to.id}`)?.focus())
  }

  return (
    <div ref={top}>
      <div className="dx-tabs">
        <div className="dx-tablist" role="tablist" aria-label="Dossier sections" onKeyDown={onKey}>
          {sections.map(s => (
            <button key={s.id} id={`dx-tab-${s.id}`} role="tab" className="dx-tab" aria-selected={s.id === active} aria-controls={`dx-panel-${s.id}`}
              tabIndex={s.id === active ? 0 : -1} onClick={() => select(s.id)}>
              {s.label}{s.badge !== undefined && s.badge !== '' && <em>{s.badge}</em>}
            </button>
          ))}
        </div>
      </div>
      {sections.map(s => (
        <section key={s.id} id={`dx-panel-${s.id}`} role="tabpanel" aria-labelledby={`dx-tab-${s.id}`} className="dx-panel" hidden={s.id !== active}>
          {s.node}
        </section>
      ))}
      <div className="dx-next">
        {prev ? <button onClick={() => select(prev.id)}>← {prev.label}</button> : <span />}
        {next && <button onClick={() => select(next.id)}>{next.label} →</button>}
      </div>
    </div>
  )
}
