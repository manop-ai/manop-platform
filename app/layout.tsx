import type { Metadata } from 'next'
import './globals.css'
import NavBar from '../components/NavBar'

export const metadata: Metadata = {
  title: 'Manop — Africa Property Intelligence',
  description: 'Search any African neighborhood to see verified yield analysis, cap rates, and market benchmarks before you invest.',
  openGraph: {
    title: 'Manop — Africa Property Intelligence',
    description: 'Real property intelligence for African real estate investors. Powered by Manop.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
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
