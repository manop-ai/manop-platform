// app/layout.tsx — UPDATED
// Root layout now conditionally hides NavBar and Footer for dashboard routes.
// This is cleaner than route groups because it doesn't require restructuring
// the entire file system.

import type { Metadata } from 'next'
import './globals.css'
import NavBar from '../components/NavBar'
import ManopFooter from '../components/ManopFooter'
import DashboardShell from '../components/DashboardShell'

export const metadata: Metadata = {
  title: 'Manop — Africa Property Intelligence',
  description: 'Search any African neighborhood to see verified yield, cap rates, and market benchmarks.',
  openGraph: {
    title: 'Manop — Africa Property Intelligence',
    description: 'Real property intelligence for African real estate investors.',
    url: 'https://manopintel.com',
  },
}

const themeScript = `
(function() {
  try {
    var saved = localStorage.getItem('manop-dark');
    var dark = saved !== null ? saved === 'true' : true;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch(e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="dns-prefetch" href="https://open.er-api.com" />
        <link rel="dns-prefetch" href="https://ftbmfjkrgcbykombxdlh.supabase.co" />
      </head>
      <body>
        {/*
          DashboardShell reads the current pathname (client-side).
          For /admin, /association/*, /agency/dashboard, /developer/dashboard,
          /investor/dashboard — it renders children only (no NavBar, no Footer).
          For all other routes — renders NavBar + children + Footer as before.
        */}
        <DashboardShell>
          {children}
        </DashboardShell>
      </body>
    </html>
  )
}