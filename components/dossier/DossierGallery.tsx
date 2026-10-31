'use client'
// components/dossier/DossierGallery.tsx — the dossier's picture area: a mosaic on desktop, a swipe carousel on phones, and a full-screen
// viewer (arrow keys, Esc, thumbnail strip) for everything. Images and videos both work. Replaces the single cropped hero image.
import { useCallback, useEffect, useRef, useState } from 'react'

export interface GalleryItem { url: string; type: 'image' | 'video' }

// Cloudinary URLs get automatic format/quality and a width cap so large originals do not stall a phone. Anything else is used as-is.
function sized(url: string, w: number): string {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/)
  return m ? `${m[1]}f_auto,q_auto,w_${w}/${m[2]}` : url
}

function Thumb({ it, w, alt }: { it: GalleryItem; w: number; alt: string }) {
  return it.type === 'video'
    ? <video src={it.url} muted playsInline preload="metadata" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={sized(it.url, w)} alt={alt} loading="lazy" />
}

export default function DossierGallery({ media, alt }: { media: GalleryItem[]; alt: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [slide, setSlide] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const n = media.length

  const close = useCallback(() => setOpen(null), [])
  const step = useCallback((d: number) => setOpen(i => (i === null ? i : (i + d + n) % n)), [n])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, close, step])

  if (n === 0) {
    return <div className="dx-gal-empty">Photos and videos for this development have not been provided yet.</div>
  }

  const grid = media.slice(0, 5)
  const cls = n === 1 ? 'n1' : n === 2 ? 'n2' : n < 5 ? 'n3' : ''

  return (
    <div className="dx-gal">
      {/* phones: swipe carousel */}
      <div className="dx-gal-scroll" ref={scroller}
        onScroll={e => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))) }}>
        {media.map((it, i) => (
          <button key={i} className="dx-gal-slide" onClick={() => setOpen(i)} aria-label={`Open picture ${i + 1} of ${n}`}>
            <Thumb it={it} w={1000} alt={`${alt} — ${i + 1}`} />
          </button>
        ))}
      </div>
      {n > 1 && <div className="dx-gal-count">{slide + 1} / {n}</div>}

      {/* desktop: mosaic */}
      <div className={`dx-gal-grid ${cls}`}>
        {grid.map((it, i) => (
          <button key={i} onClick={() => setOpen(i)} aria-label={`Open picture ${i + 1} of ${n}`}>
            <Thumb it={it} w={i === 0 ? 1400 : 700} alt={`${alt} — ${i + 1}`} />
          </button>
        ))}
      </div>
      {n > 1 && <button className="dx-gal-all" onClick={() => setOpen(0)}>View all {n}</button>}

      {open !== null && (
        <div className="dx-lb" role="dialog" aria-modal="true" aria-label={`${alt} gallery`}>
          <div className="dx-lb-top"><span>{open + 1} / {n}</span><button className="dx-lb-x" onClick={close} aria-label="Close gallery">×</button></div>
          <div className="dx-lb-stage" onClick={close}>
            {n > 1 && <button className="dx-lb-nav dx-lb-prev" onClick={e => { e.stopPropagation(); step(-1) }} aria-label="Previous">‹</button>}
            <div onClick={e => e.stopPropagation()} style={{ display: 'contents' }}>
              {media[open].type === 'video'
                ? <video key={open} src={media[open].url} controls autoPlay playsInline />
                // eslint-disable-next-line @next/next/no-img-element
                : <img key={open} src={sized(media[open].url, 2000)} alt={`${alt} — ${open + 1}`} />}
            </div>
            {n > 1 && <button className="dx-lb-nav dx-lb-next" onClick={e => { e.stopPropagation(); step(1) }} aria-label="Next">›</button>}
          </div>
          {n > 1 && (
            <div className="dx-lb-strip">
              {media.map((it, i) => (
                <button key={i} aria-current={i === open} onClick={() => setOpen(i)} aria-label={`Go to picture ${i + 1}`}>
                  <Thumb it={it} w={160} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
