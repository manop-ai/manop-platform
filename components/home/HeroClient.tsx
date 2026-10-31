'use client'
// components/home/HeroClient.tsx — the two interactive parts of the home hero: the slow background slideshow and the area search.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight } from 'lucide-react'

export function HeroSlides({ images }: { images: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (images.length < 2) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI(x => (x + 1) % images.length), 7000)
    return () => clearInterval(t)
  }, [images.length])
  return (
    <div className="hm-slides" aria-hidden="true">
      {images.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" className={n === i ? 'on' : ''} loading={n === 0 ? 'eager' : 'lazy'} />
      ))}
    </div>
  )
}

export function HeroSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const go = () => { const v = q.trim().toLowerCase(); if (v) router.push(`/developments?area=${encodeURIComponent(v)}`) }
  return (
    <div>
      <div className="hm-search" role="search">
        <Search size={18} style={{ margin: '0 0 0 16px', alignSelf: 'center', color: 'rgba(255,255,255,.55)' }} aria-hidden="true" />
        <input type="text" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()}
          placeholder="Search a development or area — e.g. Lekki Phase 1" aria-label="Search developments or areas" />
        <button onClick={go}>Search <ArrowRight size={15} style={{ verticalAlign: '-2px' }} /></button>
      </div>
      <div className="hm-search-note">MANOP is a growing intelligence platform that connects real estate opportunities with the information and context needed to understand them. Search currently covers reviewed developments and areas.</div>
    </div>
  )
}