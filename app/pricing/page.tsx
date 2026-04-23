'use client'
// app/pricing/page.tsx
// MANOP Pricing — FREE for now
// Everything is free - no payment required

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getInitialDark, listenTheme } from '../../lib/theme'

const FREE_FEATURES = [
  'Traditional yield on every property',
  'Cap rate (net operating income ÷ price)',
  'ROI signal — Strong / Moderate / Low',
  'vs Market median badge (real bedroom data)',
  'PropLens verdict — Fair / Overpriced / Underpriced',
  'Neighborhood comparison — price, yield, cap rate',
  'STR / Airbnb yield on every property',
  'Cash-on-cash return (leveraged analysis)',
  'Full 10-year USD return model with chart',
  'PropLens deep analysis — risk score + full explanation',
  'Price trend projection (5yr, 10yr)',
  'Priority support',
  'Dual NGN + USD pricing at live rate',
  'Search across all verified listings',
]

const FAQS = [
  {
    q: 'What data are the benchmarks based on?',
    a: 'Real agency-submitted listings from verified partners. Lekki Phase 1 benchmarks are computed from 33 for-sale and 17 rental listings from CW Real Estate. Labeled "verified" vs "research estimate" where applicable.',
  },
  {
    q: 'Is this useful if I\'m outside Nigeria?',
    a: 'Yes — all prices are shown in USD at live exchange rates. The depreciation model is especially relevant for diaspora investors managing currency risk.',
  },
  {
    q: 'What currencies does Manop support?',
    a: 'NGN (Nigeria), GHS (Ghana), KES (Kenya). All converted to USD at live open.er-api.com rates.',
  },
  {
    q: 'What if the data isn\'t available for my area?',
    a: 'Manop shows verified data where it exists and clearly labels research estimates where it doesn\'t. As more agencies join, coverage expands. Contact us to request your area.',
  },
]

export default function PricingPage() {
  const [dark,      setDark]      = useState(true)
  const [annual,    setAnnual]    = useState(false)
  const [email,     setEmail]     = useState('')

  useEffect(() => {
    setDark(getInitialDark())
    return listenTheme(d => setDark(d))
  }, [])

  const bg    = dark ? '#0F172A' : '#F8FAFC'
  const bg2   = dark ? '#1E293B' : '#F1F5F9'
  const bg3   = dark ? '#162032' : '#FFFFFF'
  const text  = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.32)' : 'rgba(15,23,42,0.32)'
  const border = dark ? 'rgba(248,250,252,0.07)' : 'rgba(15,23,42,0.07)'

  const checkItem = (text: string) => (
    <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.6rem' }}>
      <span style={{ color: '#22C55E', fontSize: '0.75rem', flexShrink: 0, marginTop: 2 }}>✓</span>
      <span style={{ fontSize: '0.82rem', color: text2, lineHeight: 1.45 }}>{text}</span>
    </div>
  )

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>

      {/* Header */}
      <div style={{ background: bg2, borderBottom: `1px solid ${border}`, padding: '2rem 2rem 1.5rem' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <Link href="/" style={{ fontSize: '0.75rem', color: text3, textDecoration: 'none' }}>Manop</Link>
            <span style={{ color: text3 }}>›</span>
            <span style={{ fontSize: '0.75rem', color: text2 }}>Pricing</span>
          </div>
          <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>
            Free intelligence for every investor.
          </h1>
          <p style={{ fontSize: '0.9rem', color: text2, maxWidth: 440, margin: '0 auto' }}>
            All features unlocked. No payment required. Start investing with real data.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '3rem 2rem' }}>

        {/* Free Plan */}
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 16, padding: '2rem', textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>Free · Forever</div>
          <div style={{ fontSize: '3rem', fontWeight: 800, color: text, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '0.25rem' }}>$0</div>
          <div style={{ fontSize: '0.9rem', color: text3, marginBottom: '2rem' }}>No credit card required</div>

          <Link href="/search" style={{ display: 'inline-block', background: '#5B2EFF', color: '#fff', border: 'none', borderRadius: 10, padding: '1rem 2rem', textDecoration: 'none', fontSize: '1rem', fontWeight: 700, transition: 'background 0.15s, transform 0.1s' }}>
            Start Investing →
          </Link>

          <div style={{ marginTop: '2rem' }}>
            {FREE_FEATURES.map(f => checkItem(f))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.5rem', textAlign: 'center' }}>Frequently Asked Questions</div>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: text, marginBottom: '0.5rem' }}>{faq.q}</div>
              <div style={{ fontSize: '0.85rem', color: text2, lineHeight: 1.5 }}>{faq.a}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
