'use client'
// components/ManopLoader.tsx
//
// The one loading state MANOP should use everywhere — never generic
// "Loading..." text, never a bare spinner. A rotating ring around the
// MANOP mark, sized for either a full-page wait or an inline one.

import { getDesignColors } from '../lib/theme'

export default function ManopLoader({ dark = true, size = 'page', label }: {
  dark?: boolean
  size?: 'page' | 'inline'
  label?: string
}) {
  const c = getDesignColors(dark)
  const dim = size === 'page' ? 64 : 32
  const markSize = size === 'page' ? 22 : 12

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: dim, height: dim }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `${size === 'page' ? 3 : 2}px solid ${c.border}`,
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `${size === 'page' ? 3 : 2}px solid transparent`,
          borderTopColor: c.intelligencePurple,
          animation: 'manop-spin 0.9s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={dark ? '/logos/manop-icon-mono.svg' : '/logos/manop-icon-color.svg'}
            alt="MANOP"
            style={{ width: markSize * 1.4, height: markSize * 1.4 }}
            onError={e => {
              // If the SVG path is wrong or the file isn't there yet, don't
              // fail silently — fall back to a simple inline mark so the
              // loader is never just blank.
              const img = e.currentTarget
              img.style.display = 'none'
              const fallback = img.nextElementSibling as HTMLElement | null
              if (fallback) fallback.style.display = 'flex'
            }}
          />
          <div style={{
            display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%',
            fontWeight: 900, fontSize: markSize, color: c.intelligencePurple, fontFamily: "'Manrope', sans-serif",
          }}>
            M
          </div>
        </div>
      </div>
      {label && size === 'page' && (
        <div style={{ fontSize: 12, color: c.textMuted, fontFamily: "'Manrope', sans-serif" }}>{label}</div>
      )}
      <style>{`@keyframes manop-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (size === 'inline') return content

  return (
    <div style={{ background: c.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {content}
    </div>
  )
}