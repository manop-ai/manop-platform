'use client'
// app/page.tsx — Manop Homepage
// ============================================================
// BUG FIX APPLIED: z-index + pointer-events fix for navbar click interception
//
// ROOT CAUSE: Hero section uses backdrop-filter on overlay divs.
// backdrop-filter creates a NEW stacking context in browsers — any z-index
// inside that context is isolated from the navbar. The slide background divs
// and gradient overlays had no pointerEvents: 'none', so they intercepted
// clicks on iOS Safari and slow-rendering mobile browsers, routing to /search
// instead of /register or /login.
//
// FIX APPLIED HERE:
//   1. All decorative/overlay divs now have pointerEvents: 'none'
//   2. Slide dots get zIndex: 6 (above overlays, below nav)
//   3. Hero content gets explicit zIndex: 5
//   4. NavBar file separately fixed to z-index 1000 (see components/NavBar.tsx)
// ============================================================
//
// Psychology flow (every section has one job):
// 1. Hero       → CLARITY + INTENT     "I understand. I want to search."
// 2. Trust strip → SAFETY              "This is real. I'm not wasting my time."
// 3. Value triad → POSSIBILITY         "I could actually use this."
// 4. Markets    → CURIOSITY            "Let me explore."
// 5. How it works → PROOF              "This actually works."
// 6. For whom   → IDENTITY             "This is for people like me."
// 7. CTA        → MOMENTUM             "One small step."

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../lib/theme'

// ─── Hero background slides ───────────────────────────────────────────────────
const SLIDES = [
  {
    url: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/third_mainland_bridge_hsrqwb',
    label: 'Lekki-Ikoyi, Lagos',
  },
  {
    url: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/island_view_jb7cfx',
    label: 'Victoria Island, Lagos',
  },
  {
    url: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/ghana_hero_image_splkla',
    label: 'East Legon, Accra',
  },
  {
    url: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/nairobi_hero_image_dpvlaw',
    label: 'Nairobi, Kenya',
  },
]

// ─── Market cards ─────────────────────────────────────────────────────────────
const MARKETS = [
  { name: 'Lekki Phase 1', city: 'Lagos',   flag: '🇳🇬', slug: 'lekki-phase-1',  live: true,  yield: '7.4%', median: '₦285M',  img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/third_mainland_bridge_hsrqwb' },
  { name: 'Ikoyi',          city: 'Lagos',   flag: '🇳🇬', slug: 'ikoyi',           live: true,  yield: '5.5%', median: '₦600M+', img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/lagos-ikoyi_image_dtgde3' },
  { name: 'Victoria Island', city: 'Lagos',  flag: '🇳🇬', slug: 'victoria-island', live: true,  yield: '5.6%', median: '₦500M',  img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/island_view_jb7cfx' },
  { name: 'Ajah',            city: 'Lagos',  flag: '🇳🇬', slug: 'ajah',            live: true,  yield: '6.7%', median: '₦120M',  img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/lagos_ajah_image_maz1sc' },
  { name: 'East Legon',      city: 'Accra',  flag: '🇬🇭', slug: 'east-legon',      live: false, yield: '—',    median: '—',      img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/ghana_hero_image_splkla' },
  { name: 'Westlands',       city: 'Nairobi',flag: '🇰🇪', slug: 'westlands',       live: false, yield: '—',    median: '—',      img: 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/nairobi_hero_image_dpvlaw' },
]

// ─── Slug resolver ────────────────────────────────────────────────────────────
function toSlug(q: string): string {
  const map: Record<string, string> = {
    'lekki phase 1': 'lekki-phase-1', 'lekki': 'lekki', 'ikoyi': 'ikoyi',
    'victoria island': 'victoria-island', 'vi': 'victoria-island',
    'ajah': 'ajah', 'east legon': 'east-legon', 'westlands': 'westlands',
    'karen': 'karen', 'kilimani': 'kilimani', 'maitama': 'maitama',
    'asokoro': 'asokoro', 'eko atlantic': 'eko-atlantic',
    'gbagada': 'gbagada', 'surulere': 'surulere', 'ikeja': 'ikeja',
  }
  const s = q.toLowerCase().trim()
  for (const [k, v] of Object.entries(map)) { if (s.includes(k)) return v }
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Home() {
  const [dark, setDark]       = useState(true)
  const [slide, setSlide]     = useState(0)
  const [query, setQuery]     = useState('')
  const [focused, setFocused] = useState(false)
  const [ph, setPh]           = useState('')
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlide(i => (i + 1) % SLIDES.length), 7000)
    return () => clearInterval(id)
  }, [])

  // Gentle typewriter placeholder
  useEffect(() => {
    const words = ['Lekki Phase 1', 'Ikoyi', 'East Legon', 'Westlands', 'Victoria Island']
    let wi = 0, ci = 0, dir = 1, hold = 0
    const id = setInterval(() => {
      if (hold-- > 0) return
      const w = words[wi]
      ci += dir
      setPh(w.slice(0, Math.max(0, ci)))
      if (dir === 1 && ci >= w.length)  { dir = -1; hold = 35 }
      if (dir === -1 && ci <= 0)        { dir =  1; wi = (wi + 1) % words.length; hold = 10 }
    }, 70)
    return () => clearInterval(id)
  }, [])

  const go = useCallback((q?: string) => {
    const val = q || query
    if (!val.trim()) { router.push('/search'); return }
    router.push(`/neighborhood/${toSlug(val)}`)
  }, [query, router])

  // Theme tokens
  const bg     = dark ? '#08091A' : '#F4F6FB'
  const bg2    = dark ? '#0F1526' : '#FFFFFF'
  const bg3    = dark ? '#141D30' : '#F0F3FA'
  const text   = dark ? '#EEF0FF' : '#080D1E'
  const text2  = dark ? 'rgba(238,240,255,0.62)' : 'rgba(8,13,30,0.62)'
  const text3  = dark ? 'rgba(238,240,255,0.32)' : 'rgba(8,13,30,0.32)'
  const border = dark ? 'rgba(255,255,255,0.07)' : 'rgba(8,13,30,0.08)'

  const SP = 'clamp(4rem,8vw,6.5rem) clamp(1.25rem,4vw,2.5rem)'
  const CX = '1080px'

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ─────────────────────────────────────────────────
          1. HERO — Clarity + Intent
      ───────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* Photography background slides
            FIX: pointerEvents: 'none' on ALL decorative layers.
            Without this, these full-screen absolute divs intercept clicks
            targeting the navbar (Register/Login) on iOS Safari. */}
        {SLIDES.map((s, i) => (
          <div
            key={s.url}
            aria-hidden
            style={{
              position: 'absolute', inset: 0,
              pointerEvents: 'none', // ← FIX: was missing, intercepted navbar clicks
              backgroundImage: `url(${s.url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              opacity: i === slide ? 1 : 0,
              transition: 'opacity 2s ease',
            }}
          />
        ))}

        {/* Dark overlay — FIX: pointerEvents: 'none' */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            pointerEvents: 'none', // ← FIX: was missing
            background: 'linear-gradient(135deg, rgba(5,7,22,0.93) 0%, rgba(5,7,22,0.78) 45%, rgba(5,7,22,0.86) 100%)',
          }}
        />

        {/* Purple warmth glow — FIX: pointerEvents: 'none' */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            pointerEvents: 'none', // ← FIX: was missing
            background: 'radial-gradient(ellipse 60% 55% at 10% 55%, rgba(91,46,255,0.14) 0%, transparent 65%)',
          }}
        />

        {/* Hero content — sits above overlays, below navbar */}
        <div style={{
          position: 'relative',
          zIndex: 5,
          maxWidth: CX, margin: '0 auto', width: '100%',
          padding: 'clamp(6rem,11vw,9rem) clamp(1.25rem,4vw,2.5rem) clamp(5rem,9vw,7rem)',
        }}>

          {/* Beta label */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 4, padding: '3px 10px', marginBottom: '2rem' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', display: 'inline-block', animation: 'dot 2.4s ease-in-out infinite' }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: '#F59E0B', textTransform: 'uppercase' }}>
              Private beta · Nigeria · Ghana · Kenya
            </span>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: 'clamp(2.8rem,6.5vw,5.2rem)', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-0.045em', color: '#FFFFFF', margin: '0 0 clamp(1rem,2vw,1.5rem)', maxWidth: 720 }}>
            Property decisions,{' '}
            <span style={{ background: 'linear-gradient(95deg,#5B2EFF 0%,#14B8A6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              backed by data.
            </span>
          </h1>

          {/* Subhead */}
          <p style={{ fontSize: 'clamp(1rem,2vw,1.15rem)', color: 'rgba(238,240,255,0.72)', lineHeight: 1.65, maxWidth: 480, fontWeight: 300, margin: '0 0 clamp(2rem,4vw,3rem)' }}>
            Search any African neighborhood. See verified market data, agency trust scores, and yield analysis — before you make any move.
          </p>

          {/* Search bar */}
          <div style={{ maxWidth: 560 }}>
            <div style={{
              display: 'flex',
              background: 'rgba(6,9,26,0.88)',
              border: `1.5px solid ${focused ? '#5B2EFF' : 'rgba(255,255,255,0.14)'}`,
              borderRadius: 11,
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
              boxShadow: focused ? '0 0 0 4px rgba(91,46,255,0.16), 0 24px 56px rgba(0,0,0,0.4)' : '0 24px 56px rgba(0,0,0,0.35)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}>
              <span style={{ padding: '0 0.75rem 0 1.1rem', display: 'flex', alignItems: 'center', color: focused ? '#5B2EFF' : 'rgba(148,163,184,0.55)', fontSize: '1.1rem', flexShrink: 0, transition: 'color 0.2s' }}>⌕</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={e => e.key === 'Enter' && go()}
                placeholder={ph ? `Try ${ph}…` : 'Search a neighborhood or city…'}
                style={{ flex: 1, padding: '0.95rem 0.5rem', background: 'transparent', border: 'none', outline: 'none', fontSize: '0.92rem', color: '#EEF0FF', minWidth: 0 }}
              />
              <button
                onClick={() => go()}
                style={{ background: '#5B2EFF', color: '#fff', border: 'none', padding: '0 1.5rem', borderRadius: '0 9px 9px 0', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#6E44FF')}
                onMouseLeave={e => (e.currentTarget.style.background = '#5B2EFF')}
              >
                Search →
              </button>
            </div>

            {/* Quick links */}
            <div style={{ display: 'flex', gap: 8, marginTop: '0.875rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.65rem', color: 'rgba(238,240,255,0.3)', letterSpacing: '0.04em' }}>Popular:</span>
              {['Lekki Phase 1', 'Ikoyi', 'Ajah', 'East Legon'].map(n => (
                <button
                  key={n}
                  onClick={() => go(n)}
                  style={{ padding: '0.2rem 0.65rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100, fontSize: '0.68rem', color: 'rgba(238,240,255,0.6)', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(91,46,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(91,46,255,0.4)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(238,240,255,0.6)' }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Slide city label */}
          <div style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#14B8A6', flexShrink: 0 }} />
            <span style={{ fontSize: '0.65rem', color: 'rgba(238,240,255,0.45)', letterSpacing: '0.04em' }}>{SLIDES[slide].label}</span>
          </div>
        </div>

        {/* Slide dots — FIX: explicit zIndex: 6 so they sit above overlays */}
        <div style={{ position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 6, pointerEvents: 'auto' }}>
          {SLIDES.map((_, i) => (
            <div
              key={i}
              onClick={() => setSlide(i)}
              style={{ width: i === slide ? 22 : 6, height: 6, borderRadius: 3, background: i === slide ? '#5B2EFF' : 'rgba(255,255,255,0.22)', cursor: 'pointer', transition: 'all 0.3s' }}
            />
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          2. TRUST STRIP — Safety
      ───────────────────────────────────────────────── */}
      <div style={{ background: dark ? 'rgba(15,21,38,0.97)' : bg2, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
        <div style={{ maxWidth: CX, margin: '0 auto', padding: '0 clamp(1.25rem,4vw,2.5rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0 }}>
          {[
            { icon: '✓', text: 'Verified listings' },
            { icon: '◎', text: 'Yield analysis' },
            { icon: '◈', text: 'Agency trust scores' },
            { icon: '△', text: 'Market benchmarks' },
            { icon: '◉', text: 'Nigeria · Ghana · Kenya' },
          ].map((s, i, arr) => (
            <div key={s.text} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '1rem clamp(1rem,2.5vw,1.75rem)', borderRight: i < arr.length - 1 ? `1px solid ${border}` : 'none' }}>
              <span style={{ fontSize: '0.72rem', color: '#14B8A6', fontWeight: 700 }}>{s.icon}</span>
              <span style={{ fontSize: '0.75rem', color: text2, fontWeight: 500, whiteSpace: 'nowrap' }}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────
          3. VALUE TRIAD — Possibility
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem,5vw,4rem)' }}>
            <h2 style={{ fontSize: 'clamp(1.7rem,3.2vw,2.5rem)', fontWeight: 800, color: text, letterSpacing: '-0.04em', lineHeight: 1.12, maxWidth: 540, margin: '0 auto' }}>
              Make smarter decisions.<br />From anywhere.
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
            {[
              {
                icon: '◎', color: '#5B2EFF',
                title: 'Understand fair prices',
                body: 'See what properties in each neighborhood actually trade for — not just what sellers are asking. Median prices, bedroom breakdowns, and market context.',
                link: '/markets', linkText: 'Browse markets',
              },
              {
                icon: '✓', color: '#14B8A6',
                title: 'Work with verified agencies',
                body: 'Every agency on Manop earns a trust score through real activity — listings, response time, and closed deals. You see the score before you contact anyone.',
                link: '/search', linkText: 'Search properties',
              },
              {
                icon: '△', color: '#22C55E',
                title: 'Decide with confidence',
                body: 'Yield, cap rate, price versus market median, and a plain-language verdict. Buy, negotiate, or watch — with the numbers behind every recommendation.',
                link: '/calculator', linkText: 'Try the calculator',
              },
            ].map(b => (
              <div key={b.title} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '1.875rem 1.625rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <span style={{ fontSize: '1.4rem', color: b.color }}>{b.icon}</span>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: text, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>{b.title}</h3>
                  <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.7, margin: 0, fontWeight: 300 }}>{b.body}</p>
                </div>
                <Link href={b.link} style={{ fontSize: '0.78rem', fontWeight: 600, color: b.color, textDecoration: 'none', marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {b.linkText} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          4. MARKETS — Curiosity + Exploration
      ───────────────────────────────────────────────── */}
      <section style={{ background: bg3, borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'clamp(1.5rem,3vw,2.5rem)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>Neighborhoods</p>
              <h2 style={{ fontSize: 'clamp(1.5rem,2.8vw,2rem)', fontWeight: 800, color: text, letterSpacing: '-0.04em', margin: 0 }}>Explore by market.</h2>
            </div>
            <Link href="/markets" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#14B8A6', textDecoration: 'none' }}>
              View all markets →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem' }}>
            {MARKETS.map(m => (
              <div
                key={m.slug}
                onClick={() => m.live && router.push(`/neighborhood/${m.slug}`)}
                style={{ height: 200, borderRadius: 12, overflow: 'hidden', position: 'relative', cursor: m.live ? 'pointer' : 'default', opacity: m.live ? 1 : 0.5, border: `1px solid ${border}`, transition: 'transform 0.18s, border-color 0.18s' }}
                onMouseEnter={e => { if (m.live) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(91,46,255,0.5)' } }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = border }}
              >
                <img src={m.img} alt={m.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

                {/* FIX: pointerEvents: 'none' on all inner overlay divs */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,6,22,0.94) 0%, rgba(4,6,22,0.1) 60%, transparent 100%)', pointerEvents: 'none' }} />

                <span style={{ position: 'absolute', top: 10, left: 11, fontSize: '1rem', pointerEvents: 'none' }}>{m.flag}</span>

                {m.live
                  ? <span style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em', background: 'rgba(20,184,166,0.88)', color: '#fff', borderRadius: 6, padding: '2px 7px', pointerEvents: 'none' }}>● LIVE</span>
                  : <span style={{ position: 'absolute', top: 10, right: 10, fontSize: '0.5rem', fontWeight: 600, background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '2px 7px', pointerEvents: 'none' }}>COMING</span>
                }

                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0.75rem 0.875rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', pointerEvents: 'none' }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{m.name}</div>
                    <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{m.city}</div>
                  </div>
                  {m.live && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#22C55E' }}>{m.yield}</div>
                      <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>{m.median}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          5. HOW IT WORKS — Proof
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem,5vw,4rem)' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.625rem' }}>How it works</p>
            <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 800, color: text, letterSpacing: '-0.04em', margin: 0 }}>
              Three steps from search to decision.
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', position: 'relative' }}>
            {/* Connector lines */}
            <div style={{ position: 'absolute', top: 36, left: '33.3%', right: '33.3%', height: 1, background: `linear-gradient(90deg, ${border}, ${border})`, pointerEvents: 'none' }} />

            {[
              { n: '01', title: 'Search any neighborhood', body: 'Type a neighborhood or city. Manop returns listings with market context, not just photos and prices.' },
              { n: '02', title: 'See what the market says', body: 'Median price, yield, price versus comparable sales, and an agency trust score — on every listing.' },
              { n: '03', title: 'Decide with a clear verdict', body: 'Manop gives you a plain recommendation: Buy, Negotiate, Watch, or Wait — with the reasoning behind it.' },
            ].map(s => (
              <div key={s.n} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '2rem 1.625rem', position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(91,46,255,0.12)', border: '1px solid rgba(91,46,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#5B2EFF', letterSpacing: '0.04em' }}>{s.n}</span>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: text, margin: '0 0 0.5rem', letterSpacing: '-0.02em', lineHeight: 1.3 }}>{s.title}</h3>
                <p style={{ fontSize: '0.8rem', color: text2, lineHeight: 1.7, margin: 0, fontWeight: 300 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
       
      {/* ── MAPE — one clean idea ── */}
      <section style={{ background: bg3, borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
      
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(2rem,5vw,5rem)', alignItems: 'center' }}>
      
            {/* Left — the message */}
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#5B2EFF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '1rem' }}>
                For agencies &amp; developers
              </div>
              <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)', fontWeight: 800, letterSpacing: '-0.045em', color: text, lineHeight: 1.1, marginBottom: '1rem' }}>
                Your rank is earned.<br />Not bought.
              </h2>
              <p style={{ fontSize: '0.9rem', color: text2, lineHeight: 1.75, fontWeight: 300, marginBottom: '1.75rem', maxWidth: 400 }}>
                Every agency on Manop carries a badge — Listed, Verified, Trust, or Elite.
                It reflects how you work: your listing quality, how fast you respond,
                the deals you close, and the market data you contribute.
                Buyers see it before they call you.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                <Link href="/agency/onboard" style={{ background: '#5B2EFF', color: '#fff', padding: '0.7rem 1.5rem', borderRadius: 9, fontSize: '0.85rem', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                  Set up your agency →
                </Link>
                <Link href="/developer/onboard" style={{ background: 'transparent', color: text2, border: `1px solid ${border}`, padding: '0.7rem 1.5rem', borderRadius: 9, fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                  Developer? Start here
                </Link>
              </div>
            </div>
      
            {/* Right — badge ladder only */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {[
                { icon: '○', badge: 'Listed',   color: '#94A3B8', desc: 'You\'re on the platform. Build from here.'           },
                { icon: '◇', badge: 'Verified', color: '#60A5FA', desc: 'Docs confirmed. Listings approved. Buyers trust you.' },
                { icon: '◈', badge: 'Trust',    color: '#14B8A6', desc: 'Consistent performance. Strong conversion record.'    },
                { icon: '◆', badge: 'Elite',    color: '#F59E0B', desc: 'Verified market data submitted. The highest tier.'    },
              ].map((b, i) => (
                <div key={b.badge} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '0.875rem 1.1rem',
                  background: bg2,
                  border: `1px solid ${i === 3 ? b.color + '35' : border}`,
                  borderRadius: 11,
                  transition: 'border-color 0.2s',
                }}>
                  <span style={{ fontSize: '1.2rem', color: b.color, flexShrink: 0, width: 24, textAlign: 'center' as const }}>
                    {b.icon}
                  </span>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: b.color, marginBottom: '0.15rem' }}>
                      {b.badge}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: text2, lineHeight: 1.5 }}>
                      {b.desc}
                    </div>
                  </div>
                </div>
              ))}
              <p style={{ fontSize: '0.68rem', color: text3, textAlign: 'center' as const, marginTop: '0.25rem', lineHeight: 1.6 }}>
                Badges are computed weekly from your activity, performance, and market data contributions.
              </p>
            </div>
      
          </div>
        </div>
      </section>
      

      {/* ─────────────────────────────────────────────────
          6. FOR WHOM — Identity
      ───────────────────────────────────────────────── */}
      <section style={{ background: bg3, borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem,5vw,4rem)' }}>
            <h2 style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)', fontWeight: 800, color: text, letterSpacing: '-0.04em', margin: 0 }}>
              Built for every participant.
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {[
              { icon: '💼', role: 'Local buyer',       color: '#5B2EFF', headline: "Know what's a fair price before you make an offer.", desc: 'Search any Lagos neighborhood and see median sold prices, yield data, and a plain verdict on whether the listing is priced fairly.', cta: 'Search properties', href: '/search' },
              { icon: '🌍', role: 'Diaspora investor', color: '#14B8A6', headline: 'Invest from abroad with the same confidence as a local.', desc: 'Every listing shows USD pricing at the live exchange rate, plus a 10-year return model that accounts for naira depreciation.', cta: 'Explore Lekki Phase 1', href: '/neighborhood/lekki-phase-1' },
              { icon: '🏢', role: 'Agency',            color: '#22C55E', headline: 'Reach buyers who already understand the numbers.', desc: 'Manop buyers arrive informed. Your listings get a trust score. As you close deals and build your record, your score improves.', cta: 'Become a partner', href: '/agency/onboard' },
              { icon: '🏗️', role: 'Developer',        color: '#F59E0B', headline: 'Manage your project pipeline in one place.', desc: 'Unit tracker, sales pipeline, payment plans, and project analytics — built for developers who want to close faster.', cta: 'Open developer account', href: '/developer/onboard' },
            ].map(u => (
              <div key={u.role} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '1.875rem 1.625rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.3rem' }}>{u.icon}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: u.color, background: `${u.color}12`, border: `1px solid ${u.color}28`, borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {u.role}
                  </span>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: text, margin: 0, lineHeight: 1.35, letterSpacing: '-0.02em' }}>{u.headline}</h3>
                <p style={{ fontSize: '0.8rem', color: text2, margin: 0, lineHeight: 1.7, fontWeight: 300 }}>{u.desc}</p>
                <Link
                  href={u.href}
                  style={{ fontSize: '0.75rem', fontWeight: 700, color: u.color, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 'auto', padding: '0.5rem 0.875rem', background: `${u.color}10`, border: `1px solid ${u.color}25`, borderRadius: 7, width: 'fit-content', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${u.color}20` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${u.color}10` }}
                >
                  {u.cta} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          7. CTA — Momentum
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP }}>
        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', fontWeight: 800, color: text, letterSpacing: '-0.045em', lineHeight: 1.1, marginBottom: '1rem' }}>
            Start with one search.
          </h2>
          <p style={{ fontSize: '0.92rem', color: text2, lineHeight: 1.65, fontWeight: 300, marginBottom: '2rem' }}>
            Type a neighborhood. See what the market actually says. No account required to start.
          </p>
          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                inputRef.current?.scrollIntoView({ behavior: 'smooth' })
                setTimeout(() => inputRef.current?.focus(), 600)
              }}
              style={{ background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '0.875rem 2rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.01em', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6E44FF')}
              onMouseLeave={e => (e.currentTarget.style.background = '#5B2EFF')}
            >
              Search a market →
            </button>
            <Link
              href="/register"
              style={{ background: 'transparent', color: text2, border: `1px solid ${border}`, borderRadius: 10, padding: '0.875rem 2rem', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none', transition: 'border-color 0.15s, color 0.15s', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(91,46,255,0.4)'; e.currentTarget.style.color = text }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = text2 }}
            >
              Join beta
            </Link>
            <Link
              href="/agency/onboard"
              style={{ background: 'transparent', color: text3, border: 'none', padding: '0.875rem 1rem', fontSize: '0.85rem', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Partner with us →
            </Link>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          FOOTER
      ───────────────────────────────────────────────── */}
      <footer style={{ background: dark ? '#050710' : '#0A0F1E', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: CX, margin: '0 auto', padding: 'clamp(2rem,4vw,3.5rem) clamp(1.25rem,4vw,2.5rem)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>

            {/* Brand column */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.875rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '0.85rem' }}>M</div>
                <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.92rem', letterSpacing: '-0.02em' }}>Manop</span>
                <span style={{ fontSize: '0.44rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.28)', color: '#F59E0B', borderRadius: 3, padding: '1px 5px' }}>BETA</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.65, margin: '0 0 0.75rem', maxWidth: 200 }}>
                Property decisions, backed by data. Nigeria, Ghana, Kenya.
              </p>
              <p style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.18)' }}>Not financial advice.</p>
            </div>

            {/* Footer link columns */}
            {[
              { title: 'Platform', links: [{ l: 'Properties', h: '/search' }, { l: 'Markets', h: '/markets' }, { l: 'Calculator', h: '/calculator' }, { l: 'Compare', h: '/compare' }] },
              { title: 'Account', links: [{ l: 'Register', h: '/register' }, { l: 'Login', h: '/login' }, { l: 'Agency partner', h: '/agency/onboard' }, { l: 'Developer', h: '/developer/onboard' }] },
              { title: 'Markets', links: [{ l: 'Lekki Phase 1', h: '/neighborhood/lekki-phase-1' }, { l: 'Ikoyi', h: '/neighborhood/ikoyi' }, { l: 'Victoria Island', h: '/neighborhood/victoria-island' }, { l: 'East Legon', h: '/neighborhood/east-legon' }] },
            ].map(col => (
              <div key={col.title}>
                <p style={{ fontSize: '0.58rem', fontWeight: 700, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 0.875rem' }}>{col.title}</p>
                {col.links.map(l => (
                  <Link
                    key={l.h}
                    href={l.h}
                    style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.38)', textDecoration: 'none', marginBottom: '0.4rem' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.38)')}
                  >
                    {l.l}
                  </Link>
                ))}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.18)' }}>© 2025 Manop.</span>
            <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.18)' }}>support@manopintel.com</span>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes dot { 0%,100%{opacity:1} 50%{opacity:0.35} }
        * { box-sizing: border-box; }

        /* ── Responsive breakpoints ── */
        @media (max-width: 860px) {
          div[style*="gridTemplateColumns: repeat(3, 1fr)"],
          div[style*="grid-template-columns: repeat(3, 1fr)"] { grid-template-columns: 1fr 1fr !important; }
          div[style*="gridTemplateColumns: 1.4fr 1fr 1fr 1fr"],
          div[style*="grid-template-columns: 1.4fr 1fr 1fr 1fr"] { grid-template-columns: 1fr 1fr !important; }
          div[style*="gridTemplateColumns: repeat(2, 1fr)"],
          div[style*="grid-template-columns: repeat(2, 1fr)"] { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 580px) {
          div[style*="gridTemplateColumns: repeat(3, 1fr)"],
          div[style*="grid-template-columns: repeat(3, 1fr)"] { grid-template-columns: 1fr !important; }
          div[style*="gridTemplateColumns: repeat(2, 1fr)"],
          div[style*="grid-template-columns: repeat(2, 1fr)"] { grid-template-columns: 1fr !important; }
          div[style*="justify-content: center"] { flex-direction: column !important; align-items: stretch !important; }
        }

        /* ── Prevent iOS tap highlight on buttons ── */
        button, a { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}