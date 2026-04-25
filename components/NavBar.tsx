'use client'
// components/NavBar.tsx — Manop (formerly Manop)
// Updated: correct brand name, agency onboard link, search link

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, setTheme, listenTheme } from '../lib/theme'

export default function NavBar() {
  const [dark,     setDark]     = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [mounted,  setMounted]  = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(getInitialDark())
    document.documentElement.setAttribute('data-theme', getInitialDark() ? 'dark' : 'light')
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    const unlisten = listenTheme(d => setDark(d))
    return () => { window.removeEventListener('scroll', onScroll); unlisten() }
  }, [])

  const toggle = () => { const n = !dark; setDark(n); setTheme(n) }

  const bg         = dark ? `rgba(15,23,42,${scrolled?'0.97':'0.90'})` : `rgba(248,250,252,${scrolled?'0.98':'0.93'})`
  const textColor  = dark ? '#F8FAFC' : '#0F172A'
  const textMuted  = dark ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.6)'
  const borderColor = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.08)'

  const navLink = { fontSize:'0.82rem', fontWeight:500, color:textMuted, padding:'0.4rem 0.875rem', borderRadius:8, textDecoration:'none', transition:'color 0.15s' }

  return (
    <nav style={{ position:'sticky', top:0, zIndex:200, background:bg, backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', borderBottom:`1px solid ${borderColor}`, padding:'0 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', height:64, transition:'background 0.3s' }}>

      {/* Brand */}
      <Link href="/" style={{ display:'flex', alignItems:'center', gap:'0.6rem', textDecoration:'none' }}>
        <div style={{ width:34, height:34, borderRadius:9, background:'#5B2EFF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', fontWeight:800, color:'#fff', letterSpacing:'-0.02em', flexShrink:0 }}>M</div>
        <div>
          <div style={{ fontSize:'1rem', fontWeight:700, color:textColor, letterSpacing:'-0.02em', lineHeight:1.1 }}>Manop</div>
          <div style={{ fontSize:'0.52rem', fontWeight:600, color:'#14B8A6', letterSpacing:'0.12em', textTransform:'uppercase' }}>Africa Intelligence</div>
        </div>
      </Link>

      {/* Nav links */}
      <div style={{ display:'flex', alignItems:'center', gap:'0.1rem' }}>
        <Link href="/search" style={navLink}>Properties</Link>
        <Link href="/compare" style={navLink}>Compare</Link>
        <Link href="/neighborhood/lekki-phase-1" style={navLink}>Markets</Link>
        <Link href="/agency/dashboard" style={navLink}>Agency</Link>

        {/* Dark mode toggle */}
        {mounted && (
          <button onClick={toggle} aria-label={dark?'Light mode':'Dark mode'} style={{ width:44, height:24, borderRadius:100, background:dark?'#5B2EFF':'#CBD5E1', border:'none', cursor:'pointer', position:'relative', transition:'background 0.25s', margin:'0 0.4rem', flexShrink:0 }}>
            <div style={{ position:'absolute', top:3, left:dark?23:3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.25s', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.62rem' }}>
              {dark ? '☀' : '☾'}
            </div>
          </button>
        )}

        {/* Partner CTA */}
        <Link href="/agency/onboard" style={{ background:'#5B2EFF', color:'#fff', padding:'0.42rem 1rem', borderRadius:8, fontSize:'0.8rem', fontWeight:600, textDecoration:'none', whiteSpace:'nowrap', transition:'background 0.15s' }}
          onMouseEnter={e=>(e.currentTarget.style.background='#7C5FFF')}
          onMouseLeave={e=>(e.currentTarget.style.background='#5B2EFF')}>
          Partner with us →
        </Link>
      </div>
    </nav>
  )
}
