import type { Metadata } from 'next'
import './globals.css'
import NavBar from '../components/NavBar'

export const metadata: Metadata = {
  title: 'Manop — Africa Property Intelligence',
  description: 'Search any African neighborhood to see verified yield, cap rates, and market benchmarks. Run a deal analysis before you invest.',
  openGraph: {
    title: 'Manop — Africa Property Intelligence',
    description: 'Real property intelligence for African real estate investors.',
    url: 'https://manopintel.com',
  },
}

// This script runs before React hydrates — prevents flash of wrong theme
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
        {/* Anti-flash theme script — runs synchronously before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />

        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  )
}
