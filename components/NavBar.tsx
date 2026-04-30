'use client'
// components/NavBar.tsx — Manop (with Calculator link + mobile hamburger)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, setTheme, listenTheme } from '../lib/theme'

export default function NavBar() {
  const [dark,     setDark]     = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [mounted,  setMounted]  = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  const bg          = dark ? `rgba(15,23,42,${scrolled ? '0.97' : '0.90'})` : `rgba(248,250,252,${scrolled ? '0.98' : '0.93'})`
  const textColor   = dark ? '#F8FAFC' : '#0F172A'
  const textMuted   = dark ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.6)'
  const borderColor = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.08)'
  const menuBg      = dark ? '#0F172A' : '#FFFFFF'

  const NAV_LINKS = [
    { href: '/search',                     label: 'Properties' },
    { href: '/calculator',                 label: 'Calculator' },
    { href: '/compare',                    label: 'Compare' },
    { href: '/neighborhood/lekki-phase-1', label: 'Markets' },
    { href: '/agency/dashboard',           label: 'Agency' },
    { href: '/developer/dashboard', label: 'Developer' }
  ]

  const linkStyle: React.CSSProperties = {
    fontSize: '0.82rem', fontWeight: 500, color: textMuted,
    padding: '0.4rem 0.75rem', borderRadius: 8,
    textDecoration: 'none', transition: 'color 0.15s',
  }

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: bg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${borderColor}`,
        padding: '0 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 60, transition: 'background 0.3s',
      }}>

        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#5B2EFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>M</div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: textColor, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Manop</div>
            <div style={{ fontSize: '0.48rem', fontWeight: 600, color: '#14B8A6', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Africa Intelligence</div>
          </div>
        </Link>

        {/* Desktop nav — hidden on mobile via CSS class */}
        <div className="manop-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.1rem' }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={linkStyle}>{l.label}</Link>
          ))}

          {/* Theme toggle */}
          {mounted && (
            <button onClick={toggle} aria-label={dark ? 'Light mode' : 'Dark mode'} style={{ width: 40, height: 22, borderRadius: 100, background: dark ? '#5B2EFF' : '#CBD5E1', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.25s', margin: '0 0.3rem', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: dark ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                {dark ? '☀' : '☾'}
              </div>
            </button>
          )}

          <Link href="/agency/onboard" style={{ background: '#5B2EFF', color: '#fff', padding: '0.42rem 0.875rem', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Partner →
          </Link>
        </div>

        {/* Mobile right: theme + hamburger — hidden on desktop */}
        <div className="manop-mobile-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {mounted && (
            <button onClick={toggle} aria-label="Toggle theme" style={{ width: 36, height: 22, borderRadius: 100, background: dark ? '#5B2EFF' : '#CBD5E1', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
              <div style={{ position: 'absolute', top: 2, left: dark ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                {dark ? '☀' : '☾'}
              </div>
            </button>
          )}
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', justifyContent: 'center', width: 36, height: 36 }}>
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, transition: 'all 0.2s', transform: menuOpen ? 'translateY(6.5px) rotate(45deg)' : 'none' }} />
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, transition: 'all 0.2s', transform: menuOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div style={{ position: 'fixed', top: 60, left: 0, right: 0, zIndex: 199, background: menuBg, borderBottom: `1px solid ${borderColor}`, padding: '0.5rem 1.25rem 1rem', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{ display: 'block', fontSize: '1rem', color: textColor, padding: '0.75rem 0', borderBottom: `1px solid ${borderColor}`, textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
          <Link href="/agency/onboard" onClick={() => setMenuOpen(false)} style={{ display: 'block', marginTop: '0.875rem', background: '#5B2EFF', color: '#fff', padding: '0.75rem 1rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, textAlign: 'center' }}>
            Become a partner →
          </Link>
        </div>
      )}

      <style>{`
        @media (min-width: 641px) { .manop-mobile-nav { display: none !important; } }
        @media (max-width: 640px) { .manop-desktop-nav { display: none !important; } }
      `}</style>
    </>
  )
}
