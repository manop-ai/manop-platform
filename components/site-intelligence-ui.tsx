// components/site-intelligence-ui.tsx
//
// Shared presentational primitives used across Discovery and Review.
// Extracted so the two pages can't visually drift apart as the
// product grows — one Card, one Badge, one Section, styled once.
//
// ICON SYSTEM: two tiers, never blended.
//   1. Standard UI icons — lucide-react, for plain workflow states
//      (draft, pending, archived, under review).
//   2. The MANOP mark — components/ManopMark.tsx (the canonical one;
//      do not create a second MANOP mark component). Reserved ONLY
//      for claims that are MANOP's own proprietary assessment: a
//      completed MANOP review, or a MANOP-derived intelligence
//      finding. "Draft" gets a Lucide FileEdit icon, not this mark,
//      because "draft" is not a MANOP claim about anything.
// No emoji, no decorative Unicode symbols, anywhere in this file.

import {
  Clock, FileEdit, Archive, AlertTriangle, XCircle, FileText,
} from 'lucide-react'
import { ManopMark } from './ManopMark'
import { getDesignColors, designTokens } from '../lib/theme'
import {
  getSiteStatusStyle, getEvidenceStatusStyle, getDocumentStatusStyle,
  SiteStatus, EvidenceStatus, DocumentStatus,
} from '../lib/site-intelligence'

type C = ReturnType<typeof getDesignColors>

export function Section({ title, c, children }: { title: string; c: C; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: c.textPrimary }}>{title}</h2>
      {children}
    </div>
  )
}

export function Card({ c, children, onClick }: { c: C; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: c.surfaceCard, border: `1px solid ${c.border}`,
        borderRadius: designTokens.radius.sm, padding: 16, marginBottom: 16,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
    </div>
  )
}

export function Fact({ label, value, c }: { label: string; value: string; c: C }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: c.textMuted }}>{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  )
}

export function Muted({ children, c }: { children: React.ReactNode; c: C }) {
  return <div style={{ fontSize: 13.5, color: c.textMuted }}>{children}</div>
}

// Base badge — takes an optional leading icon (a Lucide icon element or
// the MANOP mark), passed in by the caller so this component never has
// to decide which tier a status belongs to.
export function Badge({
  label, color, bg, icon,
}: { label: string; color: string; bg: string; icon?: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11.5, fontWeight: 600, color, background: bg,
      padding: '3px 8px', borderRadius: designTokens.radius.badge, whiteSpace: 'nowrap',
    }}>
      {icon}
      {label}
    </span>
  )
}

const ICON_SIZE = 12

export function SiteStatusBadge({ status, dark }: { status: SiteStatus; dark: boolean }) {
  const s = getSiteStatusStyle(dark)[status]
  const icon = {
    draft:          <FileEdit size={ICON_SIZE} />,
    pending_review: <Clock size={ICON_SIZE} />,
    published:      <ManopMark size={ICON_SIZE} color={s.color} />, // "published" only ever happens after MANOP review — this IS the claim
    archived:       <Archive size={ICON_SIZE} />,
  }[status]
  return <Badge label={s.label} color={s.color} bg={s.bg} icon={icon} />
}

export function EvidenceBadge({ status, dark }: { status: EvidenceStatus; dark: boolean }) {
  const s = getEvidenceStatusStyle(dark)[status]
  const icon = {
    provided:                       <FileText size={ICON_SIZE} />,
    source_derived:                 <ManopMark size={ICON_SIZE} color={s.color} />,  // MANOP-derived, not yet human-reviewed
    cross_referenced:               <ManopMark size={ICON_SIZE} color={s.color} />,
    reviewed:                       <ManopMark size={ICON_SIZE} color={s.color} />,   // the one MANOP-reviewed state
    unable_to_establish:            <XCircle size={ICON_SIZE} />,
    requires_further_verification:  <AlertTriangle size={ICON_SIZE} />,
  }[status]
  return <Badge label={s.label} color={s.color} bg={s.bg} icon={icon} />
}

export function DocStatusBadge({ status, dark }: { status: DocumentStatus; dark: boolean }) {
  const s = getDocumentStatusStyle(dark)[status]
  const icon = {
    provided:                       <FileText size={ICON_SIZE} />,
    under_review:                   <Clock size={ICON_SIZE} />,
    reviewed:                       <ManopMark size={ICON_SIZE} color={s.color} />,
    unable_to_verify:               <XCircle size={ICON_SIZE} />,
    requires_further_verification:  <AlertTriangle size={ICON_SIZE} />,
  }[status]
  return <Badge label={s.label} color={s.color} bg={s.bg} icon={icon} />
}