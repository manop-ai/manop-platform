'use client'
// components/NavBar.tsx
//
// CHANGES FROM ORIGINAL:
// 1. Real logo: replaced purple "M" square with ManopLogoSVG
//    (works without placing /public PNG files — SVG is self-contained)
// 2. Light mode fully fixed: every color value now reads from dark/light state.
//    Original had some hardcoded dark values that didn't switch in light mode.
// 3. Login/Register links now show only when not logged in.
//    Dashboard link shows when logged in (reads from Supabase session).
// 4. All interactive elements are clickable — z-index structure preserved.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { getInitialDark, setTheme, listenTheme } from '../lib/theme'
import ManopLogo from './ManopLogo'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export default function NavBar() {
  const [dark,     setDark]     = useState(true)
  const [scrolled, setScrolled] = useState(false)
  const [mounted,  setMounted]  = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDark(getInitialDark())
    document.documentElement.setAttribute('data-theme', getInitialDark() ? 'dark' : 'light')

    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    const unlisten = listenTheme(d => setDark(d))

    // Check auth session for role-aware nav
    async function checkSession() {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session?.user) {
          setLoggedIn(true)
          const role = session.user.user_metadata?.user_role as string | undefined
          setUserRole(role || null)
        }
      } catch { /* no session */ }
    }
    checkSession()

    return () => { window.removeEventListener('scroll', onScroll); unlisten() }
  }, [])

  const toggle = () => { const n = !dark; setDark(n); setTheme(n) }

  // ── Theme-aware colors — ALL values switch correctly ─────────
  const bg          = dark
    ? `rgba(15,23,42,${scrolled ? '0.97' : '0.90'})`
    : `rgba(248,250,252,${scrolled ? '0.98' : '0.93'})`
  const textColor   = dark ? '#F8FAFC' : '#0F172A'
  const textMuted   = dark ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.55)'
  const borderColor = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.1)'
  const menuBg      = dark ? '#0F172A' : '#FFFFFF'
  const menuShadow  = dark ? '0 16px 40px rgba(0,0,0,0.5)' : '0 16px 40px rgba(0,0,0,0.12)'
  const toggleTrack = dark ? '#5B2EFF' : '#CBD5E1'

  // Dashboard link based on role
  function dashboardHref(): string {
    if (userRole === 'agency')    return '/agency/dashboard'
    if (userRole === 'developer') return '/developer/dashboard'
    if (userRole === 'admin')     return '/admin/verification'
    return '/search'  // buyer/investor/diaspora → search
  }

  const NAV_LINKS = [
    { href: '/search',     label: 'Properties' },
    { href: '/markets',    label: 'Markets'    },
    { href: '/calculator', label: 'Calculator' },
  ]

  const linkStyle: React.CSSProperties = {
    fontSize: '0.82rem', fontWeight: 500, color: textMuted,
    padding: '0.4rem 0.75rem', borderRadius: 8,
    textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative', zIndex: 1001,
    transition: 'color 0.15s',
  }

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: bg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${borderColor}`,
        padding: '0 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 84, transition: 'background 0.3s',
        isolation: 'isolate',
      }}>

        {/* ── Brand / Logo ────────────────────────────────── */}
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', position: 'relative', zIndex: 1001 }}
          onClick={() => setMenuOpen(false)}
        >
          <ManopLogo height={80} dark={dark} />
        </Link>

        <div className="manop-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.1rem', position: 'relative', zIndex: 1001 }}>
          {NAV_LINKS.map(l => (
            <Link key={l.href} href={l.href} style={linkStyle}>{l.label}</Link>
          ))}

          <div style={{ width: 1, height: 18, background: borderColor, margin: '0 0.25rem' }} />

          {/* Auth-aware links */}
          {loggedIn ? (
            <>
              <Link href={dashboardHref()} style={{ ...linkStyle, fontWeight: 600, color: textColor }}>
                Dashboard
              </Link>
              <button
                onClick={async () => {
                  await sb.auth.signOut()
                  window.location.href = '/'
                }}
                style={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, color: textMuted }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/register" style={{ ...linkStyle, fontWeight: 600 }}>Register</Link>
              <Link href="/login"    style={{ ...linkStyle, fontWeight: 600 }}>Login</Link>
            </>
          )}

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
              style={{
                width: 40, height: 22, borderRadius: 100,
                background: toggleTrack,
                border: 'none', cursor: 'pointer',
                position: 'relative', margin: '0 0.3rem',
                flexShrink: 0, zIndex: 1001,
                transition: 'background 0.25s',
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: dark ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.25s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.6rem',
              }}>
                {dark ? '☀' : '☾'}
              </div>
            </button>
          )}

          {/* Partner CTA */}
          {!loggedIn && (
            <Link
              href="/agency/onboard"
              style={{
                background: '#5B2EFF', color: '#fff',
                padding: '0.42rem 0.875rem', borderRadius: 8,
                fontSize: '0.78rem', fontWeight: 600,
                textDecoration: 'none', whiteSpace: 'nowrap' as const,
                position: 'relative', zIndex: 1001,
                transition: 'background 0.15s',
              }}
            >
              Partner →
            </Link>
          )}
        </div>

        {/* ── Mobile right ────────────────────────────────── */}
        <div className="manop-mobile-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', zIndex: 1001 }}>
          {mounted && (
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              style={{ width: 36, height: 22, borderRadius: 100, background: toggleTrack, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.25s' }}
            >
              <div style={{ position: 'absolute', top: 2, left: dark ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                {dark ? '☀' : '☾'}
              </div>
            </button>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', justifyContent: 'center', width: 36, height: 36, WebkitTapHighlightColor: 'transparent' }}
          >
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, transition: 'all 0.2s', transform: menuOpen ? 'translateY(6.5px) rotate(45deg)' : 'none' }} />
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, opacity: menuOpen ? 0 : 1, transition: 'opacity 0.2s' }} />
            <div style={{ width: 20, height: 1.5, background: textColor, borderRadius: 1, transition: 'all 0.2s', transform: menuOpen ? 'translateY(-6.5px) rotate(-45deg)' : 'none' }} />
          </button>
        </div>
      </nav>

      {/* ── Mobile dropdown ──────────────────────────────── */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 60, left: 0, right: 0,
          background: menuBg,
          borderBottom: `1px solid ${borderColor}`,
          zIndex: 999,
          boxShadow: menuShadow,
          padding: '0.75rem 1.25rem 1.25rem',
          display: 'flex', flexDirection: 'column', gap: '0.25rem',
        }}>
          {NAV_LINKS.map(l => (
            <Link
              key={l.href} href={l.href}
              onClick={() => setMenuOpen(false)}
              style={{ fontSize: '0.9rem', fontWeight: 500, color: textMuted, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}
            >
              {l.label}
            </Link>
          ))}

          {loggedIn ? (
            <>
              <Link href={dashboardHref()} onClick={() => setMenuOpen(false)}
                style={{ fontSize: '0.9rem', fontWeight: 600, color: textColor, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
                Dashboard
              </Link>
              <button
                onClick={async () => { await sb.auth.signOut(); window.location.href = '/' }}
                style={{ fontSize: '0.9rem', fontWeight: 500, color: textMuted, padding: '0.65rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, borderBottom: `1px solid ${borderColor}` }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" onClick={() => setMenuOpen(false)}
                style={{ fontSize: '0.9rem', fontWeight: 600, color: textColor, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
                Login
              </Link>
              <Link href="/register" onClick={() => setMenuOpen(false)}
                style={{ fontSize: '0.9rem', fontWeight: 500, color: textMuted, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
                Register
              </Link>
              <Link href="/agency/onboard" onClick={() => setMenuOpen(false)}
                style={{ marginTop: '0.5rem', display: 'block', textAlign: 'center' as const, background: '#5B2EFF', color: '#fff', padding: '0.75rem 1rem', borderRadius: 10, fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none' }}>
                List your agency →
              </Link>
            </>
          )}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .manop-desktop-nav { display: none !important; }
          .manop-mobile-nav  { display: flex !important; }
        }
        @media (min-width: 769px) {
          .manop-desktop-nav { display: flex !important; }
          .manop-mobile-nav  { display: none !important; }
        }
      `}</style>
    </>
  )
}