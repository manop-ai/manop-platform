'use client'
// components/DesignSystem.tsx
//
// MANOP VISUAL IDENTITY PASS — shared primitives.
//
// This file does not introduce a new visual language. It names and
// packages patterns that already exist scattered across the repo
// (lib/theme.ts's getDesignColors, the eyebrow/h1/supporting-text pattern
// already used on app/finance/page.tsx and app/page.tsx, the status-pill
// pattern duplicated slightly differently in app/admin/page.tsx and
// app/finance/page.tsx, ManopMark/ManopReviewTag's "MANOP claims this"
// grammar) so every page that needs one of these reaches for the same
// component instead of inventing its own version again.
//
// Nothing here changes colors, radii or spacing — everything is read from
// lib/theme.ts's designTokens / getDesignColors(dark), which stays the
// single source of truth for the palette (neutral surfaces, restrained
// purple as the intelligence accent, restrained teal as the
// verification/evidence accent — no new accent colours are introduced).

import { ReactNode } from 'react'
import { getDesignColors, designTokens } from '../lib/theme'
import { CheckCircle2, FileText, Sigma, AlertTriangle, HelpCircle, User } from 'lucide-react'

// ── Typography ───────────────────────────────────────────────────────────
// One scale, named by role rather than by pixel size, so "what is this
// text for" reads at the call site instead of a bare fontSize number.

export function Eyebrow({ children, dark = true, color }: { children: ReactNode; dark?: boolean; color?: string }) {
  const c = getDesignColors(dark)
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: color ?? c.intelligencePurple, marginBottom: 14 }}>
      {children}
    </div>
  )
}

export function PageTitle({ children, dark = true, maxWidth = 860 }: { children: ReactNode; dark?: boolean; maxWidth?: number }) {
  const c = getDesignColors(dark)
  return (
    <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 18px', maxWidth, color: c.textPrimary }}>
      {children}
    </h1>
  )
}

export function SectionTitle({ children, dark = true, maxWidth }: { children: ReactNode; dark?: boolean; maxWidth?: number }) {
  const c = getDesignColors(dark)
  return (
    <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 800, lineHeight: 1.15, margin: '0 0 12px', maxWidth, color: c.textPrimary }}>
      {children}
    </h2>
  )
}

export function SupportingText({ children, dark = true, maxWidth = 640, size = 'md' }: { children: ReactNode; dark?: boolean; maxWidth?: number; size?: 'sm' | 'md' }) {
  const c = getDesignColors(dark)
  return (
    <p style={{ fontSize: size === 'md' ? 16 : 13.5, color: c.textMuted, lineHeight: 1.65, maxWidth, margin: 0 }}>
      {children}
    </p>
  )
}

// Field/column label — small, uppercase, muted. Used in forms, tables,
// metadata rows.
export function FieldLabel({ children, dark = true }: { children: ReactNode; dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 5 }}>
      {children}
    </div>
  )
}

// Fine print — caveats, "last updated", source lines.
export function MetaText({ children, dark = true }: { children: ReactNode; dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <div style={{ fontSize: 12, color: c.textFaint, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

// ── Buttons ──────────────────────────────────────────────────────────────
// primary / secondary / tertiary / destructive, each with a disabled and
// loading state, one shared sizing and radius so a button looks the same
// whichever page it's on.

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive'

export function ManopButton({
  children, onClick, variant = 'primary', dark = true, disabled = false, loading = false,
  type = 'button', fullWidth = false, size = 'md',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  dark?: boolean
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
  size?: 'sm' | 'md'
}) {
  const c = getDesignColors(dark)
  const isOff = disabled || loading

  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: designTokens.font.family, fontWeight: 700,
    fontSize: size === 'md' ? 14 : 13, padding: size === 'md' ? '0.68rem 1.25rem' : '0.5rem 0.9rem',
    borderRadius: designTokens.radius.sm, cursor: isOff ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.15s, background 0.15s, border-color 0.15s',
    width: fullWidth ? '100%' : undefined,
    opacity: isOff ? 0.55 : 1,
    WebkitTapHighlightColor: 'transparent',
  }

  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary:     { background: c.intelligencePurple, color: '#fff', border: `1px solid ${c.intelligencePurple}` },
    secondary:   { background: 'transparent', color: c.textPrimary, border: `1px solid ${c.border}` },
    tertiary:    { background: 'transparent', color: c.intelligencePurple, border: '1px solid transparent', padding: size === 'md' ? '0.5rem 0.4rem' : '0.3rem 0.2rem' },
    destructive: { background: dark ? 'rgba(239,68,68,0.12)' : 'rgba(220,38,38,0.08)', color: dark ? '#EF4444' : '#DC2626', border: `1px solid ${dark ? 'rgba(239,68,68,0.3)' : 'rgba(220,38,38,0.25)'}` },
  }

  return (
    <button type={type} onClick={isOff ? undefined : onClick} disabled={isOff} style={{ ...base, ...variants[variant] }}>
      {loading && <Spinner size={13} color={variant === 'primary' ? '#fff' : c.intelligencePurple} />}
      {children}
    </button>
  )
}

function Spinner({ size = 14, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'manop-spin 0.8s linear infinite' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" fill="none" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <style>{`@keyframes manop-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}

// ── Provenance / Evidence tag ────────────────────────────────────────────
// The single vocabulary for where a figure or claim came from. Never
// invent a new label at a call site — every provenance tag anywhere in
// MANOP should resolve through this map so "User-stated" always looks
// and reads the same way whether it's on a Finance Intelligence result,
// an admin table, or a Site Intelligence evidence row.
//
// This is deliberately a short, closed set — adding a new kind of claim
// to MANOP means adding it here first, not inventing a one-off label on a
// single page.

export type Provenance =
  | 'user_stated'
  | 'evidence_backed'
  | 'calculated'
  | 'indicative'
  | 'requires_verification'
  | 'data_unavailable'

const PROVENANCE_META: Record<Provenance, { label: string; icon: typeof User }> = {
  user_stated:           { label: 'User-stated',               icon: User },
  evidence_backed:       { label: 'Evidence-backed',            icon: FileText },
  calculated:            { label: 'Calculated',                 icon: Sigma },
  indicative:            { label: 'Indicative',                 icon: HelpCircle },
  requires_verification: { label: 'Requires further verification', icon: AlertTriangle },
  data_unavailable:      { label: 'Data unavailable',            icon: AlertTriangle },
}

// Colour per provenance — teal for anything MANOP can stand behind
// (evidence-backed, calculated by MANOP's own deterministic engine),
// amber for anything provisional or unverified, muted grey for an
// honest "we don't have this." Never green/red (that reads as a
// pass/fail verdict, which Finance Intelligence never issues) and never
// a colour outside the existing palette.
export function EvidenceTag({ kind, dark = true, size = 'sm' }: { kind: Provenance; dark?: boolean; size?: 'sm' | 'md' }) {
  const c = getDesignColors(dark)
  const meta = PROVENANCE_META[kind]
  const Icon = meta.icon
  const color = kind === 'evidence_backed' || kind === 'calculated' ? c.verificationTeal
    : kind === 'user_stated' ? c.intelligencePurple
    : kind === 'data_unavailable' ? c.textMuted
    : c.statusAmber
  const bg = kind === 'evidence_backed' || kind === 'calculated' ? c.verificationTealBg
    : kind === 'user_stated' ? c.intelligencePurpleBg
    : kind === 'data_unavailable' ? c.surfaceCardHigh
    : c.statusAmberBg
  const fontSize = size === 'md' ? 12 : 10.5
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize, fontWeight: 700,
      color, background: bg, borderRadius: 20, padding: size === 'md' ? '4px 10px' : '2.5px 8px',
      whiteSpace: 'nowrap' as const, letterSpacing: '0.01em',
    }}>
      <Icon size={size === 'md' ? 13 : 11} />
      {meta.label}
    </span>
  )
}

// ── Review / verification status pill ────────────────────────────────────
// Reviewed / Under Review / Provided (buyer or developer supplied it,
// MANOP hasn't checked it) — distinct from EvidenceTag's provenance
// vocabulary, which describes a single figure; this describes the state
// of a whole record (a site submission, a document, a development).
export type ReviewStatus = 'reviewed' | 'under_review' | 'provided' | 'not_started'

const REVIEW_META: Record<ReviewStatus, { label: string }> = {
  reviewed:     { label: 'Reviewed' },
  under_review: { label: 'Under Review' },
  provided:     { label: 'Provided' },
  not_started:  { label: 'Not Started' },
}

export function ReviewStatusPill({ status, dark = true }: { status: ReviewStatus; dark?: boolean }) {
  const c = getDesignColors(dark)
  const color = status === 'reviewed' ? c.verificationTeal
    : status === 'under_review' ? c.intelligencePurple
    : status === 'provided' ? c.statusAmber
    : c.textMuted
  const bg = status === 'reviewed' ? c.verificationTealBg
    : status === 'under_review' ? c.intelligencePurpleBg
    : status === 'provided' ? c.statusAmberBg
    : c.surfaceCardHigh
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700,
      color, background: bg, borderRadius: 20, padding: '2.5px 9px',
      textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
    }}>
      {status === 'reviewed' && <CheckCircle2 size={11} />}
      {REVIEW_META[status].label}
    </span>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────
// A thin wrapper over the same surfaceCard/border/radius every ad hoc
// "card" in the repo already uses by hand — use it to stop re-typing the
// same three style lines, not to turn every scrap of text into a card.
export function Card({ children, dark = true, padding = '1.25rem', style }: { children: ReactNode; dark?: boolean; padding?: string; style?: React.CSSProperties }) {
  const c = getDesignColors(dark)
  return (
    <div style={{ background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: 12, padding, ...style }}>
      {children}
    </div>
  )
}

// ── Consent / acknowledgement checkbox ───────────────────────────────────
// The one acknowledgement control for a Finance Intelligence enquiry —
// see components/FinancingModal.tsx's confirm step for the live use.
// Deliberately a single shared component so the wording can never drift
// between where it's used.
export const FINANCE_CONSENT_TEXT =
  'I understand that the information and calculations provided by MANOP may be indicative and based on the information available. I understand that submitting this enquiry does not constitute financial advice, lending approval or a financing commitment, and that I may need independent professional verification before making a decision.'

export function ConsentCheckbox({ checked, onChange, dark = true }: { checked: boolean; onChange: (v: boolean) => void; dark?: boolean }) {
  const c = getDesignColors(dark)
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
      background: c.surfaceCardHigh, border: `1px solid ${c.border}`, borderRadius: 10,
      padding: '0.8rem 0.9rem', fontSize: 12.5, color: c.textPrimary, lineHeight: 1.6,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: c.intelligencePurple }}
      />
      <span>{FINANCE_CONSENT_TEXT}</span>
    </label>
  )
}