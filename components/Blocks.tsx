'use client'
// components/Blocks.tsx
//
// The reusable "box" grammar for everything that goes in a dashboard's
// main content area — one visual language, used by developments, resale
// properties, area/market intelligence, and anything added later.
//
// The rule that matters most: if data doesn't exist yet, a block shows
// Locked, honestly — never a fake number, never an empty-looking gap that
// reads as broken. This is the same discipline as the "sparse/estimated/
// verified" comparables labeling, applied to every block in the system.

import { ReactNode } from 'react'
import { getDesignColors, designTokens } from '../lib/theme'

// ── Base block — every other block wraps this ─────────────────────
export function Block({ title, action, children, span, dark = true }: {
  title?: string
  action?: ReactNode
  children: ReactNode
  span?: 1 | 2 | 3 // how many grid columns this block occupies, see BlockGrid
  dark?: boolean
}) {
  const c = getDesignColors(dark)
  return (
    <div style={{
      background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm,
      padding: '1.1rem', gridColumn: span ? `span ${span}` : undefined,
    }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Grid — arranges blocks responsively, spans respected ──────────
export function BlockGrid({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
      {children}
    </div>
  )
}

// ── Locked state — the honest "not enough data yet" pattern ───────
// Use this INSIDE any block instead of rendering fake/placeholder data.
export function Locked({ reason, dark = true }: { reason?: string; dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0.5rem', textAlign: 'center' as const }}>
      <div style={{ fontSize: 20, marginBottom: 6, opacity: 0.5 }}>🔒</div>
      <div style={{ fontSize: 12, color: c.textMuted }}>
        {reason || 'Not enough data yet — this fills in as activity grows.'}
      </div>
    </div>
  )
}

// ── Media block — the "big picture" rule for developments/properties ──
export function MediaBlock({ src, alt, caption, height = 320, dark = true }: {
  src?: string | null
  alt: string
  caption?: string
  height?: number
  dark?: boolean
}) {
  const c = getDesignColors(dark)
  return (
    <div style={{ position: 'relative', height, borderRadius: designTokens.radius.sm, overflow: 'hidden', background: c.surfaceCardHigh, gridColumn: 'span 3' }}>
      {src ? (
        <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textFaint, fontSize: 13 }}>
          No image provided yet
        </div>
      )}
      {caption && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.6rem 0.9rem', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', fontSize: 11, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {caption}
        </div>
      )}
    </div>
  )
}

// ── Data block — one stat, with an honest locked state built in ───
export function DataBlock({ label, value, sublabel, source, locked, lockedReason, dark = true }: {
  label: string
  value?: string
  sublabel?: ReactNode
  source?: string
  locked?: boolean
  lockedReason?: string
  dark?: boolean
}) {
  const c = getDesignColors(dark)
  return (
    <Block dark={dark}>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8 }}>{label}</div>
      {locked ? (
        <Locked reason={lockedReason} dark={dark} />
      ) : (
        <>
          <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          {sublabel && <div style={{ fontSize: 12, marginTop: 4 }}>{sublabel}</div>}
          {source && <div style={{ fontSize: 10, color: c.textFaint, marginTop: 10, borderTop: `1px solid ${c.border}`, paddingTop: 8 }}>Source: {source}</div>}
        </>
      )}
    </Block>
  )
}

// ── Map block — placeholder until the real map component is wired in ──
export function MapBlock({ locked = true, dark = true }: { locked?: boolean; dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <Block title="Location" span={3} dark={dark}>
      {locked ? (
        <Locked reason="Map view — coming online as location data is confirmed." dark={dark} />
      ) : (
        <div style={{ height: 260, borderRadius: designTokens.radius.sm, background: c.surfaceCardHigh }} />
      )}
    </Block>
  )
}

// ── Badge — small status/label pill, theme-aware, with a real icon ─
// The icon is meaningful, not decorative — ✓ for verified/recommended,
// ⚠ for caution, ✕ for not-recommended/rejected, 🔒 for locked/pending.
// Never a bare colored circle with no meaning attached to it.
export function Badge({ label, color, bg, icon, dark = true }: {
  label: string
  color: string
  bg?: string
  icon?: string
  dark?: boolean
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color,
      background: bg ?? 'transparent', border: `1px solid ${color}44`,
      borderRadius: designTokens.radius.badge, padding: '3px 8px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
      {label}
    </span>
  )
}

// ── Verdict/badge block — recommendation, risk, or similar callouts ──
export function VerdictBlock({ label, verdict, color, reasoning, dark = true }: {
  label: string
  verdict: string
  color: string
  reasoning?: string
  dark?: boolean
}) {
  const c = getDesignColors(dark)
  return (
    <Block dark={dark}>
      <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{verdict}</div>
      {reasoning && <div style={{ fontSize: 12, color: c.textMuted, marginTop: 8, lineHeight: 1.5 }}>{reasoning}</div>}
    </Block>
  )
}