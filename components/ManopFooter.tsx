'use client'
// components/ManopFooter.tsx
//
// USAGE — add to app/layout.tsx after {children}:
//   import ManopFooter from '../components/ManopFooter'
//   <NavBar />
//   {children}
//   <ManopFooter />
//
// Or add at the bottom of individual pages (homepage, search, markets).
// The footer reads the dark theme from localStorage so it matches the page.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../lib/theme'
import { ManopLogoSVG } from './ManopLogo'

const COLS = [
  {
    heading: 'Platform',
    links: [
      { label: 'Search properties',   href: '/search'     },
      { label: 'Market intelligence', href: '/markets'    },
      { label: 'Investment Intelligence', href: '/calculator' },
      { label: 'Neighborhood data',   href: '/markets'    },
    ],
  },
  {
    heading: 'Partner',
    links: [
      { label: 'Agency onboarding',    href: '/agency/onboard'    },
      { label: 'Developer onboarding', href: '/developer/onboard' },
      { label: 'MAPE trust scoring',   href: '/markets'           },
      { label: 'API access',           href: '/register'          },
    ],
  },
  {
    heading: 'Markets',
    links: [
      { label: 'Lagos',   href: '/markets?area=Lekki%20Phase%201' },
      { label: 'Accra',   href: '/markets?area=East%20Legon'      },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Manop',  href: '/'        },
      { label: 'Register',     href: '/register' },
      { label: 'Sign in',      href: '/login'    },
    ],
  },
]

export default function ManopFooter() {
  const [dark, setDark] = useState(getInitialDark)

  useEffect(() => {
    return listenTheme(d => setDark(d))
  }, [])

  const bg     = dark ? '#080D1E' : '#F0F3FA'
  const bg2    = dark ? '#0F172A' : '#F8FAFC'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.55)' : 'rgba(15,23,42,0.55)'
  const text3  = dark ? 'rgba(248,250,252,0.28)' : 'rgba(15,23,42,0.28)'
  const border = dark ? 'rgba(255,255,255,0.06)'  : 'rgba(15,23,42,0.08)'

  return (
    <footer style={{ background: bg, borderTop: `1px solid ${border}`, color: text }}>

      {/* Main footer grid */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '3.5rem 2rem 2rem', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr', gap: '2.5rem' }}>

        {/* Brand column */}
        <div>
          <Link href="/" style={{ display: 'inline-flex', textDecoration: 'none', marginBottom: '1.25rem' }}>
            <ManopLogoSVG height={72} dark={dark} showText />
          </Link>
          <p style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.75, maxWidth: 240, margin: '0 0 1.25rem' }}>
            The intelligence and trust platform for African real estate. Verified data, agency trust scores, and market benchmarks across Lagos, Abuja, Accra, and Nairobi.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {['NG', 'GH', 'KE'].map(code => (
              <span key={code} style={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em',
                padding: '3px 7px', borderRadius: 5,
                color: text2, background: dark ? 'rgba(248,250,252,0.06)' : 'rgba(15,23,42,0.05)',
                border: `1px solid ${dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.08)'}`,
              }}>{code}</span>
            ))}
          </div>
        </div>

        {/* Link columns */}
        {COLS.map(col => (
          <div key={col.heading}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase' as const, letterSpacing: '0.14em', marginBottom: '0.875rem' }}>
              {col.heading}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' as const, gap: '0.55rem' }}>
              {col.links.map(l => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    style={{ fontSize: '0.78rem', color: text2, textDecoration: 'none', transition: 'color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.color = text)}
                    onMouseLeave={e => (e.currentTarget.style.color = text2)}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ background: bg2, borderTop: `1px solid ${border}` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '0.5rem' }}>
          <div style={{ fontSize: '0.7rem', color: text3 }}>
            © {new Date().getFullYear()} Manop Intelligence Ltd. All rights reserved.
          </div>
          <div style={{ display: 'flex', gap: '1.25rem' }}>
            {[
              { label: 'Privacy', href: '/' },
              { label: 'Terms',   href: '/' },
              { label: 'Data',    href: '/' },
            ].map(l => (
              <Link key={l.label} href={l.href}
                style={{ fontSize: '0.7rem', color: text3, textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = text2)}
                onMouseLeave={e => (e.currentTarget.style.color = text3)}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <div style={{ fontSize: '0.68rem', color: text3, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
            All systems operational
          </div>
        </div>
      </div>

      {/* Mobile responsive override */}
      <style>{`
        @media (max-width: 768px) {
          footer > div:first-child {
            grid-template-columns: 1fr 1fr !important;
          }
          footer > div:first-child > div:first-child {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 480px) {
          footer > div:first-child {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  )
}