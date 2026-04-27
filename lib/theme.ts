// lib/theme.ts — Manop theme system
// UPDATED: setTheme() now sets data-theme on <html> so CSS variables
// respond immediately on ALL pages without needing React state updates.
// This means dark mode works even before JS hydrates.

export const THEME_KEY   = 'manop-dark'
export const THEME_EVENT = 'manop-theme'

export function getInitialDark(): boolean {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem(THEME_KEY)
  if (saved !== null) return saved === 'true'
  // Default: dark — Manop's brand is dark-first
  return true
}

export function setTheme(dark: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_KEY, String(dark))
  // Set CSS variable layer — works on all pages instantly
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  // Also dispatch event so React components can sync their local state
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
  var saved = localStorage.getItem('manop-dark');
  var dark = saved !== null ? saved === 'true' : true;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
`
