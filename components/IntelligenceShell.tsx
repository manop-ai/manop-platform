'use client'
// components/IntelligenceShell.tsx
//
// The shared shell every MANOP dashboard renders inside — investor, agency,
// developer, admin. Three fixed regions (sidebar, topbar, footer) wrap a
// content area built from reusable Blocks (see Blocks.tsx in this same
// folder). This is structure, not visual polish — colors/spacing are the
// existing design tokens; the actual look gets refined once Joel's sample
// layout is finalized.
//
// Per the standing UX rule: each dashboard is its own self-contained world.
// The topbar's location links (Markets/Developments/Investors/Developers)
// mirror the homepage's own top nav — same destinations, not a duplicate
// homepage layout — so a logged-in user can jump straight to a section
// without leaving their dashboard's shell entirely.

import Link from 'next/link'
import { ReactNode, useEffect, useState } from 'react'
import { getDesignColors, designTokens } from '../lib/theme'
import { getInitialDark, listenTheme } from '../lib/theme'

export interface ShellNavItem {
  label: string
  href: string
  icon: string
}

export interface ShellUser {
  name: string
  accountType: string // 'Diaspora Investor' | 'Agency' | 'Developer' | 'Admin'
}

export interface TopNavItem {
  label: string
  href: string
}

// Contextual top nav, per account type — not one fixed set shown to
// everyone. An investor sees investor-relevant destinations; an agency
// or developer gets their own. Pass a custom array via `topNav` prop to
// override for a specific page.
export const TOP_NAV_BY_ACCOUNT: Record<string, TopNavItem[]> = {
  investor: [
    { label: 'Dashboard',           href: '/investor/dashboard' },
    { label: 'Market Intelligence', href: '/markets' },
    { label: 'Area Intelligence',   href: '/neighborhood' },
    { label: 'Properties',         href: '/search' },
    { label: 'Developments',       href: '/developments' },
    { label: 'Investment Intelligence', href: '/calculator' },
  ],
  agency: [
    { label: 'My Listings',      href: '/agency/dashboard' },
    { label: 'My Developments',  href: '/agency/developments' },
    { label: 'Market Intelligence', href: '/markets' },
  ],
  developer: [
    { label: 'My Projects',        href: '/developer/dashboard' },
    { label: 'Market Intelligence', href: '/markets' },
  ],
  admin: [
    { label: 'Developments', href: '/admin/developments' },
    { label: 'Comparables',  href: '/admin/comparables' },
  ],
}

interface Props {
  eyebrow: string
  title: string
  user?: ShellUser
  accountKind?: keyof typeof TOP_NAV_BY_ACCOUNT // picks the right nav set
  topNav?: TopNavItem[] // explicit override, if a page needs a custom set
  navItems: ShellNavItem[]
  activeHref: string
  activeTopNav?: string
  ctaLabel?: string
  ctaHref?: string
  topRight?: ReactNode
  // When provided, sidebar items render as buttons calling this instead
  // of navigating via <Link> — this is what makes a single-page "world"
  // (tab-switching, never leaving the frame) actually work. Without it,
  // items behave as normal links, which is correct for most dashboards.
  onNavClick?: (href: string) => void
  children: ReactNode
}

export default function IntelligenceShell({
  eyebrow, title, user, accountKind = 'investor', topNav, navItems, activeHref, activeTopNav, ctaLabel, ctaHref, topRight, onNavClick, children,
}: Props) {
  const [dark, setDark] = useState(getInitialDark)
  useEffect(() => {
    return listenTheme(setDark)
  }, [])
  const c = getDesignColors(dark)
  const resolvedTopNav = topNav || TOP_NAV_BY_ACCOUNT[accountKind] || TOP_NAV_BY_ACCOUNT.investor

  return (
    <div style={{ background: c.background, minHeight: '100vh', color: c.textPrimary, fontFamily: designTokens.font.family, display: 'flex', flexDirection: 'column' }}>
      <link href={designTokens.font.googleFontsUrl} rel="stylesheet" />

      {/* ── Topbar ──────────────────────────────────────────────
          Same section destinations as the homepage nav — not a
          content duplicate, just consistent wayfinding. */}
      <header style={{ borderBottom: `1px solid ${c.border}`, padding: '0.8rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Link href="/" style={{ textDecoration: 'none', color: c.textPrimary, fontWeight: 800, fontSize: 18 }}>MANOP</Link>
          <nav style={{ display: 'flex', gap: 20 }}>
            {resolvedTopNav.map(item => (
              <Link key={item.href} href={item.href} style={{
                textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
                color: item.href === activeTopNav ? c.textPrimary : c.textMuted,
                borderBottom: item.href === activeTopNav ? `2px solid ${c.intelligencePurple}` : '2px solid transparent',
                paddingBottom: 4,
              }}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {topRight}
          <Link href="/" style={{
            fontSize: 13, fontWeight: 600, color: c.textMuted, border: `1px solid ${c.border}`,
            borderRadius: designTokens.radius.sm, padding: '0.45rem 0.9rem', textDecoration: 'none',
          }}>
            ← Home
          </Link>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${c.border}`, padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: c.verificationTeal, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
            {user && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
                <div style={{ fontSize: 11, color: c.textMuted }}>{user.accountType}</div>
              </div>
            )}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(item => {
              const active = item.href === activeHref
              const itemStyle = {
                display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem',
                borderRadius: designTokens.radius.sm, textDecoration: 'none', fontSize: 14, fontWeight: 600,
                color: active ? '#fff' : c.textMuted,
                background: active ? c.intelligencePurple : 'transparent',
                border: 'none', width: '100%', textAlign: 'left' as const, cursor: 'pointer',
                fontFamily: designTokens.font.family,
              }
              if (onNavClick) {
                return (
                  <button key={item.href} onClick={() => onNavClick(item.href)} style={itemStyle}>
                    <span style={{ fontSize: 15 }}>{item.icon}</span>
                    {item.label}
                  </button>
                )
              }
              return (
                <Link key={item.href} href={item.href} style={itemStyle}>
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div style={{ flex: 1 }} />

          {ctaLabel && ctaHref && (
            <Link href={ctaHref} style={{
              display: 'block', textAlign: 'center', padding: '0.7rem', borderRadius: designTokens.radius.sm,
              background: c.intelligencePurple, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none',
            }}>
              {ctaLabel}
            </Link>
          )}
        </aside>

        {/* ── Main content — built from Blocks by the calling page ── */}
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' as const }}>
          <div style={{ padding: '1.75rem', maxWidth: designTokens.spacing.maxWidth }}>
            {children}
          </div>
        </main>
      </div>

      {/* ── Footer — brand + support contact ─────────────────────
          First-segment support is a mailto — becomes a real ticket
          system later without changing this shell's shape. */}
      <footer style={{ borderTop: `1px solid ${c.border}`, padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, fontSize: 12, color: c.textMuted }}>
        <div>© 2026 MANOP Intelligence. Coverage: Lagos · Abuja · Accra · Nairobi</div>
        <a href="mailto:support@manopintel.com" style={{ color: c.intelligencePurple, textDecoration: 'none', fontWeight: 600 }}>
          Contact support →
        </a>
      </footer>
    </div>
  )
}