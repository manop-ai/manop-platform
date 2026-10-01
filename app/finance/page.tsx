'use client'
// app/finance/page.tsx
//
// Front door for MANOP Finance Intelligence. Not a separate product — it
// points into the places where finance already lives (a property's
// "Get Financed" flow, Investment Intelligence, Construction Appraisal in
// Site Studio) and says plainly which parts are live and which are not yet.
// Status labels here are deliberate: nothing is presented as available
// unless a real route or flow exists for it today.
//
// Theme: every color comes from getDesignColors(dark), and the page follows
// the global light/dark toggle live (getInitialDark + listenTheme), the same
// pattern as the Site Studio landing page.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight, Wallet, LineChart, HardHat, CalendarClock, Landmark,
  ShieldCheck, Sigma, CircleHelp,
} from 'lucide-react'
import { getInitialDark, listenTheme, getDesignColors, designTokens } from '../../lib/theme'

type Status = 'available' | 'in_development' | 'planned'

interface Module {
  title: string
  icon: LucideIcon
  status: Status
  body: string
  where: string
  href?: string
  cta?: string
}

const MODULES: Module[] = [
  {
    title: 'Affordability Assessment',
    icon: Wallet,
    status: 'available',
    body: 'Set a property price against the deposit you have. See the amount you would need to borrow, the loan-to-value, an indicative monthly repayment and the cash needed now — using your own assumptions.',
    where: 'Currently reachable only from an individual listing on the legacy search flow, not yet from a Reviewed Development. Flagged in the ongoing architecture reconciliation.',
    // No href/cta here on purpose — the honest destination is /search,
    // which is the flow this reconciliation is questioning. Pointing a
    // Finance Intelligence CTA at it was the bug: it made a legacy-model
    // page look like the current, intended path. Restore a CTA once this
    // is reachable from Reviewed Developments instead.
  },
  {
    title: 'Investment Intelligence',
    icon: LineChart,
    status: 'available',
    body: 'Rent, operating costs and financing structure in; gross yield, net income, debt service, cash-on-cash and debt cover out. Every figure traces back to the numbers you entered.',
    href: '/calculator',
    where: 'Available now, no account needed to run an analysis.',
    cta: 'Open Investment Intelligence',
  },
  {
    title: 'Construction Appraisal',
    icon: HardHat,
    status: 'available',
    body: 'Development economics for a site scenario: gross development value, build and professional costs, finance cost and required profit, leading to an indicative residual land value with sensitivity.',
    href: '/site-intelligence/studio',
    where: 'Runs on scenarios created in Site Studio.',
    cta: 'Go to Site Studio',
  },
  {
    title: 'Payment Plan Intelligence',
    icon: CalendarClock,
    status: 'in_development',
    body: 'Turns a developer payment schedule into a buyer cashflow: cash needed at reservation, the recurring burden, the completion balance, and where a mortgage take-out may be needed.',
    where: 'Being built alongside the Reviewed Developments payment-plan data.',
  },
  {
    title: 'Finance Suitability',
    icon: Landmark,
    status: 'planned',
    body: 'Compares a property against published lender criteria. Only ever shown with its source and the date it was last checked, and withdrawn when that information goes stale.',
    where: 'Starts once lender product data can be sourced and dated properly.',
  },
]

const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  in_development: 'In development',
  planned: 'Planned',
}

export default function FinanceOverviewPage() {
  const [dark, setDark] = useState(getInitialDark)
  useEffect(() => { return listenTheme(setDark) }, [])
  const c = getDesignColors(dark)

  const statusColor = (s: Status) =>
    s === 'available' ? c.verificationTeal : s === 'in_development' ? c.statusAmber : c.textMuted
  const statusBg = (s: Status) =>
    s === 'available' ? c.verificationTealBg : s === 'in_development' ? c.statusAmberBg : c.surfaceCardHigh

  return (
    <div style={{ background: c.background, color: c.textPrimary, fontFamily: designTokens.font.family, minHeight: '70vh' }}>

      {/* ── HERO ─────────────────────────────────────────── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 24px 40px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: c.intelligencePurple, marginBottom: 18 }}>
          FINANCE INTELLIGENCE
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 5.6vw, 64px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-0.02em', margin: '0 0 22px', maxWidth: 860 }}>
          Understand what an opportunity means financially — before you commit further.
        </h1>
        <p style={{ fontSize: 17, color: c.textMuted, lineHeight: 1.6, maxWidth: 640, margin: 0 }}>
          MANOP makes the financial implications of a property, an investment or a site clearer: what it
          would cost, what it could produce, which assumptions drive the answer, and what is still unknown.
          Lenders make lending decisions. MANOP does not.
        </p>
      </div>

      {/* ── MODULES ──────────────────────────────────────── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 24px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {MODULES.map(m => {
            const Icon = m.icon
            const live = m.status === 'available'
            return (
              <div key={m.title} style={{
                background: c.surfaceCard, border: `1px solid ${c.border}`, borderRadius: 12,
                padding: 24, display: 'flex', flexDirection: 'column', opacity: live ? 1 : 0.92,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <span style={{
                    width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: c.intelligencePurpleBg,
                  }}>
                    <Icon size={20} color={c.intelligencePurple} />
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', padding: '4px 10px',
                    borderRadius: designTokens.radius.full, color: statusColor(m.status), background: statusBg(m.status),
                  }}>
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{m.title}</h2>
                <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.6, margin: '0 0 14px', flex: 1 }}>{m.body}</p>
                <div style={{ fontSize: 12.5, color: c.textFaint, marginBottom: m.href ? 16 : 0, lineHeight: 1.5 }}>{m.where}</div>
                {m.href && (
                  <Link href={m.href} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                    fontSize: 13.5, fontWeight: 700, color: c.intelligencePurple, textDecoration: 'none',
                  }}>
                    {m.cta} <ArrowRight size={15} />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── HOW IT STAYS HONEST ──────────────────────────── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 24px 88px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: c.intelligencePurple, marginBottom: 10 }}>HOW WE KEEP IT HONEST</div>
        <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 800, margin: '0 0 32px', maxWidth: 640, lineHeight: 1.15 }}>
          Every number says where it came from.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { icon: Sigma, title: 'Calculated, not guessed', body: 'Repayments, yields, debt cover and appraisal arithmetic come from a deterministic engine. Language models explain results; they never produce the numbers.' },
            { icon: ShieldCheck, title: 'Sourced and dated', body: 'Anything drawn from a lender or public source carries where it came from and when it was last checked. Stale information is withdrawn, not shown as current.' },
            { icon: CircleHelp, title: 'Unknown stays unknown', body: 'Where evidence is missing, MANOP says so. Your own assumptions are labelled as yours — they are never quietly promoted to facts.' },
          ].map(p => {
            const Icon = p.icon
            return (
              <div key={p.title} style={{ borderTop: `2px solid ${c.intelligencePurple}`, paddingTop: 18 }}>
                <Icon size={20} color={c.intelligencePurple} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
                <div style={{ fontSize: 13.5, color: c.textMuted, lineHeight: 1.6 }}>{p.body}</div>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: 12.5, color: c.textFaint, marginTop: 40, maxWidth: 680, lineHeight: 1.6 }}>
          Everything in Finance Intelligence is indicative and based on the information provided. It is not
          financial, legal or investment advice, and is not a lender decision. Final terms depend on lender
          underwriting, valuation, title review and your eligibility.
        </p>
      </div>
    </div>
  )
}