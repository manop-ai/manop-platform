'use client'
// components/NavBar.tsx
//
// NAV GROUPING PASS: related destinations now live under one dropdown with a
// name that describes them, instead of a flat row of unrelated links.
//   Site Intelligence ▾  Discover Sites / Quick Review / Submit a Site / Site Studio
//   Finance ▾            Finance Overview / Investment Intelligence / Construction Appraisal
//   Reviewed Developments, Market Intelligence stay top-level (single destinations).
// One generic dropdown component drives every group, so adding a destination to
// a group is a one-line change in NAV_GROUPS — no new state or handlers.
//
// Kept from the previous version: the shared ROLE_ROUTES dashboard map, the
// canonical supabase import, and the Sun/Moon theme toggle.
// Icons are lucide-react throughout (the arrow in "Sign up" and the hamburger
// were text/div glyphs; now ArrowRight / Menu / X).

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase as sb } from '../lib/supabase'
import { getInitialDark, setTheme, listenTheme, getDesignColors } from '../lib/theme'
import { ROLE_ROUTES } from '../lib/useAuth'
import ManopLogo from './ManopLogo'
import type { LucideIcon } from 'lucide-react'
import {
  Sun, Moon, ChevronDown, Search, FileSearch, FilePlus2, Boxes,
  ArrowRight, Menu, X, LayoutGrid, LineChart, HardHat,
} from 'lucide-react'

interface NavItem  { href: string; label: string; desc: string; icon: LucideIcon }
interface NavGroup { key: string; label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    key: 'site-intelligence',
    label: 'Site Intelligence',
    items: [
      { href: '/site-intelligence',              label: 'Discover Sites',  desc: 'Browse submitted sites and land opportunities', icon: Search },
      { href: '/site-intelligence/quick-review', label: 'Quick Review',    desc: 'A fast first look at a site before full submission', icon: FileSearch },
      { href: '/site-intelligence/submit',       label: 'Submit a Site',   desc: 'Structure a site for MANOP to review', icon: FilePlus2 },
      { href: '/site-intelligence/studio',       label: 'Site Studio',     desc: 'Explore development scenarios on a site', icon: Boxes },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    items: [
      { href: '/finance',                        label: 'Finance Overview',        desc: 'How MANOP explains the finance position of a property or site', icon: LayoutGrid },
      { href: '/calculator',                     label: 'Investment Intelligence', desc: 'Yield, debt cover and cashflow for an investment', icon: LineChart },
      { href: '/site-intelligence/studio',       label: 'Construction Appraisal',  desc: 'Development economics for a site scenario', icon: HardHat },
    ],
  },
]

const TOP_LINKS = [
  { href: '/developments', label: 'Reviewed Developments' },
  { href: '/markets',      label: 'Market Intelligence' },
]

export default function NavBar() {
  const pathname = usePathname()
  const [dark, setDark] = useState(getInitialDark)
  const [scrolled, setScrolled] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)

    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    const unlisten = listenTheme(d => setDark(d))

    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpenGroup(null); setMenuOpen(false) }
    }
    window.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onKey)

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

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onKey)
      unlisten()
    }
  }, [])

  // Close dropdowns and the mobile menu on route change
  useEffect(() => { setOpenGroup(null); setMenuOpen(false) }, [pathname])

  const toggle = () => { const n = !dark; setDark(n); setTheme(n) }

  const c = getDesignColors(dark)
  const bg          = dark
    ? `rgba(15,23,42,${scrolled ? '0.97' : '0.90'})`
    : `rgba(248,250,252,${scrolled ? '0.98' : '0.93'})`
  const textColor   = c.textPrimary
  const textMuted   = dark ? 'rgba(248,250,252,0.6)' : 'rgba(15,23,42,0.55)'
  const borderColor = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.1)'
  const menuBg      = dark ? '#0F172A' : '#FFFFFF'
  const menuShadow  = dark ? '0 16px 40px rgba(0,0,0,0.5)' : '0 16px 40px rgba(0,0,0,0.12)'
  const toggleTrack = dark ? '#5B2EFF' : '#CBD5E1'
  const hoverBg     = dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'

  const dashboardHref = userRole ? (ROLE_ROUTES[userRole] || '/search') : '/search'

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const groupActive = (g: NavGroup) => g.items.some(i => isActive(i.href))

  const linkStyle = (active = false): React.CSSProperties => ({
    fontSize: '0.82rem', fontWeight: active ? 600 : 500,
    color: active ? textColor : textMuted,
    padding: '0.4rem 0.75rem', borderRadius: 8,
    textDecoration: 'none',
    WebkitTapHighlightColor: 'transparent',
    position: 'relative', zIndex: 1001,
    transition: 'color 0.15s, background 0.15s',
  })

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 1000,
        background: bg,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${borderColor}`,
        transition: 'background 0.3s',
        isolation: 'isolate',
      }}>
        <div style={{
          maxWidth: 1320, margin: '0 auto', width: '100%',
          padding: '0 1.25rem', height: 84,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>

          <Link
            href="/"
            style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', position: 'relative', zIndex: 1001 }}
            onClick={() => setMenuOpen(false)}
          >
            <ManopLogo height={80} dark={dark} />
          </Link>

          {/* ── Desktop ─────────────────────────────────── */}
          <div ref={navRef} className="manop-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.1rem', position: 'relative', zIndex: 1001 }}>

            {NAV_GROUPS.map(g => {
              const open = openGroup === g.key
              return (
                <div key={g.key} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setOpenGroup(open ? null : g.key)}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    style={{
                      ...linkStyle(groupActive(g) || open),
                      background: open ? hoverBg : 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {g.label}
                    <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                  {open && (
                    // FIX (dropdown-width bug): explicit width alone wasn't enough —
                    // width/minWidth/maxWidth set together with boxSizing:'border-box'
                    // on every level (panel, link, text wrapper), plus flex:1 + minWidth:0
                    // on the text span, so nothing upstream can force it back into a
                    // shrink-to-content column. If this still wraps on your end, open
                    // devtools and check the *computed* width of the [role="menu"] div —
                    // if it's not ~340px, something outside this component (a global
                    // style block, a CSS reset) is overriding it, not this code.
                    <div role="menu" style={{
                      position: 'absolute', top: 'calc(100% + 10px)', left: 0,
                      width: 340, minWidth: 340, maxWidth: 400, boxSizing: 'border-box',
                      background: menuBg, border: `1px solid ${borderColor}`, borderRadius: 12,
                      boxShadow: menuShadow, padding: 8, zIndex: 1002,
                    }}>
                      {g.items.map(item => {
                        const Icon = item.icon
                        return (
                          <Link key={item.label} href={item.href} role="menuitem" onClick={() => setOpenGroup(null)}
                            style={{
                              display: 'flex', alignItems: 'flex-start', gap: 12,
                              padding: '0.6rem 0.65rem', borderRadius: 8, textDecoration: 'none',
                              width: '100%', boxSizing: 'border-box',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = hoverBg)}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <span style={{
                              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: c.intelligencePurpleBg,
                            }}>
                              <Icon size={15} color={c.intelligencePurple} />
                            </span>
                            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: textColor, whiteSpace: 'normal' }}>{item.label}</span>
                              <span style={{ display: 'block', fontSize: '0.7rem', color: textMuted, marginTop: 1, lineHeight: 1.4, whiteSpace: 'normal' }}>{item.desc}</span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

            {TOP_LINKS.map(l => (
              <Link key={l.href} href={l.href} style={linkStyle(isActive(l.href))}>{l.label}</Link>
            ))}

            <div style={{ width: 1, height: 18, background: borderColor, margin: '0 0.25rem' }} />

            {loggedIn ? (
              <>
                <Link href={dashboardHref} style={{ ...linkStyle(), fontWeight: 600, color: textColor }}>
                  Dashboard
                </Link>
                <button
                  onClick={async () => { await sb.auth.signOut(); window.location.href = '/' }}
                  style={{ ...linkStyle(), background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link href="/login" style={{ ...linkStyle(), fontWeight: 600 }}>Login</Link>
            )}

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
                }}>
                  {dark ? <Moon size={11} color="#5B2EFF" /> : <Sun size={11} color="#F59E0B" />}
                </div>
              </button>
            )}

            {!loggedIn && (
              <Link
                href="/register"
                style={{
                  background: '#5B2EFF', color: '#fff',
                  padding: '0.42rem 0.875rem', borderRadius: 8,
                  fontSize: '0.78rem', fontWeight: 600,
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  position: 'relative', zIndex: 1001,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                Sign up <ArrowRight size={13} />
              </Link>
            )}
          </div>

          {/* ── Mobile right ────────────────────────────── */}
          <div className="manop-mobile-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative', zIndex: 1001 }}>
            {mounted && (
              <button
                onClick={toggle}
                aria-label="Toggle theme"
                style={{ width: 36, height: 22, borderRadius: 100, background: toggleTrack, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.25s' }}
              >
                <div style={{ position: 'absolute', top: 2, left: dark ? 16 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.25s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {dark ? <Moon size={10} color="#5B2EFF" /> : <Sun size={10} color="#F59E0B" />}
                </div>
              </button>
            )}
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, color: textColor, WebkitTapHighlightColor: 'transparent' }}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile menu: same groups, same order ─────────── */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 84, left: 0, right: 0,
          background: menuBg,
          borderBottom: `1px solid ${borderColor}`,
          zIndex: 999,
          boxShadow: menuShadow,
          padding: '0.5rem 1.25rem 1.25rem',
          display: 'flex', flexDirection: 'column', gap: '0.15rem',
          maxHeight: 'calc(100vh - 84px)', overflowY: 'auto',
        }}>
          {NAV_GROUPS.map(g => (
            <div key={g.key}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0.85rem 0.5rem 0.3rem' }}>
                {g.label}
              </div>
              {g.items.map(item => {
                const Icon = item.icon
                return (
                  <Link key={item.label} href={item.href} onClick={() => setMenuOpen(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.9rem', fontWeight: 500, color: isActive(item.href) ? textColor : textMuted, padding: '0.6rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
                    <Icon size={16} color={c.intelligencePurple} />
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}

          <div style={{ height: 8 }} />
          {TOP_LINKS.map(l => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
              style={{ fontSize: '0.9rem', fontWeight: 500, color: isActive(l.href) ? textColor : textMuted, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
              {l.label}
            </Link>
          ))}

          {loggedIn ? (
            <>
              <Link href={dashboardHref} onClick={() => setMenuOpen(false)}
                style={{ fontSize: '0.9rem', fontWeight: 600, color: textColor, padding: '0.65rem 0.5rem', textDecoration: 'none', borderBottom: `1px solid ${borderColor}` }}>
                Dashboard
              </Link>
              <button
                onClick={async () => { await sb.auth.signOut(); window.location.href = '/' }}
                style={{ fontSize: '0.9rem', fontWeight: 500, color: textMuted, padding: '0.65rem 0.5rem', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', borderBottom: `1px solid ${borderColor}` }}
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
                style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#5B2EFF', color: '#fff', padding: '0.75rem 1rem', borderRadius: 10, fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none' }}>
                Sign up <ArrowRight size={15} />
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