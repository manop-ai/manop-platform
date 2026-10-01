// lib/decision-engine.ts — Manop Decision Engine
//
// FINANCE INTELLIGENCE PASS — scope: removed computeDealAssessment /
// DealVerdict only (the part of this file that issued a "Buy" /
// "Negotiate" / "Wait" verdict and a specific "suggested offer" number
// for a property). That logic predates Finance Intelligence and
// conflicts with the principle established there: MANOP explains the
// financial position, it doesn't tell the user what to decide. Removed
// rather than patched, since it no longer fits the current business case.
//
// Trust scoring (computeTrustSignal, TRUST_CEILINGS, TRUST_CONFIGS) and
// demand scoring (computeDemandScore) are UNCHANGED in this pass — trust/
// standards work on this engine is being handled separately, not part of
// this Finance Intelligence change.
//
// What replaces the removed piece: computeMarketSignal below reports the
// same underlying numbers (yield vs. benchmark, price vs. median) as
// neutral facts with no verdict attached, and the next step is always to
// run a real Investment Intelligence analysis — the user's own numbers,
// not a MANOP claim — matching how Construction Appraisal and Investment
// Intelligence already frame themselves elsewhere in the app.

import { getYield, getCapRate, getPriceVsMedian, getBenchmarkSync } from './benchmarks'
import { mapPartnerTrustLevel, type AgentLevel } from './agent-trust'

// ─── Types ────────────────────────────────────────────────────

export type TrustLevel = 'elite' | 'trusted' | 'verified' | 'listed' | 'unverified'

export interface TrustSignal {
  level:       TrustLevel
  label:       string
  color:       string
  bg:          string
  explanation: string
  score:       number   // 0–100
}

export interface MarketSignal {
  gross_yield_pct:      number | null
  price_vs_median_pct:  number | null
  benchmark_quality:    'verified' | 'live-computed' | 'estimated' | 'unavailable'
  summary:              string   // neutral, descriptive — never a recommendation
}

// Icon keys, not glyphs — DecisionPanel maps these to lucide-react components.
export type NextStepIcon = 'investment' | 'search'

export interface NextStep {
  primary:    { label: string; action: string; icon: NextStepIcon }
  secondary?: { label: string; action: string; icon: NextStepIcon }
  message:    string
}

export interface PropertyDecision {
  trust:       TrustSignal
  market:      MarketSignal
  next:        NextStep
  demandScore: number
  demandLabel: string
  signals:     string[]
  confidence:  number
}

// ─── Trust score ceilings per agency level (UNCHANGED) ─────────
// No matter how many other signals exist, a "listed" agency cannot
// score above 45. They must earn their way up the trust ladder.

const TRUST_CEILINGS: Record<string, number> = {
  elite:      95,
  trusted:    82,
  verified:   65,
  listed:     45,
  unverified: 30,
}

const TRUST_CONFIGS: Record<string, {
  label: string; color: string; bg: string; explanation: string
}> = {
  elite: {
    label: 'Elite Partner',
    color: '#7C5FFF',
    bg: 'rgba(124,95,255,0.1)',
    explanation: 'Top-performing verified agency — consistent closures, CAC-verified identity, strong buyer reviews and track record.',
  },
  trusted: {
    label: 'Trusted Agency',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.1)',
    explanation: 'Verified agency with 12+ months on Manop, 20+ active listings, and a good response record.',
  },
  verified: {
    label: 'Verified Agency',
    color: '#14B8A6',
    bg: 'rgba(20,184,166,0.1)',
    explanation: 'Identity-verified agency. Business details confirmed and listing accuracy terms agreed.',
  },
  listed: {
    label: 'Listed Agency',
    color: '#94A3B8',
    bg: 'rgba(148,163,184,0.1)',
    explanation: 'Registered on Manop. Identity not yet fully verified. Conduct your own due diligence on title.',
  },
  unverified: {
    label: 'Unverified',
    color: '#F59E0B',
    bg: 'rgba(245,158,11,0.1)',
    explanation: 'Limited information available. Verify title document and agency identity before engaging.',
  },
}

// ─── Trust engine (UNCHANGED) ──────────────────────────────────

export function computeTrustSignal(opts: {
  sourceType:    string | null
  confidence:    number | null
  titleDocument: string | null
  agencyName:    string | null
  daysListed?:   number
  agentLevel?:   TrustLevel
}): TrustSignal {
  const { sourceType, confidence, titleDocument, agencyName, daysListed, agentLevel } = opts

  const baseLevel: TrustLevel = agentLevel || 'listed'
  const ceiling = TRUST_CEILINGS[baseLevel] ?? 30

  const levelBases: Record<string, number> = {
    elite:      88,
    trusted:    72,
    verified:   52,
    listed:     25,
    unverified: 10,
  }
  let score = levelBases[baseLevel] ?? 25

  if (titleDocument) {
    const tdLower = titleDocument.toLowerCase()
    if (tdLower.includes('c of o'))        score += 8
    else if (tdLower.includes('governor')) score += 6
    else if (tdLower.includes('deed'))     score += 4
    else if (tdLower.includes('gazette'))  score += 2
  }

  if (confidence && confidence >= 0.85) score += 5
  else if (confidence && confidence >= 0.7) score += 2

  if (sourceType === 'agent-direct') score += 3

  if (daysListed && daysListed < 30)  score += 2
  if (daysListed && daysListed > 180) score -= 5

  score = Math.min(ceiling, Math.max(0, Math.round(score)))

  const config = TRUST_CONFIGS[baseLevel] || TRUST_CONFIGS.unverified

  return {
    level:       baseLevel,
    label:       config.label,
    color:       config.color,
    bg:          config.bg,
    explanation: config.explanation,
    score,
  }
}

// ─── Market signal (replaces the removed deal-assessment verdict) ──────
// Same underlying numbers as before (yield vs. benchmark, price vs.
// median) but reported as neutral facts — no verdict, no suggested
// offer, no "Buy"/"Negotiate"/"Wait" label. The user forms their own
// view, optionally using Investment Intelligence to model it properly.

export function computeMarketSignal(opts: {
  neighborhood: string
  bedrooms:     number | null
  priceLocal:   number
  listingType:  string | null
  priceVsMedian?: number | null
}): MarketSignal {
  const { neighborhood, bedrooms, priceLocal, listingType, priceVsMedian } = opts

  const isRent = listingType === 'for-rent' || listingType === 'short-let'
  if (isRent) {
    return {
      gross_yield_pct: null,
      price_vs_median_pct: null,
      benchmark_quality: 'unavailable',
      summary: 'This is a rental listing, not a sale. Compare the annual rent against what an equivalent purchase would cost in this neighborhood to assess it as an investment.',
    }
  }

  const yieldPct = getYield(neighborhood, bedrooms)
  const benchmark = getBenchmarkSync(neighborhood)
  const vm = priceVsMedian ?? getPriceVsMedian(neighborhood, bedrooms, priceLocal)

  const quality: MarketSignal['benchmark_quality'] = benchmark
    ? benchmark.quality === 'verified' ? 'verified'
      : benchmark.quality === 'live-computed' ? 'live-computed'
      : 'estimated'
    : 'unavailable'

  const parts: string[] = []
  if (yieldPct != null) parts.push(`${yieldPct.toFixed(1)}% gross yield`)
  if (vm != null) parts.push(`${Math.abs(vm)}% ${vm > 0 ? 'above' : 'below'} the neighborhood median price`)
  const summary = parts.length
    ? `This property is ${parts.join(' and ')}. Run Investment Intelligence for a full picture including your own financing assumptions.`
    : 'Not enough neighborhood data to compute a market signal for this property yet.'

  return {
    gross_yield_pct: yieldPct ?? null,
    price_vs_median_pct: vm ?? null,
    benchmark_quality: quality,
    summary,
  }
}

// ─── Next step engine (simplified — no verdict branching) ──────────────
// Every property gets the same next step now: go run a real analysis.
// The old "investigate title" branch (tied to a dead 'enquiry' no-op
// action in DecisionPanel) is gone along with the verdict system it
// belonged to.

export function computeNextStep(): NextStep {
  return {
    primary:   { label: 'Run Investment Intelligence', action: 'investment-intelligence', icon: 'investment' },
    secondary: { label: 'See similar properties', action: 'search', icon: 'search' },
    message:   'These are market signals, not a recommendation. Run Investment Intelligence to model this property against your own financing assumptions before deciding anything.',
  }
}

// ─── Demand score (UNCHANGED) ───────────────────────────────────

export function computeDemandScore(opts: {
  weeklyViews:     number
  weeklyEnquiries: number
  neighborhood:    string
}): { score: number; label: string; color: string } {
  const { weeklyViews, weeklyEnquiries } = opts
  const weighted = weeklyViews + weeklyEnquiries * 10
  const score    = Math.min(100, Math.round(weighted / 2))

  if (score >= 70) return { score, label: 'Very high demand', color: '#22C55E' }
  if (score >= 45) return { score, label: 'High demand',      color: '#84CC16' }
  if (score >= 20) return { score, label: 'Moderate demand',  color: '#F59E0B' }
  return              { score, label: 'Low demand',           color: '#94A3B8' }
}

// ─── Full decision package ─────────────────────────────────────

export async function buildPropertyDecision(opts: {
  neighborhood:    string
  bedrooms:        number | null
  priceLocal:      number
  listingType:     string | null
  sourceType:      string | null
  confidence:      number | null
  titleDocument:   string | null
  agencyName:      string | null
  agentPhone:      string | null
  daysListed?:     number
  weeklyViews?:    number
  weeklyEnquiries?: number
  agentTrustLevel?: string | null
}): Promise<PropertyDecision> {
  const {
    neighborhood, bedrooms, priceLocal, listingType,
    sourceType, confidence, titleDocument, agencyName,
    daysListed, weeklyViews = 0, weeklyEnquiries = 0, agentTrustLevel,
  } = opts

  const agentLevel = agentTrustLevel
    ? mapPartnerTrustLevel(agentTrustLevel) as TrustLevel
    : 'listed'

  const trust  = computeTrustSignal({ sourceType, confidence, titleDocument, agencyName, daysListed, agentLevel })
  const market = computeMarketSignal({ neighborhood, bedrooms, priceLocal, listingType })
  const next   = computeNextStep()
  const demand = computeDemandScore({ weeklyViews, weeklyEnquiries, neighborhood })

  const signals: string[] = []
  const vm = getPriceVsMedian(neighborhood, bedrooms, priceLocal)
  const gy = getYield(neighborhood, bedrooms)

  if (gy)         signals.push(`${gy.toFixed(1)}% gross yield — ${gy >= 7 ? 'above' : gy >= 5 ? 'meets' : 'below'} benchmark`)
  if (vm !== null) signals.push(`${Math.abs(vm)}% ${vm > 0 ? 'above' : 'below'} neighborhood median`)
  if (titleDocument) signals.push(`Title: ${titleDocument}`)
  if (daysListed)    signals.push(`${daysListed} days on market`)
  if (demand.score > 45) signals.push(demand.label)

  const benchmark = getBenchmarkSync(neighborhood)
  const engineConfidence = benchmark
    ? benchmark.quality === 'verified' ? 85
      : benchmark.quality === 'live-computed' ? 70
      : 50
    : 30

  return {
    trust, market, next,
    demandScore: demand.score,
    demandLabel: demand.label,
    signals,
    confidence: engineConfidence,
  }
}