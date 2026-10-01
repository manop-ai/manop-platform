'use client'
// components/DashboardShell.tsx
// Wraps the root layout. Hides NavBar and Footer for dashboard routes.
// Dashboard routes have their own navigation (IntelligenceShell) — they
// don't need the public nav stacked on top of it.
//
// FIXED: the previous match required an exact trailing slash after each
// listed route ('/investor/dashboard' + '/'), so a sibling page like
// '/investor/dashboard-v2' or a route not yet listed at all
// ('/agency/developments') fell through and got the public NavBar/Footer
// wrapped around it too — the duplicate-nav bug. Two changes:
//   1. Matching no longer requires a trailing slash, so any path that
//      simply starts with a listed root (dashboard-v2, dashboard-anything)
//      is caught without needing a separate list entry each time.
//   2. '/agency/developments' and '/investor/dashboard-v2' added
//      explicitly for this session's new pages.
//
// Deliberately still an explicit list, not a blanket '/agency' or
// '/developer' prefix — '/agency/onboard' and '/developer/onboard' are
// public signup pages and should keep the normal public nav.

import { usePathname } from 'next/navigation'
import NavBar from './NavBar'
import ManopFooter from './ManopFooter'

// Routes that should NOT show the public NavBar or Footer.
// When adding a new dashboard/world page, add its root here.
const DASHBOARD_ROUTES = [
  '/admin',
  '/association',
  '/agency/dashboard',
  '/agency/developments',
  '/developer/dashboard',
  '/investor/dashboard', // also matches /investor/dashboard-v2 and any future variant
]

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
 
  const isDashboard = DASHBOARD_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route)
  )
 
  // Site Studio is an interactive workspace, not a marketing page —
  // it keeps its own toolbar and needs the full viewport, the same
  // reasoning as every route in DASHBOARD_ROUTES above. Matched by
  // pattern rather than added to that list because '/site-intelligence'
  // itself, and '/site-intelligence/[id]' (the public Site Dossier),
  // must keep the normal public NavBar/Footer — only the Studio
  // workspace and its Sandbox picker should not.
  const isSiteStudio = /^\/site-intelligence\/[^/]+\/studio(\/|$)/.test(pathname)
  const isStudioSandbox = pathname === '/site-intelligence/sandbox' || pathname.startsWith('/site-intelligence/sandbox/')
 
  if (isDashboard || isSiteStudio || isStudioSandbox) {
    // Dashboard routes: render children only — no public nav, no footer
    return <>{children}</>
  }

  // Public routes: render with NavBar and Footer as before
  return (
    <>
      <NavBar />
      {children}
      <ManopFooter />
    </>
  )
}