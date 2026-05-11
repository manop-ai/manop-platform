'use client'
// components/DecisionPanel.tsx
// The most important component in Manop.
// Shows the 3-question verdict on every property detail page.
//
// Q1: Can I trust this property?  → TrustSignal
// Q2: Is this a good deal?        → DealAssessment (BUY/NEGOTIATE/WATCH/AVOID)
// Q3: What should I do next?      → NextStep with guided actions
//
// This is Layer 2 + Layer 3 of the Manop strategy.
// Keep it clear. Keep it simple. Help users decide.

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import {
  buildPropertyDecision,
  type PropertyDecision,
  type DealVerdict,
} from '../lib/decision-engine'

// Fetch agent trust level from Supabase
async function fetchAgentTrustLevel(agencyName: string | null): Promise<string | null> {
  if (!agencyName) return null
  try {
    const response = await fetch(`/api/agent-trust?agency=${encodeURIComponent(agencyName)}`)
    if (response.ok) {
      const data = await response.json()
      return data.trustLevel
    }
  } catch (err) {
    console.error('Failed to fetch agent trust level:', err)
  }
  return null
}

interface Property {
  id:                  string
  neighborhood:        string | null
  bedrooms:            number | null
  price_local:         number | null
  listing_type:        string | null
  source_type:         string | null
  confidence:          number | null
  title_document_type: string | null
  agent_phone:         string | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

interface Props {
  property: Property
  dark:     boolean
}

function formatNGN(n: number): string {
  if (n >= 1e9) return `₦${(n/1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n/1e6).toFixed(0)}M`
  return `₦${Math.round(n/1e3)}K`
}

// Verdict icon
const VERDICT_ICONS: Record<DealVerdict, string> = {
  buy:         '✓',
  negotiate:   '↔',
  watch:       '◎',
  wait:        '⏳',
  investigate: '?',
}

export default function DecisionPanel({ property: p, dark }: Props) {
  const border = dark ? 'rgba(248,250,252,0.08)' : 'rgba(15,23,42,0.08)'
  const text   = dark ? '#F8FAFC' : '#0F172A'
  const text2  = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3  = dark ? 'rgba(248,250,252,0.35)' : 'rgba(15,23,42,0.35)'
  const bg3    = dark ? '#162032' : '#FFFFFF'
  const bg2    = dark ? '#1E293B' : '#F1F5F9'

  const raw        = (p.raw_data || {}) as Record<string, unknown>
  const agencyName = raw['source_agency'] as string | undefined

  // Days listed
  const daysListed = p.created_at
    ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
    : undefined

  // Build the full decision package
  const [decision, setDecision] = useState<PropertyDecision | null>(null)

  useEffect(() => {
    const fetchDecision = async () => {
      const agentTrustLevel = await fetchAgentTrustLevel(agencyName)
      const d = await buildPropertyDecision({
        neighborhood:  p.neighborhood || '',
        bedrooms:      p.bedrooms,
        priceLocal:    p.price_local || 0,
        listingType:   p.listing_type,
        sourceType:    p.source_type,
        confidence:    p.confidence,
        titleDocument: p.title_document_type,
        agencyName:    agencyName || null,
        agentPhone:    p.agent_phone,
        daysListed,
        weeklyViews:   0,    // will come from activity_log in future
        weeklyEnquiries: 0,
        agentTrustLevel,
      })
      setDecision(d)
    }
    fetchDecision()
  }, [p.id])

  if (!decision) return <div>Loading decision...</div>

  const { trust, deal, next, signals, confidence: engineConf } = decision

  // Action handler
  function handleAction(action: string) {
    switch (action) {
      case 'whatsapp':
        if (p.agent_phone) {
          window.open(`https://wa.me/${p.agent_phone.replace(/\D/g, '')}`, '_blank')
        }
        break
      case 'calculator':
        window.open('/calculator', '_blank')
        break
      case 'save':
        const saved = JSON.parse(localStorage.getItem('manop_watchlist') || '[]')
        if (!saved.includes(p.id)) {
          saved.push(p.id)
          localStorage.setItem('manop_watchlist', JSON.stringify(saved))
          alert('Property saved to watchlist!')
        } else {
          alert('Already in watchlist.')
        }
        break
      case 'search':
        window.location.href = `/search?neighborhood=${encodeURIComponent(p.neighborhood || '')}`
        break
      default:
        break
    }
  }

  return (
    <div>

      {/* ── VERDICT CARD (the most important element) ── */}
      <div style={{
        borderRadius: 14,
        border: `2px solid ${deal.color}40`,
        background: deal.bg,
        padding: '1.25rem 1.5rem',
        marginBottom: '0.875rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Verdict badge */}
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: deal.color, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, flexShrink: 0,
            }}>
              {VERDICT_ICONS[deal.verdict]}
            </div>
            <div>
              <div style={{ fontSize: '0.58rem', fontWeight: 700, color: deal.color, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 2 }}>
                Manop verdict
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: deal.color, letterSpacing: '-0.02em' }}>
                {deal.label}
              </div>
            </div>
          </div>

          {/* Confidence pill */}
          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: text3, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', border: `1px solid ${border}`, borderRadius: 20, padding: '3px 9px' }}>
            {engineConf}% confidence
          </div>
        </div>

        {/* Headline */}
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: deal.color, marginBottom: '0.5rem', lineHeight: 1.4 }}>
          {deal.headline}
        </div>

        {/* Reasoning */}
        <div style={{ fontSize: '0.8rem', color: text2, lineHeight: 1.65 }}>
          {deal.reasoning}
        </div>

        {/* Suggested offer (negotiate only) */}
        {deal.suggested_offer && (
          <div style={{ marginTop: '0.875rem', padding: '0.65rem 0.875rem', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>Suggested offer</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#14B8A6' }}>
              {formatNGN(deal.suggested_offer)}
              <span style={{ fontSize: '0.72rem', fontWeight: 400, color: text2, marginLeft: 6 }}>→ yield becomes {deal.yield_at_offer}%</span>
            </div>
          </div>
        )}
      </div>

      {/* ── TRUST SIGNAL ── */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: trust.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: trust.color, background: trust.bg, border: `1px solid ${trust.color}30`, borderRadius: 20, padding: '1px 8px' }}>
              {trust.label}
            </span>
            {agencyName && <span style={{ fontSize: '0.68rem', color: text3 }}>{agencyName}</span>}
          </div>
          <div style={{ fontSize: '0.72rem', color: text2, lineHeight: 1.5 }}>
            {trust.explanation}
          </div>
        </div>
        {/* Trust score bar */}
        <div style={{ flexShrink: 0, textAlign: 'right' as const }}>
          <div style={{ fontSize: '0.62rem', color: text3, marginBottom: 3 }}>Trust</div>
          <div style={{ width: 36, height: 4, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${trust.score}%`, background: trust.color, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: '0.58rem', color: trust.color, marginTop: 2, fontWeight: 600 }}>{trust.score}/100</div>
        </div>
      </div>

      {/* ── KEY SIGNALS ── */}
      {signals.length > 0 && (
        <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>
            Key signals
          </div>
          {signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.78rem', color: text2, marginBottom: i < signals.length - 1 ? 5 : 0 }}>
              <span style={{ color: '#14B8A6', flexShrink: 0, marginTop: 1 }}>→</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── NEXT STEP (What should I do?) ── */}
      <div style={{ background: bg3, border: `1px solid ${border}`, borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '0.875rem' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.5rem' }}>
          What to do next
        </div>
        <div style={{ fontSize: '0.78rem', color: text2, lineHeight: 1.6, marginBottom: '0.875rem' }}>
          {next.message}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
          {/* Save button */}
          <button
            onClick={() => handleAction('save')}
            style={{
              width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
              background: 'rgba(245,158,11,0.1)', border: `1px solid rgba(245,158,11,0.3)`,
              color: '#F59E0B', fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)' }}
          >
            🔖 Save to watchlist
          </button>
          {/* Primary action */}
          <button
            onClick={() => handleAction(next.primary.action)}
            style={{
              width: '100%', background: '#5B2EFF', color: '#fff', border: 'none',
              borderRadius: 9, padding: '0.7rem 1rem', fontSize: '0.82rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <span>{next.primary.icon}</span>
            {next.primary.label}
          </button>

          {/* Secondary action */}
          {next.secondary && (
            <button
              onClick={() => handleAction(next.secondary!.action)}
              style={{
                width: '100%', background: 'transparent', color: text2,
                border: `1px solid ${border}`, borderRadius: 9,
                padding: '0.65rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              }}>
              <span>{next.secondary.icon}</span>
              {next.secondary.label}
            </button>
          )}
        </div>
      </div>

      {/* ── ENGINE DISCLAIMER ── */}
      <div style={{ fontSize: '0.62rem', color: text3, lineHeight: 1.6, padding: '0 0.25rem' }}>
        Verdict computed by Manop intelligence engine from verified listings data.
        {engineConf < 70 && ' Limited data for this area — treat as guidance, not advice.'}
        {' '}Not financial advice. Always conduct independent due diligence.
      </div>
    </div>
  )
}