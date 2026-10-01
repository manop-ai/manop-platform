'use client'
// app/page.tsx — Manop Homepage
//
// REBUILT per the "development intelligence, not a listings marketplace"
// direction. Removed entirely: neighbourhood/market yield cards, median
// prices, demand percentages, MAPE badge ladder (MAPE needs to be
// redefined for the new architecture before it earns a spot here again),
// and every Unicode/emoji icon. Standard UI icons are now lucide-react;
// MANOP's own claims (Reviewed) use ManopMark, not a generic checkmark.
//
// Structure follows the brief exactly:
// Hero (two real actions) → The problem → How MANOP works (5 steps) →
// For developers → For investors → For agents & landowners →
// Market Intelligence (honest, growing) → The Intelligence Layer
// (Sources→Data→Spatial Objects→Evidence→Intelligence→Decisions) → CTA.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../lib/theme'
import ManopLogo from '../components/ManopLogo'
import {
  Search, ArrowRight, MapPin, FileSearch, ClipboardCheck,
  Layers, Building2, Users, Landmark, Database, Network, LandPlot,
} from 'lucide-react'

// Rotating hero images, all your own Cloudinary assets — the slideshow
// from the earlier homepage, brought back. Swap any of these by
// replacing that named asset in Cloudinary, no code change needed.
const HERO_SLIDES = [
  'third_mainland_bridge_hsrqwb',
  'island_view_jb7cfx',
  'lagos-ikoyi_image_dtgde3',
  'lagos_ajah_image_maz1sc',
  'ghana_hero_image_splkla',
].map(id => `https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/${id}`)

function toSlug(q: string): string {
  return q.toLowerCase().trim()
}

export default function Home() {
  const [dark, setDark]       = useState(getInitialDark)
  const [query, setQuery]     = useState('')
  const [focused, setFocused] = useState(false)
  const [slide, setSlide]     = useState(0)
  const router   = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlide(s => (s + 1) % HERO_SLIDES.length), 6000)
    return () => clearInterval(id)
  }, [])

  const go = useCallback((q?: string) => {
    const val = (q || query).trim()
    if (!val) return
    router.push(`/developments?area=${encodeURIComponent(toSlug(val))}`)
  }, [query, router])

  // Theme tokens
  const bg     = dark ? '#08091A' : '#F4F6FB'
  const bg2    = dark ? '#0F1526' : '#FFFFFF'
  const bg3    = dark ? '#141D30' : '#F0F3FA'
  const text   = dark ? '#EEF0FF' : '#080D1E'
  const text2  = dark ? 'rgba(238,240,255,0.62)' : 'rgba(8,13,30,0.62)'
  const text3  = dark ? 'rgba(238,240,255,0.32)' : 'rgba(8,13,30,0.32)'
  const border = dark ? 'rgba(255,255,255,0.07)' : 'rgba(8,13,30,0.08)'
  const purple = '#5B2EFF'
  const teal   = '#14B8A6'

  const SP = 'clamp(4rem,8vw,6.5rem) clamp(1.25rem,4vw,2.5rem)'
  const CX = '980px'

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ─────────────────────────────────────────────────
          HERO — two real actions, one honest problem statement
      ───────────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '92vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {HERO_SLIDES.map((src, i) => (
          <div key={src} aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center',
            opacity: i === slide ? 0.48 : 0,
            transition: 'opacity 1.4s ease-in-out',
          }} />
        ))}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(160deg, rgba(5,7,22,0.82) 0%, rgba(5,7,22,0.62) 55%, rgba(5,7,22,0.85) 100%)' }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: CX, margin: '0 auto', width: '100%', padding: 'clamp(6rem,11vw,8rem) clamp(1.25rem,4vw,2.5rem) clamp(4rem,8vw,6rem)' }}>
          <div style={{ marginBottom: '2.25rem' }}>
            <ManopLogo height={88} dark={true} />
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 4, padding: '3px 10px', marginBottom: '1.75rem' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', color: '#F59E0B', textTransform: 'uppercase' }}>
              Private beta · Lagos, Nigeria
            </span>
          </div>

          <h1 style={{ fontSize: 'clamp(2.4rem,5.6vw,4.2rem)', fontWeight: 900, lineHeight: 1.04, letterSpacing: '-0.04em', color: '#FFFFFF', margin: '0 0 clamp(1rem,2vw,1.375rem)', maxWidth: 680 }}>
            Development intelligence,{' '}
            <span style={{ background: `linear-gradient(95deg,${purple} 0%,${teal} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              built on evidence.
            </span>
          </h1>

          <p style={{ fontSize: 'clamp(0.95rem,1.7vw,1.05rem)', color: 'rgba(238,240,255,0.68)', lineHeight: 1.7, maxWidth: 540, fontWeight: 300, margin: '0 0 clamp(2rem,4vw,2.75rem)' }}>
            Real estate development decisions are hard because the information needed to make
            them is fragmented — across documents, agencies, maps and individual knowledge.
            MANOP brings it together, structures it, and connects it to evidence.
          </p>

          {/* Two real actions */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
            <Link href="/developments" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: teal, color: '#04211D', padding: '0.9rem 1.6rem', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>
              Explore Reviewed Developments <ArrowRight size={16} />
            </Link>
            <Link href="/site-intelligence" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.06)', border: `1px solid ${purple}55`, color: '#fff', padding: '0.9rem 1.6rem', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>
              Explore Site Intelligence <ArrowRight size={16} />
            </Link>
          </div>

          {/* Intelligence search — not a "find a property" box */}
          <div style={{ maxWidth: 620 }}>
            <div style={{
              display: 'flex', background: 'rgba(6,9,26,0.85)',
              border: `1.5px solid ${focused ? purple : 'rgba(255,255,255,0.14)'}`,
              borderRadius: 13, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              transition: 'border-color 0.2s',
            }}>
              <span style={{ padding: '0 0.7rem 0 1.25rem', display: 'flex', alignItems: 'center', color: focused ? purple : 'rgba(148,163,184,0.55)' }}>
                <Search size={19} />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={e => e.key === 'Enter' && go()}
                placeholder="Search developments or areas — e.g. Lekki Phase 1"
                style={{ flex: 1, padding: '1.15rem 0.5rem', background: 'transparent', border: 'none', outline: 'none', fontSize: '1rem', color: '#EEF0FF', minWidth: 0 }}
              />
              <button onClick={() => go()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: purple, color: '#fff', border: 'none', padding: '0 1.9rem', borderRadius: '0 11px 11px 0', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}>
                Search <ArrowRight size={17} />
              </button>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(238,240,255,0.3)', marginTop: '0.6rem' }}>
              Developments and areas today — developers, sites, and other intelligence objects as they come online.
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          THE PROBLEM
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP, borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '1rem' }}>
            The problem
          </div>
          <div className="grid-problem" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '2.5rem', alignItems: 'start' }}>
            <h2 style={{ fontSize: 'clamp(1.5rem,2.8vw,2.1rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.25, margin: 0 }}>
              Development, land, planning and market information all live in different places —
              and rarely agree with each other.
            </h2>
            <p style={{ fontSize: '0.92rem', color: text2, lineHeight: 1.8, fontWeight: 300, margin: 0 }}>
              A developer chasing a site talks to five different sources and gets five partial
              answers. An investor reviewing a development has no structured way to see what's
              actually been checked. MANOP exists to bring these pieces together into one
              structured intelligence layer — with the evidence behind every claim, not just
              the claim itself.
            </p>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          HOW MANOP WORKS — 5 steps
      ───────────────────────────────────────────────── */}
      <section style={{ background: bg3, borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 'clamp(2.5rem,5vw,3.5rem)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: purple, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
              How MANOP works
            </div>
            <h2 style={{ fontSize: 'clamp(1.5rem,2.8vw,2.1rem)', fontWeight: 800, letterSpacing: '-0.035em', margin: 0 }}>
              Discover, understand, verify — before you decide.
            </h2>
          </div>

          <div className="grid-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[
              { icon: MapPin,         n: '01', title: 'Discover', body: 'Find developments, sites, and development opportunities.' },
              { icon: FileSearch,     n: '02', title: 'Understand', body: 'See the available location, development, planning and market information.' },
              { icon: ClipboardCheck, n: '03', title: 'Verify', body: 'Know what evidence exists, what MANOP reviewed, and what needs professional confirmation.' },
              { icon: Layers,         n: '04', title: 'Appraise', body: 'Connect site intelligence to construction appraisal and feasibility — coming online.' },
              { icon: Network,        n: '05', title: 'Decide', body: 'Better information for your own decision — never a recommendation from MANOP.' },
            ].map(s => (
              <div key={s.n} style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 12, padding: '1.375rem 1.125rem' }}>
                <s.icon size={18} color={purple} style={{ marginBottom: 14 }} />
                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: text3, letterSpacing: '0.06em', marginBottom: 6 }}>{s.n}</div>
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, margin: '0 0 0.4rem', letterSpacing: '-0.01em' }}>{s.title}</h3>
                <p style={{ fontSize: '0.73rem', color: text2, lineHeight: 1.6, margin: 0, fontWeight: 300 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          FOR DEVELOPERS / INVESTORS / AGENTS & LANDOWNERS
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div className="grid-personas" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>

            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '1.875rem 1.625rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              <Building2 size={22} color="#F59E0B" />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>For Developers</h3>
                <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.75, margin: 0, fontWeight: 300 }}>
                  Find better development opportunities. MANOP helps you discover sites,
                  understand their surrounding context, organize available evidence, and see
                  what needs investigating before you commit resources. Site Intelligence today —
                  construction appraisal and development feasibility next.
                </p>
              </div>
              <Link href="/developer/onboard" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#F59E0B', textDecoration: 'none', marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Open developer account <ArrowRight size={13} />
              </Link>
            </div>

            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '1.875rem 1.625rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              <Landmark size={22} color={purple} />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>For Investors</h3>
                <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.75, margin: 0, fontWeight: 300 }}>
                  Understand developments before making decisions. Explore reviewed developments,
                  see the available evidence, and use MANOP's intelligence to support your own
                  due diligence — never a guarantee of outcome, always a clearer starting point.
                </p>
              </div>
              <Link href="/developments" style={{ fontSize: '0.78rem', fontWeight: 600, color: purple, textDecoration: 'none', marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Browse reviewed developments <ArrowRight size={13} />
              </Link>
            </div>

            <div style={{ background: bg2, border: `1px solid ${border}`, borderRadius: 14, padding: '1.875rem 1.625rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' }}>
              <LandPlot size={22} color={teal} />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.5rem', letterSpacing: '-0.02em' }}>For Agents &amp; Landowners</h3>
                <p style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.75, margin: 0, fontWeight: 300 }}>
                  Turn a development opportunity into structured intelligence — not another
                  listing online. Bring the information and evidence behind a development or a
                  site under mandate, and it becomes part of MANOP's intelligence system.
                </p>
              </div>
              <Link href="/agency/onboard" style={{ fontSize: '0.78rem', fontWeight: 600, color: teal, textDecoration: 'none', marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Become a partner <ArrowRight size={13} />
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          MARKET INTELLIGENCE — honest, growing, no fake numbers
      ───────────────────────────────────────────────── */}
      <section style={{ background: bg3, borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div className="grid-market" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(2rem,5vw,4rem)', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: teal, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.875rem' }}>
                Market Intelligence
              </div>
              <h2 style={{ fontSize: 'clamp(1.5rem,2.8vw,2.1rem)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.2, marginBottom: '1.1rem' }}>
                MANOP doesn't pretend to know what it hasn't learned yet.
              </h2>
              <p style={{ fontSize: '0.88rem', color: text2, lineHeight: 1.8, fontWeight: 300 }}>
                Market intelligence isn't a dashboard we filled with numbers to look
                sophisticated — it's a layer that grows as MANOP accumulates real development
                data, site evidence, verified transactions, and activity. Where the data isn't
                there yet, we say so, instead of showing a score we can't defend.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {[
                { stage: 'Early stage',   desc: 'Limited data. Transparent about what is and isn\u2019t available yet.' },
                { stage: 'Growing stage', desc: 'More developments, sites, and verified evidence accumulate stronger signals.' },
                { stage: 'Mature stage',  desc: 'Enough historical and current data for real comparisons and trends.' },
              ].map((s, i) => (
                <div key={s.stage} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '1rem 1.125rem', background: bg2, border: `1px solid ${border}`, borderRadius: 10 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, color: i === 0 ? teal : text3, flexShrink: 0, width: 20 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 3, color: i === 0 ? teal : text }}>{s.stage}{i === 0 ? ' — where Lagos is today' : ''}</div>
                    <div style={{ fontSize: '0.75rem', color: text2, lineHeight: 1.55 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          THE MANOP INTELLIGENCE LAYER — architecture chain
      ───────────────────────────────────────────────── */}
      <section style={{ padding: SP }}>
        <div style={{ maxWidth: CX, margin: '0 auto' }}>
          <div style={{ textAlign: 'center' as const, marginBottom: 'clamp(2rem,4vw,3rem)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: purple, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginBottom: '0.6rem' }}>
              The MANOP Intelligence Layer
            </div>
            <h2 style={{ fontSize: 'clamp(1.4rem,2.6vw,1.9rem)', fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              From raw sources to a structured decision.
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' as const, gap: 6 }}>
            {[
              { icon: Database,       label: 'Sources' },
              { icon: FileSearch,     label: 'Data' },
              { icon: LandPlot,       label: 'Spatial Objects' },
              { icon: ClipboardCheck, label: 'Evidence' },
              { icon: Layers,         label: 'Intelligence' },
              { icon: Users,          label: 'Decisions' },
            ].map((step, i, arr) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, padding: '1rem 0.875rem', background: bg2, border: `1px solid ${border}`, borderRadius: 10, minWidth: 108 }}>
                  <step.icon size={17} color={i === arr.length - 1 ? teal : purple} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textAlign: 'center' as const }}>{step.label}</span>
                </div>
                {i < arr.length - 1 && <ArrowRight size={14} color={text3} style={{ flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────
          FINAL CTA
      ───────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${border}`, padding: SP }}>
        <div style={{ maxWidth: 620, margin: '0 auto', textAlign: 'center' as const }}>
          <h2 style={{ fontSize: 'clamp(1.6rem,3.2vw,2.3rem)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15, marginBottom: '1rem' }}>
            Explore MANOP.
          </h2>
          <p style={{ fontSize: '0.88rem', color: text2, lineHeight: 1.7, fontWeight: 300, marginBottom: '2rem' }}>
            Starting where we can build the evidence properly — Lagos first, expanding as the
            intelligence layer does.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' as const, flexWrap: 'wrap' as const }}>
            <Link href="/developments" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: teal, color: '#04211D', padding: '0.85rem 1.6rem', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>
              Reviewed Developments <ArrowRight size={15} />
            </Link>
            <Link href="/site-intelligence" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1px solid ${purple}55`, color: text, padding: '0.85rem 1.6rem', borderRadius: 10, fontSize: '0.88rem', fontWeight: 700, textDecoration: 'none' }}>
              Site Intelligence <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        * { box-sizing: border-box; }
        @media (max-width: 860px) {
          .grid-steps    { grid-template-columns: 1fr 1fr !important; }
          .grid-personas { grid-template-columns: 1fr !important; }
          .grid-problem  { grid-template-columns: 1fr !important; }
          .grid-market   { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .grid-steps { grid-template-columns: 1fr !important; }
        }
        button, a { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}