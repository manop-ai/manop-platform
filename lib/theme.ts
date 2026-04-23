// lib/theme.ts
// Shared dark mode state management across all pages
// NavBar writes → pages listen → stays in sync

export const THEME_KEY   = 'manop-dark'
export const THEME_EVENT = 'manop-theme'

export function getInitialDark(): boolean {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem(THEME_KEY)
  if (saved !== null) return saved === 'true'
  // Default to dark — our brand is dark-first
  return true
}

export function setTheme(dark: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_KEY, String(dark))
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: dark }))
}

export function listenTheme(cb: (dark: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail)
  window.addEventListener(THEME_EVENT, handler)
  return () => window.removeEventListener(THEME_EVENT, handler)
}
