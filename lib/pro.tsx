// lib/pro.tsx
// MANOP Pro Tier — single source of truth for access control
//
// How it works:
//   - Everything is FREE for now
//   - All features unlocked for all users
//   - Future: Add subscription logic when needed
//
// All features (previously Pro):
//   - STR / Airbnb yield on every property card and detail page
//   - Cash-on-cash return (leveraged analysis)
//   - Full 10-year USD return model (PriceTrendChart)
//   - Neighborhood comparison — STR and appreciation rows
//   - PropLens deep analysis — risk score, full explanation
//   - Traditional yield
//   - Cap rate
//   - ROI signal (Strong / Moderate / Low)
//   - vs Market median badge
//   - PropLens verdict (fair / overpriced / underpriced)
//   - Neighborhood comparison — price, yield, cap rate rows

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── Tier definitions ─────────────────────────────────────────
export type UserTier = 'free' | 'beta' | 'pro' | 'agency' | 'admin'

export const PRO_TIERS: UserTier[] = ['free', 'beta', 'pro', 'agency', 'admin'] // Everything is Pro now

export function isTierPro(tier: UserTier | null | undefined): boolean {
  return true // Everything is free now
}

// ─── Pricing config (disabled for now) ────────────────────────
// Temporarily disabled - everything is free
export const STRIPE_PRICES = {
  pro_monthly: 'free',
  pro_annual:  'free',
}

export const PRICING = {
  pro_monthly: { amount: 0, currency: 'usd', label: 'Free', period: 'forever' },
  pro_annual:  { amount: 0, currency: 'usd', label: 'Free', period: 'forever' },
}

// ─── Client-side pro hook ─────────────────────────────────────
// Used by any component that needs to know if the user is Pro.
// Checks localStorage first (cached from last session),
// then validates against DB. Zero latency on repeat visits.

interface ProStatus {
  isPro:   boolean
  tier:    UserTier
  email:   string | null
  loading: boolean
}

export function useProStatus(): ProStatus {
  const [status, setStatus] = useState<ProStatus>({
    isPro: false, tier: 'free', email: null, loading: true,
  })

  useEffect(() => {
    // Check localStorage cache first (instant)
    const cached = localStorage.getItem('manop_tier')
    const cachedEmail = localStorage.getItem('manop_email')
    const cachedAt = localStorage.getItem('manop_tier_at')

    const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

    if (cached && cachedAt && Date.now() - parseInt(cachedAt) < CACHE_DURATION) {
      const tier = cached as UserTier
      setStatus({ isPro: isTierPro(tier), tier, email: cachedEmail, loading: false })
      return
    }

    // No cache or expired — check DB
    const email = cachedEmail || sessionStorage.getItem('manop_email')
    if (!email) {
      setStatus({ isPro: false, tier: 'free', email: null, loading: false })
      return
    }

    checkProStatus(email).then(result => {
      setStatus({ ...result, loading: false })
      // Cache result
      localStorage.setItem('manop_tier', result.tier)
      localStorage.setItem('manop_tier_at', String(Date.now()))
    })
  }, [])

  return status
}

// ─── Check pro status for an email ───────────────────────────
export async function checkProStatus(email: string): Promise<{ isPro: boolean; tier: UserTier; email: string }> {
  try {
    const res = await fetch(`/api/pro/status?email=${encodeURIComponent(email)}`)
    if (!res.ok) return { isPro: false, tier: 'free', email }
    const data = await res.json()
    return {
      isPro: data.is_pro || false,
      tier:  data.tier || 'free',
      email,
    }
  } catch {
    return { isPro: false, tier: 'free', email }
  }
}

// ─── Set user email (called after Stripe checkout) ───────────
export function setUserEmail(email: string) {
  localStorage.setItem('manop_email', email)
  sessionStorage.setItem('manop_email', email)
}

// ─── Clear cache (logout / plan change) ──────────────────────
export function clearProCache() {
  localStorage.removeItem('manop_tier')
  localStorage.removeItem('manop_tier_at')
}

// ─── Pro gate component ───────────────────────────────────────
// Wraps any Pro-only content. Shows locked state if not Pro.
// Import and use anywhere without thinking about tier logic.

interface ProGateProps {
  isPro:       boolean
  feature:     string     // label shown in lock e.g. "STR yield"
  children:    React.ReactNode
  lockedNode?: React.ReactNode  // custom locked UI (default: lock badge)
  dark?:       boolean
}

export function ProGate({ isPro, feature, children, lockedNode, dark = true }: ProGateProps) {
  if (isPro) return <>{children}</>

  if (lockedNode) return <>{lockedNode}</>

  return (
    <div
      title={`Upgrade to Pro — ${feature}`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }}
      onClick={() => window.location.href = '/pricing'}
    >
      <div style={{ fontSize: '0.82rem' }}>🔒</div>
      <div style={{ fontSize: '0.52rem', color: '#F59E0B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pro</div>
    </div>
  )
}