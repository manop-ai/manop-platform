// components/market/MarketUI.tsx — shared presentational pieces for Market Intelligence pages.
// Server-compatible (no hooks). Nexus Infrastructure: 1px borders, 4px radius, no shadows.

import React from 'react'
import { getDesignColors } from '../../lib/theme'

export type MarketColors = ReturnType<typeof getDesignColors>

export const wrap = (max = 1040): React.CSSProperties => ({
  maxWidth: max, margin: '0 auto', padding: '0 clamp(1.25rem,4vw,2.5rem)',
})

export function Eyebrow({ c, children }: { c: MarketColors; children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: c.verificationTeal, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>{children}</div>
}

export function Section({ id, c, title, intro, children }: { id: string; c: MarketColors; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} style={{ padding: 'clamp(2rem,5vw,3.25rem) 0', borderTop: `1px solid ${c.border}`, scrollMarginTop: 72 }}>
      <h2 id={`${id}-h`} style={{ fontSize: 'clamp(1.25rem,2.6vw,1.6rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: c.textPrimary }}>{title}</h2>
      {intro && <p style={{ fontSize: 15, color: c.textMuted, lineHeight: 1.7, margin: '8px 0 0', maxWidth: 640 }}>{intro}</p>}
      <div style={{ marginTop: 20 }}>{children}</div>
    </section>
  )
}

export type SourceKind = 'MANOP data' | 'Development evidence' | 'Site evidence' | 'Market evidence' | 'External source' | 'MANOP analysis'

/** Progressive disclosure of provenance: Source / type / date / status, closed by default. */
export function Provenance({ c, kind, source, asOf, status, note }: {
  c: MarketColors; kind: SourceKind; source: string; asOf?: string | null; status: string; note?: string
}) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, color: c.textFaint, cursor: 'pointer', listStyle: 'none', minHeight: 24 }}>Source details</summary>
      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', fontSize: 12.5, color: c.textMuted, margin: '8px 0 0', lineHeight: 1.6 }}>
        <dt style={{ color: c.textFaint }}>Source type</dt><dd style={{ margin: 0 }}>{kind}</dd>
        <dt style={{ color: c.textFaint }}>Source</dt><dd style={{ margin: 0 }}>{source}</dd>
        {asOf && (<><dt style={{ color: c.textFaint }}>As of</dt><dd style={{ margin: 0 }}>{new Date(asOf).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></>)}
        <dt style={{ color: c.textFaint }}>Status</dt><dd style={{ margin: 0 }}>{status}</dd>
        {note && (<><dt style={{ color: c.textFaint }}>MANOP note</dt><dd style={{ margin: 0 }}>{note}</dd></>)}
      </dl>
    </details>
  )
}

export function Fact({ c, label, value, statement, children }: { c: MarketColors; label: string; value: string; statement: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 4, padding: '1.1rem 1.2rem', background: c.surfaceCard, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 'clamp(1.5rem,3vw,1.9rem)', fontWeight: 800, letterSpacing: '-0.02em', color: c.textPrimary, margin: '6px 0 4px', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 1.6 }}>{statement}</div>
      {children}
    </div>
  )
}