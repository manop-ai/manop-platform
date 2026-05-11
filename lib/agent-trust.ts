// lib/agent-trust.ts — FIXED
// Bug: getUpgradePath was crashing because nextMap['elite'] = 'elite'
// and TRUST_LEVELS['elite'] exists but was being accessed via nextMap[currentLevel]
// when currentLevel === 'elite', nextLevel = 'elite', target = TRUST_LEVELS['elite']
// The real crash: when trust_level in DB is null/undefined/unexpected string,
// mapPartnerTrustLevel returns 'listed', but computeAgentLevel could return a value
// not in the nextMap causing target to be undefined.
// Fix: guard against undefined target, add null safety throughout.

export type AgentLevel = 'elite' | 'trusted' | 'verified' | 'listed'

export interface TrustLevelDefinition {
  level:       AgentLevel
  label:       string
  color:       string
  bg:          string
  border:      string
  icon:        string
  description: string
  criteria:    string[]
  benefits:    string[]
  minListings: number
  minMonths:   number
}

export const TRUST_LEVELS: Record<AgentLevel, TrustLevelDefinition> = {
  elite: {
    level: 'elite', label: 'Elite Partner', color: '#7C5FFF',
    bg: 'rgba(124,95,255,0.1)', border: 'rgba(124,95,255,0.35)', icon: '★',
    description: "Manop's highest trust level. Reserved for agencies with outstanding performance, verified identity, and a proven track record.",
    criteria: [
      'CAC registration verified by Manop',
      'Minimum 24 months as Trusted partner',
      'Minimum 50 active listings',
      'Response rate > 90% within 24 hours',
      'No disputed or removed listings in 12 months',
      'At least 10 verified transaction submissions',
    ],
    benefits: [
      'Elite badge on all listings — highest visibility',
      'Featured placement in search results',
      'Access to institutional buyer leads',
      'Priority data contributor status',
      'Direct Manop partnership account manager',
      'Early access to new platform features',
    ],
    minListings: 50,
    minMonths:   24,
  },
  trusted: {
    level: 'trusted', label: 'Trusted Agency', color: '#22C55E',
    bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', icon: '✓✓',
    description: 'Verified agency with a strong track record on Manop. Active for over 12 months with consistent listing quality.',
    criteria: [
      'Verified identity and business registration',
      'Minimum 12 months as Verified partner',
      'Minimum 20 active listings',
      'Response rate > 80% within 48 hours',
      'No removed or disputed listings in 6 months',
    ],
    benefits: [
      'Trusted badge on all listings',
      'Higher ranking in search results',
      'Access to Manop market intelligence reports',
      'Ability to submit transaction data',
      'Verified data contributor badge (if submitting transactions)',
    ],
    minListings: 20,
    minMonths:   12,
  },
  verified: {
    level: 'verified', label: 'Verified Agency', color: '#14B8A6',
    bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.3)', icon: '✓',
    description: 'Identity-verified agency registered on Manop. Business details confirmed and listing accuracy terms agreed.',
    criteria: [
      'Valid business email confirmed',
      'Agency name and location verified',
      'Agreed to Manop listing accuracy terms',
      'At least 3 active listings on platform',
    ],
    benefits: [
      'Verified badge on all listings',
      'Access to agency dashboard with analytics',
      'Ability to upload property photos',
      'Buyer lead notifications',
    ],
    minListings: 3,
    minMonths:   0,
  },
  listed: {
    level: 'listed', label: 'Listed Agency', color: '#94A3B8',
    bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)', icon: '○',
    description: 'Registered agency on Manop. Has submitted at least one listing. Identity not yet verified.',
    criteria: [
      'Registered on Manop',
      'At least 1 active listing',
    ],
    benefits: [
      'Basic listing visibility on platform',
      'Access to agency dashboard',
    ],
    minListings: 1,
    minMonths:   0,
  },
}

// ── Compute level from partner data ──────────────────────────────────────────
export function computeAgentLevel(opts: {
  listingCount:     number
  monthsActive:     number
  hasCAC:           boolean
  responseRate:     number
  disputedCount:    number
  transactionCount: number
}): AgentLevel {
  const { listingCount, monthsActive, hasCAC, responseRate, disputedCount, transactionCount } = opts

  if (hasCAC && monthsActive >= 24 && listingCount >= 50 && responseRate >= 90 && disputedCount === 0 && transactionCount >= 10) return 'elite'
  if (monthsActive >= 12 && listingCount >= 20 && responseRate >= 80 && disputedCount === 0) return 'trusted'
  if (listingCount >= 3) return 'verified'
  return 'listed'
}

// ── What does this agency need to level up? ──────────────────────────────────
// FIXED: properly handles elite case + undefined target guard
export function getUpgradePath(
  currentLevel: AgentLevel,
  opts: {
    listingCount:     number
    monthsActive:     number
    hasCAC:           boolean
    responseRate:     number
    disputedCount:    number
    transactionCount: number
  }
): { nextLevel: AgentLevel | null; remaining: string[] } {
  // Elite is the ceiling — no upgrade path
  if (currentLevel === 'elite') return { nextLevel: null, remaining: [] }

  const nextMap: Record<AgentLevel, AgentLevel> = {
    listed:   'verified',
    verified: 'trusted',
    trusted:  'elite',
    elite:    'elite',   // never reached — guarded above
  }

  const nextLevel = nextMap[currentLevel]

  // Safety guard: if nextLevel is somehow undefined or same as current at elite
  if (!nextLevel || nextLevel === currentLevel) {
    return { nextLevel: null, remaining: [] }
  }

  const target = TRUST_LEVELS[nextLevel]

  // Second safety guard: target must exist
  if (!target) {
    console.warn(`[agent-trust] TRUST_LEVELS[${nextLevel}] is undefined`)
    return { nextLevel: null, remaining: [] }
  }

  const { listingCount, monthsActive, hasCAC, responseRate, disputedCount, transactionCount } = opts
  const remaining: string[] = []

  if (listingCount < target.minListings) {
    const diff = target.minListings - listingCount
    remaining.push(`Add ${diff} more listing${diff > 1 ? 's' : ''} (need ${target.minListings} total)`)
  }

  if (monthsActive < target.minMonths) {
    const diff = target.minMonths - monthsActive
    remaining.push(`${diff} more month${diff > 1 ? 's' : ''} of active partnership needed`)
  }

  if (nextLevel === 'elite') {
    if (!hasCAC) {
      remaining.push('Submit CAC registration certificate to partners@manopintel.com')
    }
    if (responseRate < 90) {
      remaining.push(`Improve response rate to 90%+ (currently ${responseRate}%)`)
    }
    if (disputedCount > 0) {
      remaining.push(`Resolve ${disputedCount} disputed listing${disputedCount > 1 ? 's' : ''}`)
    }
    if (transactionCount < 10) {
      const diff = 10 - transactionCount
      remaining.push(`Submit ${diff} more verified transaction${diff > 1 ? 's' : ''} via Sales History tab`)
    }
  }

  if (nextLevel === 'trusted') {
    if (responseRate < 80) {
      remaining.push(`Improve response rate to 80%+ (currently ${responseRate}%)`)
    }
    if (disputedCount > 0) {
      remaining.push(`Resolve ${disputedCount} disputed listing${disputedCount > 1 ? 's' : ''}`)
    }
  }

  // If all criteria met, prompt manual review
  if (remaining.length === 0) {
    remaining.push('All criteria met! Email partners@manopintel.com to request your level upgrade review.')
  }

  return { nextLevel, remaining }
}

// ── Badge component data ─────────────────────────────────────────────────────
export function getTrustBadge(level: AgentLevel) {
  const def = TRUST_LEVELS[level] || TRUST_LEVELS['listed']
  return {
    label:  def.label,
    icon:   def.icon,
    color:  def.color,
    bg:     def.bg,
    border: def.border,
  }
}

// ── Map DB trust_level string → internal AgentLevel ──────────────────────────
export function mapPartnerTrustLevel(trustLevel: string | null | undefined): AgentLevel {
  switch (trustLevel?.toLowerCase().trim()) {
    case 'elite':    return 'elite'
    case 'trusted':  return 'trusted'
    case 'verified': return 'verified'
    default:         return 'listed'
  }
}