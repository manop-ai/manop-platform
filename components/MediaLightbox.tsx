'use client'
// components/MediaLightbox.tsx
//
// Shows one large image/video in its frame (matching the "big picture"
// rule everywhere else), and clicking it expands to a fullscreen viewer
// with next/prev through the rest of the media. Handles images and
// videos in the same gallery — a video renders as a <video> element,
// an image as an <img>, both clickable the same way.

import { useState } from 'react'
import { getDesignColors, designTokens } from '../lib/theme'

export interface MediaItem {
  url: string
  type: 'image' | 'video'
}

interface Props {
  dark: boolean
  media: MediaItem[]
  alt: string
  height?: number
}

export default function MediaLightbox({ dark, media, alt, height = 320 }: Props) {
  const c = getDesignColors(dark)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  const first = media[0]

  return (
    <>
      {/* ── Frame — the big-picture rule ─────────────────────────── */}
      <div
        onClick={() => first && setExpandedIndex(0)}
        style={{
          position: 'relative', height, borderRadius: designTokens.radius.sm, overflow: 'hidden',
          background: c.surfaceCardHigh, cursor: first ? 'zoom-in' : 'default',
        }}
      >
        {!first && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textFaint, fontSize: 13 }}>
            No images or videos provided yet
          </div>
        )}
        {first?.type === 'image' && (
          <img src={first.url} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}
        {first?.type === 'video' && (
          <video src={first.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
        )}
        {media.length > 1 && (
          <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>
            +{media.length - 1} more · click to expand
          </div>
        )}
      </div>

      {/* ── Fullscreen expanded viewer ────────────────────────────── */}
      {expandedIndex !== null && (
        <div
          onClick={() => setExpandedIndex(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); setExpandedIndex(null) }}
            style={{ position: 'absolute', top: 20, right: 24, background: 'transparent', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer' }}
          >
            ✕
          </button>

          {media.length > 1 && expandedIndex > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setExpandedIndex(i => (i! - 1 + media.length) % media.length) }}
              style={{ position: 'absolute', left: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 22, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer' }}
            >
              ‹
            </button>
          )}

          <div style={{ maxWidth: '90vw', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            {media[expandedIndex].type === 'image' ? (
              <img src={media[expandedIndex].url} alt={alt} style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', display: 'block' }} />
            ) : (
              <video src={media[expandedIndex].url} style={{ maxWidth: '90vw', maxHeight: '85vh' }} controls autoPlay />
            )}
          </div>

          {media.length > 1 && expandedIndex < media.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setExpandedIndex(i => (i! + 1) % media.length) }}
              style={{ position: 'absolute', right: 20, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 22, borderRadius: '50%', width: 44, height: 44, cursor: 'pointer' }}
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  )
}