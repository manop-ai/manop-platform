'use client'
// components/DashboardShell.tsx
// Wraps the root layout. Hides NavBar and Footer for dashboard routes.
// Dashboard routes have their own navigation — they don't need the public nav.

import { usePathname } from 'next/navigation'
import NavBar from './NavBar'
import ManopFooter from './ManopFooter'

// Routes that should NOT show the public NavBar or Footer
const DASHBOARD_ROUTES = [
  '/admin',
  '/association',
  '/agency/dashboard',
  '/developer/dashboard',
  '/investor/dashboard',
]

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isDashboard = DASHBOARD_ROUTES.some(route =>
    pathname === route || pathname.startsWith(route + '/')
  )

  if (isDashboard) {
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