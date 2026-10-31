'use client'
// components/MediaFigure.tsx
//
// MANOP VISUAL IDENTITY PASS — the one image/hero component every page
// with real imagery (Finance Intelligence, Reviewed Developments, Site
// Intelligence, Site Studio) should use, instead of each page inventing
// its own banner markup.
//
// IMAGE SOURCING — READ BEFORE ADDING A PHOTO:
// This component takes an optional `src`. When a real photo URL is
// supplied (a Cloudinary asset, or — in the interim — a properly
// licensed stock photo Joel has sourced and uploaded, e.g. from
// Shutterstock) it is rendered directly, with the overlay and content
// layered on top exactly as specified in the visual-identity brief.
//
// When `src` is omitted, this renders a tasteful, brand-coloured abstract
// placeholder (a faint architectural line-grid on the category's accent
// colour) — NOT a photo, NOT an AI-generated building, and NOT a
// hotlinked image from a web search. I didn't wire in a photographic
// placeholder because I have no way to verify image rights from inside
// this environment, and the brief is explicit that an unlicensed or
// AI-generated building image is worse than no image. The moment a real
// photo exists (Shutterstock download today, Cloudinary/MANOP asset
// later), pass it as `src` — nothing else about the calling page changes.
// This is the swap point the brief asks for: build the layout now,
// replace the pixels later, with zero component-shape changes.
//
// Per the brief's per-page guidance, pick `category` by subject:
//   finance               — development/architecture/financial context
//   reviewed-developments — actual development/project photography
//   site-intelligence     — real site, aerial, map, spatial context
//   site-studio           — architectural/massing/site imagery

import { ReactNode } from 'react'
import { getDesignColors } from '../lib/theme'

export type MediaCategory = 'finance' | 'reviewed-developments' | 'site-intelligence' | 'site-studio'

const CATEGORY_ACCENT: Record<MediaCategory, string> = {
  finance:               '#5B2EFF', // intelligence purple
  'reviewed-developments': '#14B8A6', // verification teal — these are MANOP-reviewed developments
  'site-intelligence':    '#14B8A6',
  'site-studio':          '#5B2EFF',
}

interface MediaFigureProps {
  category: MediaCategory
  src?: string | null
  alt: string
  dark?: boolean
  overlay?: 'navy' | 'white' | 'none'
  height?: number | string
  children?: ReactNode
  rounded?: boolean
}

export default function MediaFigure({
  category, src, alt, dark = true, overlay = 'navy', height = 320, children, rounded = true,
}: MediaFigureProps) {
  const c = getDesignColors(dark)
  const accent = CATEGORY_ACCENT[category]

  // Controlled overlay so text laid over the image stays readable — a
  // deep navy scrim in dark mode, a soft white scrim in light mode,
  // never strong enough to hide the image entirely.
  const overlayGradient = overlay === 'none' ? 'none'
    : overlay === 'white'
      ? 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.85) 100%)'
      : 'linear-gradient(180deg, rgba(10,25,47,0.35) 0%, rgba(10,25,47,0.92) 100%)'

  return (
    <div style={{
      position: 'relative', width: '100%', height,
      borderRadius: rounded ? 16 : 0, overflow: 'hidden',
      background: src ? '#0A192F' : `linear-gradient(135deg, ${accent}14, ${c.surfaceCardHigh})`,
      border: src ? 'none' : `1px solid ${c.border}`,
    }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <PlaceholderPattern accent={accent} />
      )}

      {src && overlay !== 'none' && (
        <div style={{ position: 'absolute', inset: 0, background: overlayGradient }} />
      )}

      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '1.75rem 2rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// Abstract architectural line-grid — deliberately not a building, not a
// skyline, not a rendered scene. A quiet geometric motif in the page's
// category accent colour, standing in for a photo until a real, properly
// licensed one is supplied via `src`.
function PlaceholderPattern({ accent }: { accent: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="mf-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect width="400" height="320" fill="url(#mf-fade)" />
      {/* a loose grid of "elevation" lines, varying height, suggesting massing without depicting an actual building */}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = i * 30 + 10
        const h = 60 + ((i * 37) % 160)
        return <rect key={i} x={x} y={320 - h} width={14} height={h} fill={accent} opacity={0.07 + (i % 3) * 0.02} />
      })}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 54} x2="400" y2={i * 54} stroke={accent} strokeOpacity="0.08" strokeWidth="1" />
      ))}
    </svg>
  )
}