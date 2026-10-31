'use client'
// components/dossier/EvidenceExplorer.tsx — the per-claim evidence register, made readable. A proportional bar shows at a glance how much of the
// information is documented/verified versus the developer's own statement versus still open; the reader can filter by source status and topic.
// It never turns the register into a verdict: it counts and labels, nothing more.
import { useMemo, useState } from 'react'

export interface EvidenceRow { category: string; claim: string; source: string | null; status: string; next_action?: string | null }

const LABEL: Record<string, string> = {
  independently_verified: 'Independently verified', documented: 'Documented', manop_observed: 'MANOP-observed', manop_derived: 'MANOP-derived',
  professional_opinion: 'Professional opinion', developer_stated: 'Developer-stated', unknown: 'Unknown',
  contradictory_clarification_required: 'Contradictory — clarification required',
}
const COLOR: Record<string, string> = {
  independently_verified: 'var(--dx-green)', documented: '#3B82F6', manop_observed: 'var(--dx-teal)', manop_derived: 'var(--dx-teal)',
  professional_opinion: 'var(--dx-violet)', developer_stated: 'var(--dx-amber)', unknown: 'var(--dx-faint)', contradictory_clarification_required: 'var(--dx-red)',
}
const ORDER = ['independently_verified', 'documented', 'manop_observed', 'manop_derived', 'professional_opinion', 'developer_stated', 'unknown', 'contradictory_clarification_required']
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())

export default function EvidenceExplorer({ rows }: { rows: EvidenceRow[] }) {
  const [status, setStatus] = useState<string | null>(null)
  const [cat, setCat] = useState<string | null>(null)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { m[r.status] = (m[r.status] || 0) + 1 })
    return ORDER.filter(k => m[k]).concat(Object.keys(m).filter(k => !ORDER.includes(k))).map(k => ({ k, n: m[k] }))
  }, [rows])
  const cats = useMemo(() => Array.from(new Set(rows.map(r => r.category))).sort(), [rows])
  const shown = rows.filter(r => (!status || r.status === status) && (!cat || r.category === cat))
  const grouped = useMemo(() => {
    const g: Record<string, EvidenceRow[]> = {}
    shown.forEach(r => { (g[r.category] = g[r.category] || []).push(r) })
    return Object.entries(g)
  }, [shown])

  const backed = rows.filter(r => ['independently_verified', 'documented', 'manop_observed', 'manop_derived'].includes(r.status)).length
  const stated = rows.filter(r => r.status === 'developer_stated').length
  const open = rows.length - backed - stated

  return (
    <div>
      <h2 className="dx-h2">What MANOP knows</h2>
      <p className="dx-sub">
        {rows.length} claim{rows.length === 1 ? '' : 's'} recorded for this development. <strong>{backed}</strong> backed by a document or by MANOP&apos;s own check,
        {' '}<strong>{stated}</strong> the developer&apos;s own statement, <strong>{open}</strong> still open. A developer&apos;s statement is never shown as if it were confirmed.
      </p>

      <div className="dx-meter" role="img" aria-label="Share of claims by source status">
        {counts.map(c => <i key={c.k} style={{ flex: c.n, background: COLOR[c.k] || 'var(--dx-faint)' }} title={`${LABEL[c.k] || c.k}: ${c.n}`} />)}
      </div>
      <div className="dx-legend">
        <button className="dx-pill" aria-pressed={status === null} onClick={() => setStatus(null)}>All <em>{rows.length}</em></button>
        {counts.map(c => (
          <button key={c.k} className="dx-pill" aria-pressed={status === c.k} onClick={() => setStatus(status === c.k ? null : c.k)}>
            <i style={{ background: COLOR[c.k] || 'var(--dx-faint)' }} />{LABEL[c.k] || pretty(c.k)} <em>{c.n}</em>
          </button>
        ))}
      </div>
      {cats.length > 1 && (
        <div className="dx-legend">
          <button className="dx-pill" aria-pressed={cat === null} onClick={() => setCat(null)}>All topics</button>
          {cats.map(c => <button key={c} className="dx-pill" aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{pretty(c)}</button>)}
        </div>
      )}

      {grouped.length === 0 && <div className="dx-empty">No claims match this filter.</div>}
      {grouped.map(([category, list]) => (
        <div key={category}>
          <div className="dx-cat">{pretty(category)}</div>
          <div className="dx-claims">
            {list.map((e, i) => (
              <div key={i} className="dx-claim" style={{ borderLeftColor: COLOR[e.status] || 'var(--dx-faint)' }}>
                <p>{e.claim}</p>
                <div className="m">
                  <b style={{ color: COLOR[e.status] || 'var(--dx-faint)' }}>{LABEL[e.status] || pretty(e.status)}</b>
                  {e.source && <span>Source: {e.source}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
