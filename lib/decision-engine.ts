// lib/decision-engine.ts — Manop Decision Engine (FIXED trust scoring)
//
// FIXES:
// 1. Trust score no longer inflates to 100 for unverified agencies
// 2. agentLevel from data_partners.trust_level is the primary signal
// 3. Listed agencies start at max 45/100 — they must earn higher scores
// 4. Verified (email confirmed, 3+ listings) → 65/100 ceiling
// 5. Trusted (12+ months, 20+ listings) → 82/100
// 6. Elite → 95/100
//
// The decision engine answers 3 questions for every property:
// Q1: Can I trust this property?  → TrustSignal
// Q2: Is this a good deal?        → DealAssessment
// Q3: What should I do next?      → NextStep

import { getYield, getCapRate, getPriceVsMedian, getBenchmarkSync } from './benchmarks'
import { mapPartnerTrustLevel, type AgentLevel } from './agent-trust'

// ─── Types ────────────────────────────────────────────────────

export type TrustLevel = 'elite' | 'trusted' | 'verified' | 'listed' | 'unverified'
export type DealVerdict = 'buy' | 'negotiate' | 'watch' | 'wait' | 'investigate'

export interface TrustSignal {
  level:       TrustLevel
  label:       string
  color:       string
  bg:          string
  explanation: string
  score:       number   // 0–100
}

export interface DealAssessment {
  verdict:          DealVerdict
  label:            string
  color:            string
  bg:               string
  headline:         string
  reasoning:        string
  suggested_offer?: number
  yield_at_offer?:  number
}

export interface NextStep {
  primary:    { label: string; action: string; icon: string }
  secondary?: { label: string; action: string; icon: string }
  message:    string
}

export interface PropertyDecision {
  trust:       TrustSignal
  deal:        DealAssessment
  next:        NextStep
  demandScore: number
  demandLabel: string
  signals:     string[]
  confidence:  number
}

// ─── Trust score ceilings per agency level ────────────────────
// This is the fix: score is BOUNDED by the agency's verified level
// No matter how many other signals exist, a "listed" agency cannot
// score above 45. They must earn their way up the trust ladder.

const TRUST_CEILINGS: Record<string, number> = {
  elite:      95,
  trusted:    82,
  verified:   65,
  listed:     45,   // ← was allowing 100/100 before this fix
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

// ─── Trust engine (FIXED) ─────────────────────────────────────

export function computeTrustSignal(opts: {
  sourceType:    string | null
  confidence:    number | null
  titleDocument: string | null
  agencyName:    string | null
  daysListed?:   number
  agentLevel?:   TrustLevel
}): TrustSignal {
  const { sourceType, confidence, titleDocument, agencyName, daysListed, agentLevel } = opts

  // Determine the base level from the agency's verified status
  // This is the MOST IMPORTANT signal — everything else is supplemental
  const baseLevel: TrustLevel = agentLevel || 'listed'
  const ceiling = TRUST_CEILINGS[baseLevel] ?? 30

  // Start from a base that reflects the agency level
  const levelBases: Record<string, number> = {
    elite:      88,
    trusted:    72,
    verified:   52,
    listed:     25,
    unverified: 10,
  }
  let score = levelBases[baseLevel] ?? 25

  // Supplemental signals — add small amounts but can't exceed ceiling
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
  if (daysListed && daysListed > 180) score -= 5  // stale

  // Apply ceiling — agency level is the hard cap
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

// ─── Deal engine ──────────────────────────────────────────────

export function computeDealAssessment(opts: {
  neighborhood: string
  bedrooms:     number | null
  priceLocal:   number
  listingType:  string | null
  priceVsMedian?: number | null
  benchmark?:   any
}): DealAssessment {
  const { neighborhood, bedrooms, priceLocal, listingType, priceVsMedian } = opts

  const isRent = listingType === 'for-rent' || listingType === 'short-let'

  if (isRent) {
    return {
      verdict:  'watch',
      label:    'Rental',
      color:    '#14B8A6',
      bg:       'rgba(20,184,166,0.1)',
      headline: 'Rental listing — assess against your investment yield target.',
      reasoning: 'This is a rental property, not for sale. To assess deal quality, compare the annual rent against what you would pay to purchase an equivalent property in this neighborhood.',
    }
  }

  const yieldPct = getYield(neighborhood, bedrooms)
  const benchmark = getBenchmarkSync(neighborhood)
  const vm = priceVsMedian ?? getPriceVsMedian(neighborhood, bedrooms, priceLocal)

  let verdict: DealVerdict = 'watch'
  let headline = ''
  let reasoning = ''
  let suggested_offer: number | undefined
  let yield_at_offer: number | undefined

  const gy  = yieldPct || 5.0
  const vm2 = vm || 0

  if (gy >= 7 && vm2 <= 10) {
    verdict  = 'buy'
    headline = `Strong buy — ${gy.toFixed(1)}% yield at or near median price.`
    reasoning = `This property delivers ${gy.toFixed(1)}% gross yield — above the 7% benchmark for quality buy-to-let in ${neighborhood}. The price is ${Math.abs(vm2)}% ${vm2 <= 0 ? 'below' : 'above'} the neighborhood median, which is favorable. Move with confidence but verify title before committing.`
  } else if (gy >= 5 && gy < 7) {
    verdict  = 'negotiate'
    headline = `Negotiate — ${gy.toFixed(1)}% yield needs price adjustment.`
    if (benchmark && bedrooms && benchmark.yields[bedrooms]) {
      const annualRent = (benchmark as any).rent_medians?.[bedrooms] || (priceLocal * 0.05)
      suggested_offer  = Math.round(annualRent / 0.07)
      yield_at_offer   = parseFloat(((annualRent / suggested_offer) * 100).toFixed(1))
    }
    reasoning = `The neighborhood yield benchmark is ${gy.toFixed(1)}%, which is below the 7% target. Negotiate for a lower price to improve your yield. ${suggested_offer ? `Offering ${formatNGN(suggested_offer)} would bring yield to ${yield_at_offer}%.` : 'Try negotiating 10–15% below asking.'}`
  } else if (vm2 >= 10 && vm2 <= 25) {
    verdict  = 'negotiate'
    headline = `Negotiate — price ${vm2}% above median needs adjustment.`
    if (benchmark && bedrooms && benchmark.medians[bedrooms]) {
      suggested_offer = benchmark.medians[bedrooms]
      if (suggested_offer) {
        yield_at_offer = parseFloat(((priceLocal * gy / 100 / suggested_offer) * 100).toFixed(1))
      }
    }
    reasoning = `The property is priced ${vm2}% above the neighborhood median. Negotiate down to median or below. ${suggested_offer ? `Offering ${formatNGN(suggested_offer)} aligns with market value.` : 'Try negotiating to median price.'}`
  } else if (gy < 4 || vm2 > 40) {
    verdict  = 'wait'
    headline = `Wait — ${gy < 4 ? `yield too low (${gy.toFixed(1)}%)` : `price too high (${vm2}% above median)`}.`
    reasoning = `This property ${gy < 4 ? `has a gross yield of ${gy.toFixed(1)}%, below the 4% minimum for viable investment` : `is priced ${vm2}% above the neighborhood median`}. Look for better-priced alternatives or a different neighborhood.`
  } else {
    verdict  = 'watch'
    headline = `Watch — ${gy.toFixed(1)}% yield, ${vm2}% ${vm2 > 0 ? 'above' : 'below'} median.`
    reasoning = `At ${gy.toFixed(1)}% yield and ${vm2}% ${vm2 > 0 ? 'above' : 'below'} the median, this property sits in the middle ground. It may suit a long-term appreciation play or personal use, but the numbers don't yet justify a pure investment purchase at this price.`
  }

  const VERDICT_STYLES: Record<DealVerdict, { color: string; bg: string; label: string }> = {
    buy:         { color: '#22C55E', bg: 'rgba(34,197,94,0.1)',   label: 'Buy'         },
    negotiate:   { color: '#14B8A6', bg: 'rgba(20,184,166,0.1)', label: 'Negotiate'   },
    watch:       { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', label: 'Watch'       },
    wait:        { color: '#EF4444', bg: 'rgba(239,68,68,0.1)',  label: 'Wait'        },
    investigate: { color: '#7C5FFF', bg: 'rgba(124,95,255,0.1)', label: 'Investigate' },
  }

  return {
    verdict,
    label: VERDICT_STYLES[verdict].label,
    color: VERDICT_STYLES[verdict].color,
    bg:    VERDICT_STYLES[verdict].bg,
    headline, reasoning, suggested_offer, yield_at_offer,
  }
}

// ─── Next step engine ─────────────────────────────────────────

export function computeNextStep(verdict: DealVerdict, agentPhone: string | null): NextStep {
  const hasWhatsApp = !!agentPhone

  switch (verdict) {
    case 'buy':
      return {
        primary:   { label: hasWhatsApp ? 'Contact agent on WhatsApp' : 'Send enquiry', action: hasWhatsApp ? 'whatsapp' : 'enquiry', icon: '💬' },
        secondary: { label: 'Run full deal analysis', action: 'calculator', icon: '🧮' },
        message:   'This deal meets the benchmarks. Contact the agent to confirm availability and arrange a viewing. Run the deal analysis before signing anything.',
      }
    case 'negotiate':
      return {
        primary:   { label: 'Run deal analysis first', action: 'calculator', icon: '🧮' },
        secondary: { label: hasWhatsApp ? 'Contact agent' : 'Send enquiry', action: hasWhatsApp ? 'whatsapp' : 'enquiry', icon: '💬' },
        message:   'Run the deal analysis to model your offer price. Then contact the agent with a clear counter-offer based on the yield numbers.',
      }
    case 'watch':
      return {
        primary:   { label: 'Save to watchlist', action: 'save', icon: '🔖' },
        secondary: { label: 'See similar properties', action: 'search', icon: '🔍' },
        message:   'Not a strong deal at this price. Save it and check back — prices sometimes adjust. Meanwhile, explore better-priced options in this neighborhood.',
      }
    case 'wait':
      return {
        primary: { label: 'Find better deals', action: 'search', icon: '🔍' },
        message: 'Move on from this one. Search for properties in the same neighborhood at a more realistic price point, or explore a neighboring area with better yield fundamentals.',
      }
    default:
      return {
        primary: { label: 'Investigate title', action: 'enquiry', icon: '🔎' },
        message: 'Limited information available. Ask the agent to confirm the title document and property history before going further.',
      }
  }
}

// ─── Demand score ─────────────────────────────────────────────

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
    sourceType, confidence, titleDocument, agencyName, agentPhone,
    daysListed, weeklyViews = 0, weeklyEnquiries = 0, agentTrustLevel,
  } = opts

  // Map from DB string to internal AgentLevel type
  const agentLevel = agentTrustLevel
    ? mapPartnerTrustLevel(agentTrustLevel) as TrustLevel
    : 'listed'  // default: listed, not unverified — registered agencies start here

  const trust  = computeTrustSignal({ sourceType, confidence, titleDocument, agencyName, daysListed, agentLevel })
  const deal   = computeDealAssessment({ neighborhood, bedrooms, priceLocal, listingType })
  const next   = computeNextStep(deal.verdict, agentPhone)
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
    trust, deal, next,
    demandScore: demand.score,
    demandLabel: demand.label,
    signals,
    confidence: engineConfidence,
  }
}

// ─── Helper ────────────────────────────────────────────────────
function formatNGN(n: number): string {
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(0)}M`
  return `₦${Math.round(n / 1e3)}K`
}

export { formatNGN }