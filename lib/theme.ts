// lib/theme.ts — Manop theme system
// UPDATED: setTheme() now sets data-theme on <html> so CSS variables
// respond immediately on ALL pages without needing React state updates.
// This means dark mode works even before JS hydrates.
//
// This file was accidentally overwritten in an earlier session — restored
// exactly as-is below, with the new design tokens (from the Stitch/Nexus
// export) added as a separate, non-colliding export at the bottom. Nothing
// that already imports getInitialDark/setTheme/listenTheme needs to change.

export const THEME_KEY   = 'manop-dark'
export const THEME_EVENT = 'manop-theme'

export function getInitialDark(): boolean {
  if (typeof window === 'undefined') return true

  const saved = localStorage.getItem(THEME_KEY)
  if (saved !== null) return saved === 'true'

  const cookieMatch = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${THEME_KEY}=`))
  if (cookieMatch) return cookieMatch.split('=')[1] === 'true'

  // Default: dark — Manop's brand is dark-first
  return true
}

export function setTheme(dark: boolean) {
   if (typeof window === 'undefined') return
   localStorage.setItem(THEME_KEY, String(dark))
   document.cookie = `${THEME_KEY}=${dark}; path=/; max-age=31536000; SameSite=Lax`
   document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
   window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: dark }))
 }

export function listenTheme(cb: (dark: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail)
  window.addEventListener(THEME_EVENT, handler)
  return () => window.removeEventListener(THEME_EVENT, handler)
}

// Call this in app/layout.tsx to apply saved theme before hydration
// Prevents flash of wrong theme
export const THEME_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('manop-dark');
    var dark = saved !== null ? saved === 'true' : true;
    localStorage.setItem('manop-dark', String(dark));
    document.cookie = 'manop-dark=' + dark + '; path=/; max-age=31536000; SameSite=Lax';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {}
})();
`

// ── Design tokens (Stitch/"Nexus Infrastructure" export, Aug 2026) ──────
// Kept as a separate named export — designTokens — so it never collides
// with the dark/light system above. Both can be imported from this same
// file: `import { getInitialDark, designTokens } from '../lib/theme'`.
//
// designTokens is the DARK palette (kept as the default export shape for
// anything already using it directly). getDesignColors(dark) is the
// theme-aware entry point everything new should use instead — it returns
// dark or light colors based on the same boolean the rest of MANOP's
// dark/light system already uses.
export const designTokens = {
  colors: {
    background:       '#0A192F',
    surfaceCard:       '#112240',
    surfaceCardHigh:   '#1A2D4A',
    border:            '#1D2D44',
    borderFocus:       '#6D28D9',
    textPrimary:       '#E0E2F0',
    textMuted:         '#94A3B8',
    textFaint:         'rgba(224,226,240,0.35)',
    intelligencePurple: '#6D28D9',
    intelligencePurpleBg: 'rgba(109,40,217,0.12)',
    verificationTeal:  '#0D9488',
    verificationTealBg: 'rgba(13,148,136,0.12)',
    statusAmber:       '#F59E0B',
    statusAmberBg:     'rgba(245,158,11,0.12)',
    statusRed:         '#EF4444',
    statusRedBg:       'rgba(239,68,68,0.12)',
  },
  font: {
    family: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap',
  },
  radius: { sm: 4, badge: 2, full: 9999 },
  spacing: { base: 4, gutter: 16, marginMobile: 16, marginDesktop: 32, maxWidth: 1440 },
} as const

// Light-mode equivalent — same brand accents (purple/teal/amber/red),
// surfaces and text inverted for a light background.
const lightColors = {
  background:       '#F8FAFC',
  surfaceCard:       '#FFFFFF',
  surfaceCardHigh:   '#F1F5F9',
  border:            '#E2E8F0',
  borderFocus:       '#6D28D9',
  textPrimary:       '#0F172A',
  textMuted:         '#64748B',
  textFaint:         'rgba(15,23,42,0.35)',
  intelligencePurple: '#6D28D9',
  intelligencePurpleBg: 'rgba(109,40,217,0.08)',
  verificationTeal:  '#0D9488',
  verificationTealBg: 'rgba(13,148,136,0.08)',
  statusAmber:       '#B45309',
  statusAmberBg:     'rgba(245,158,11,0.1)',
  statusRed:         '#DC2626',
  statusRedBg:       'rgba(239,68,68,0.08)',
} as const

// The function every new component should call, instead of importing
// designTokens.colors directly — respects light/dark automatically.
export function getDesignColors(dark: boolean) {
  return dark ? designTokens.colors : lightColors
}

// MANOP does not issue recommendations (migration 009,
// manop_review_not_recommendation) — a development either has been
// reviewed by MANOP or it hasn't. This is a single flat tag, not a
// verdict: it means "MANOP checked the information provided and
// recorded what it found," never "buy" / "avoid" / "safe".
export function getManopReviewBadgeStyle(dark: boolean): { label: string; color: string; bg: string; icon: string } {
  const c = getDesignColors(dark)
  return { label: 'MANOP Review', color: c.verificationTeal, bg: c.verificationTealBg, icon: '✓' }
}

export function getDataQualityStyle(dark: boolean): Record<string, { label: string; color: string }> {
  const c = getDesignColors(dark)
  return {
    high:   { label: 'High confidence',   color: c.verificationTeal },
    medium: { label: 'Medium confidence', color: c.statusAmber },
    low:    { label: 'Low confidence',    color: c.statusAmber },
    sparse: { label: 'Limited data',      color: c.textMuted },
  }
}

export const DATA_QUALITY_STYLE = getDataQualityStyle(true)
 