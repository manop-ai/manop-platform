// lib/mape.ts — MAPE v3 (Activity-Weighted Redesign)
// ═══════════════════════════════════════════════════════════════
// MAPE = Manop Agency Performance Engine (Redesigned)
// Total: 1000 points | All points EARNED through real activity
//
// CORE PRINCIPLE: Reputation must be built, not granted.
// No free points for signing up. Every badge requires proof of work.
//
// WEIGHT PHILOSOPHY (why these allocations):
//
// I = Intelligence / Market Data  (0–350 pts) ← #1 MOST CRITICAL (35%)
//   Verified transactions submitted to market_transactions / property_transactions
//   are MANOP's irreplaceable data asset. Every confirmed sale makes our
//   neighborhood benchmarks more accurate. An agency that submits real,
//   verified sales is giving Manop competitive advantage.
//   WEIGHTED HEAVIEST to incentivize the single most valuable contribution.
//   1 verified transaction = 20 points (need 18 for full)
//   Cannot be faked — requires cross-verification by buyer's agency or Manop team.
//
// P = Performance / Conversion    (0–250 pts) ← #2 (25%)
//   Did leads actually convert? Buyers contacted → viewed → made offers → closed deals?
//   This is proof of sales capability. Only grows through real buyer interactions.
//   Hardest to fake, most meaningful to users trusting your listings.
//   + Reply rate (100 pts) ← responsiveness
//   + Lead advancement (100 pts) ← moving through pipeline
//   + Deal closure (50 pts) ← ultimate proof of sales skill
//
// M = Market Quality             (0–200 pts) ← #3 (20%)
//   Are listings professional? Photos, complete data, realistic pricing, title docs?
//   Affects user experience and platform reputation.
//   Rewards consistent effort across many listings, not just lucky one.
//
// A = Activity                   (0–100 pts) ← #4 (10%) [REDUCED from 120]
//   Is the agency USING the platform? Logins and regular updates matter.
//   Lower weight than transaction/performance/quality because easier to game.
//   But still required — abandoned accounts shouldn't rank high.
//
// E = Ethics / Trust             (0–100 pts) ← #5 (10%) [REDESIGNED, INCREASED from 80]
//   COMPLETELY REDESIGNED to require activity.
//   No free points for "not being bad". All ethics points must be EARNED:
//   + 20 pts for ≥1 verified transaction (prove you exist in market)
//   + 15 pts for verification docs (legal compliance)
//   + 15 pts for ≥50% fee disclosure (transparency)
//   + 15 pts for ≥50% title docs (data completeness)
//   + 15 pts for zero complaints in 180d (reliable)
//   + 10 pts for zero fake listing flags (honest)
//   + 10 pts for professionalism rating (admin trust)
//   PENALTIES: −20 per complaint (can push E negative, floored at 0)
//
// BADGE THRESHOLDS (NEW ACTIVITY-GATED):
//   Listed   (0–399):    No gates. Default state. Points come ONLY from activity.
//   Verified (400–599):  GATES: (I ≥ 40 [2 txns] OR M ≥ 120) + E ≥ 30
//   Trust    (600–799):  GATES: I ≥ 150 [8 txns] + E ≥ 50 + P ≥ 50
//   Elite    (800–1000): GATES: I ≥ 280 [14 txns] + M ≥ 180 + E ≥ 80 + P ≥ 100
//
// WHY THESE GATES?
//   - No badges without transactions (I requirement)
//   - No Trust without active lead handling (P requirement)
//   - No Elite without ethical track record + market contribution (E + M)
//   - Can't "buy" badges with volume in one dimension
// ═══════════════════════════════════════════════════════════════

export type MAPEBadge = 'listed' | 'verified' | 'trust' | 'elite'

export interface MAPEInput {
  // ── I: Intelligence / Transaction Data (0–350) ────────────────
  transactions_verified_90d:       number   // verified closed deals submitted
  unique_neighborhoods_covered:    number   // breadth of market data (bonus: 10 pts per neighborhood, cap 50)

  // ── P: Performance / Conversion (0–250) ──────────────────────
  leads_received_90d:              number
  leads_replied_90d:               number
  leads_advanced_90d:              number   // moved to viewing/negotiation/offer/closed
  deals_closed_90d:                number

  // ── M: Market Quality (0–200) ────────────────────────────────
  listings_total:                  number
  listings_with_images:            number   // count with ≥3 images
  listings_with_price:             number   // count with price filled
  listings_with_beds:              number   // count with bedrooms filled
  listings_with_desc:              number   // count with description ≥50 chars
  listings_with_title_doc:         number   // count with land title specified
  listings_updated_30d:            number   // count updated in last 30d

  // ── A: Activity (0–100) ──────────────────────────────────────
  logins_last_30d:                 number
  days_since_last_login:           number

  // ── E: Ethics (0–100) - ALL POINTS REQUIRE ACTIVITY ────────────
  transactions_verified_any:       number   // have ANY txn? (gates some E points)
  fee_disclosure_pct:              number   // % listings with agency fee disclosed (0–1)
  title_doc_pct:                   number   // % listings with title doc specified (0–1)
  complaints_count_180d:           number
  fake_listing_flags:              number
  verification_status:             'pending' | 'verified' | 'approved' | 'rejected'
  association_membership:          boolean
  association_verified?:           boolean
  professionalism_rating:          number   // 0–5 admin score
}

export interface MAPEResult {
  score_i:     number   // 0–350 Intelligence
  score_p:     number   // 0–250 Performance
  score_m:     number   // 0–200 Market Quality
  score_a:     number   // 0–100 Activity
  score_e:     number   // 0–100 Ethics
  total:       number   // 0–1000
  badge:       MAPEBadge
  tips:        string[] // top 3 actionable improvements
  next_badge:  MAPEBadge | null
  pts_to_next: number
  breakdown: Record<string, number>
}

// ── Badge thresholds & qualification gates ────────────────────
export const BADGE_THRESHOLDS: Record<MAPEBadge, number> = {
  listed:   0,
  verified: 400,
  trust:    600,
  elite:    800,
}

export function scoreToBadge(
  total: number,
  score_i: number,
  score_p: number,
  score_m: number,
  score_e: number,
  hasVerification: boolean
): MAPEBadge {
  // Elite (800+): 14+ transactions + strong market quality + ethics + performance
  if (total >= 800 && score_i >= 280 && score_m >= 180 && score_e >= 80 && score_p >= 100) {
    return 'elite'
  }
  
  // Trust (600+): 8+ transactions + decent ethics + some performance
  if (total >= 600 && score_i >= 150 && score_e >= 50 && score_p >= 50) {
    return 'trust'
  }
  
  // Verified by CAC/legal approval: legal verification should be reflected as soon as the agency has a minimum ethics floor.
  if (hasVerification && score_e >= 30) {
    return 'verified'
  }

  // Verified by activity gates: alternate path for agencies with strong listings + documentation.
  if (total >= 400 && (score_i >= 40 || score_m >= 120) && score_e >= 30 && hasVerification) {
    return 'verified'
  }
  
  return 'listed'
}

export const BADGE_CONFIG: Record<MAPEBadge, {
  label: string
  icon: string
  color: string
  bg: string
  border: string
  description: string
  points: number
}> = {
  listed: {
    label: 'Listed', icon: '○', color: '#94A3B8', points: 0,
    bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)',
    description: 'Active account. Submit transactions, respond to leads, and improve listings to earn trust.',
  },
  verified: {
    label: 'Verified', icon: '◇', color: '#60A5FA', points: 400,
    bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)',
    description: 'Manop has verified your legal documents. Buyers see the Verified badge on your listings.',
  },
  trust: {
    label: 'Trust', icon: '◈', color: '#14B8A6', points: 600,
    bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.2)',
    description: 'Earned through consistent performance, real deal closures, and proven market data contributions.',
  },
  elite: {
    label: 'Elite', icon: '◆', color: '#F59E0B', points: 800,
    bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)',
    description: 'Top tier. Exceptional intelligence contribution, market quality, and buyer satisfaction. Prioritised in all search results.',
  },
}

// ══════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION — ACTIVITY-WEIGHTED V3
// ══════════════════════════════════════════════════════════════
export function computeMAPE(input: MAPEInput): MAPEResult {
  const tips: string[] = []
  let breakdown: Record<string, number> = {}

  // ──────────────────────────────────────────────────────────
  // I: INTELLIGENCE — 0 to 350 pts (35% of total)
  // ──────────────────────────────────────────────────────────
  // ONLY earned through verified transactions
  // 1 verified transaction = 20 points (18 txns = full 360, capped at 350)
  // Cannot be faked — requires Manop verification
  //
  // Sub-components:
  //   Volume    (0–280): 20 pts per verified transaction
  //   Breadth   (0–70):  10 pts per unique neighborhood, cap at 70 (7 neighborhoods)
  let score_i = 0

  // Volume: 20 pts per verified transaction (18 = full)
  const transactionScore = Math.min(280, input.transactions_verified_90d * 20)
  score_i += transactionScore
  breakdown.verified_transactions = input.transactions_verified_90d
  breakdown.transaction_points = transactionScore

  // Breadth: 10 pts per unique neighborhood, cap 70
  const breadthScore = Math.min(70, input.unique_neighborhoods_covered * 10)
  score_i += breadthScore
  breakdown.unique_neighborhoods = input.unique_neighborhoods_covered
  breakdown.breadth_points = breadthScore

  // Tips for Intelligence
  if (input.transactions_verified_90d === 0) {
    tips.push('Submit your first verified transaction — this is the highest-impact action for your Manop score (20 points per transaction). Attach property deed and bank proof.')
  } else {
    tips.push(`Keep submitting verified transactions (${input.transactions_verified_90d} so far). Each one strengthens your market intelligence profile.`)
  }

  score_i = Math.min(350, Math.max(0, score_i))

  // ──────────────────────────────────────────────────────────
  // P: PERFORMANCE — 0 to 250 pts (25% of total)
  // ──────────────────────────────────────────────────────────
  // ONLY earned through real buyer interactions
  // Cannot grow until buyers actually contact you through Manop
  //
  // Sub-components:
  //   Reply rate       (0–100): % of leads that got a reply
  //   Advancement rate (0–100): % of leads that moved beyond "new" status
  //   Deal closure     (0–50):  final proof of sales skill
  let score_p = 0

  // Reply rate: 100 pts for replying to all leads
  if (input.leads_received_90d > 0) {
    const replyRate = input.leads_replied_90d / input.leads_received_90d
    const replyScore = Math.round(Math.min(1, replyRate) * 100)
    score_p += replyScore
    breakdown.reply_rate = Math.round(replyRate * 100)
    breakdown.reply_points = replyScore

    if (replyRate < 1.0) {
      const missed = input.leads_received_90d - input.leads_replied_90d
      tips.push(`You missed ${missed} lead(s) without a reply. Respond to ALL inquiries to earn full 100 performance points.`)
    }
  } else {
    breakdown.reply_rate = 0
    breakdown.reply_points = 0
    tips.push('No inquiries received yet. Ensure all listings have photos, complete data, and realistic pricing to attract buyers.')
  }

  // Lead advancement: 100 pts for moving leads through pipeline
  if (input.leads_received_90d > 0) {
    const advancementRate = input.leads_advanced_90d / input.leads_received_90d
    const advancementScore = Math.round(Math.min(1, advancementRate) * 100)
    score_p += advancementScore
    breakdown.advancement_rate = Math.round(advancementRate * 100)
    breakdown.advancement_points = advancementScore

    if (advancementRate < 0.5) {
      tips.push(`Only ${Math.round(advancementRate * 100)}% of leads moved to viewing/offer stage. Follow up actively to move deals forward.`)
    }
  } else {
    breakdown.advancement_rate = 0
    breakdown.advancement_points = 0
  }

  // Deal closure: 50 pts for closed deals (1 deal = 10 pts, cap at 50)
  const dealScore = Math.min(50, input.deals_closed_90d * 10)
  score_p += dealScore
  breakdown.deals_closed = input.deals_closed_90d
  breakdown.deal_points = dealScore

  score_p = Math.min(250, Math.max(0, score_p))

  // ──────────────────────────────────────────────────────────
  // M: MARKET QUALITY — 0 to 200 pts (20% of total)
  // ──────────────────────────────────────────────────────────
  // Rewards consistent professionalism across all listings
  // Points awarded as percentages of total listings
  let score_m = 0

  if (input.listings_total > 0) {
    // Images: 70%+ listings with 3+ photos = full 60 pts
    const imgPct = input.listings_with_images / input.listings_total
    const imageScore = Math.round(Math.min(1, imgPct / 0.7) * 60)
    score_m += imageScore
    breakdown.image_percentage = Math.round(imgPct * 100)
    breakdown.image_points = imageScore

    if (imgPct < 0.5) {
      tips.push(`Only ${Math.round(imgPct * 100)}% of listings have 3+ photos. Add photos — they increase views by 3×.`)
    }

    // Data completeness: average of (price% + beds% + description%)
    const pricePct = input.listings_with_price / input.listings_total
    const bedsPct = input.listings_with_beds / input.listings_total
    const descPct = input.listings_with_desc / input.listings_total
    const dataCompleteAvg = (pricePct + bedsPct + descPct) / 3
    const dataScore = Math.round(dataCompleteAvg * 60)
    score_m += dataScore
    breakdown.data_complete_avg = Math.round(dataCompleteAvg * 100)
    breakdown.data_points = dataScore

    // Title documentation: % with title doc specified = 40 pts
    const titlePct = input.listings_with_title_doc / input.listings_total
    const titleScore = Math.round(titlePct * 40)
    score_m += titleScore
    breakdown.title_doc_percentage = Math.round(titlePct * 100)
    breakdown.title_points = titleScore

    // Freshness: 50%+ updated in 30d = full 60 pts
    const freshPct = input.listings_updated_30d / input.listings_total
    const freshScore = Math.round(Math.min(1, (freshPct / 0.5)) * 60)
    score_m += freshScore
    breakdown.freshness_percentage = Math.round(freshPct * 100)
    breakdown.freshness_points = freshScore

    if (freshPct < 0.25) {
      tips.push(`Only ${Math.round(freshPct * 100)}% of listings updated in 30 days. Mark sold properties and refresh prices monthly.`)
    }
  } else {
    tips.push('Add your first listings to start earning Market Quality points.')
  }

  score_m = Math.min(200, Math.max(0, score_m))

  // ──────────────────────────────────────────────────────────
  // A: ACTIVITY — 0 to 100 pts (10% of total) [REDUCED from 120]
  // ──────────────────────────────────────────────────────────
  // Platform engagement signal
  // Lower weight because easier to game than I/P/M
  let score_a = 0

  // Logins: 1+ login every 2 days = full 50 pts
  // (15 logins in 30d ÷ 2 = 7-8 days average = healthy)
  const loginScore = Math.min(50, Math.round((input.logins_last_30d / 15) * 50))
  score_a += loginScore
  breakdown.logins_30d = input.logins_last_30d
  breakdown.login_points = loginScore

  if (input.logins_last_30d === 0) {
    tips.push('Log in at least weekly. Inactive accounts appear dormant to buyers even with old listings.')
  }

  // Days since last login: bonus 10 pts if logged in within 7 days
  const lastLoginBonus = input.days_since_last_login <= 7 ? 10 : 0
  score_a += lastLoginBonus
  breakdown.days_since_last_login = input.days_since_last_login
  breakdown.login_recency_bonus = lastLoginBonus

  // Listing activity: 40 pts for maintaining listings (already counted in M freshness)
  // Using updated_30d from M calculation
  const updateScore = (input.listings_updated_30d > 0) ? 40 : 0
  score_a += updateScore
  breakdown.updates_last_30d = input.listings_updated_30d
  breakdown.update_points = updateScore

  score_a = Math.min(100, Math.max(0, score_a))

  // ──────────────────────────────────────────────────────────
  // E: ETHICS — 0 to 100 pts (10% of total) [REDESIGNED]
  // ──────────────────────────────────────────────────────────
  // COMPLETELY REDESIGNED: NO free points for "not being bad"
  // ALL ethics points must be EARNED through activity
  //
  // Sub-components:
  //   Transaction activity (20): ≥1 verified transaction
  //   Verification docs (15): legal approval
  //   Fee disclosure (15): ≥50% listings disclose agency fee
  //   Title documentation (15): ≥50% listings specify title doc
  //   Clean record 180d (15): zero complaints
  //   No fake flags (10): zero fake listing flags
  //   Professionalism (10): admin-assigned 0–5 score
  let score_e = 0

  // +20: Must have at least 1 verified transaction
  if (input.transactions_verified_any > 0) {
    score_e += 20
    breakdown.transaction_activity = 20
  } else {
    breakdown.transaction_activity = 0
    if (input.transactions_verified_90d === 0) {
      tips.push('Submit your first transaction to unlock Ethics points and trust credibility.')
    }
  }

  // +15: Verification documents (legal approval)
  if (input.verification_status === 'verified' || input.verification_status === 'approved') {
    score_e += 15
    breakdown.verification_points = 15
  } else if (input.verification_status === 'pending') {
    breakdown.verification_points = 0
    // tips.push('Complete your verification documents for +15 Ethics points.')  // limit tips to 3
  } else if (input.verification_status === 'rejected') {
    breakdown.verification_points = 0
    tips.push('Resubmit your verification documents. Contact support@manopintel.com for guidance.')
  } else {
    breakdown.verification_points = 0
  }

  // +15: Association-verified membership, or +10 for an active self-declared association membership
  const associationScore = input.association_verified
    ? 15
    : input.association_membership
      ? 10
      : 0

  if (associationScore > 0) {
    score_e += associationScore
    breakdown.association_membership = associationScore
  }

  // +15: Fee disclosure transparency (≥50% of listings)
  const feeDisclosureScore = input.fee_disclosure_pct >= 0.5 ? 15 : Math.round(input.fee_disclosure_pct * 15)
  score_e += feeDisclosureScore
  breakdown.fee_disclosure_pct = Math.round(input.fee_disclosure_pct * 100)
  breakdown.fee_disclosure_points = feeDisclosureScore

  // +15: Title documentation (≥50% of listings)
  const titleDocScore = input.title_doc_pct >= 0.5 ? 15 : Math.round(input.title_doc_pct * 15)
  score_e += titleDocScore
  breakdown.title_disclosure_pct = Math.round(input.title_doc_pct * 100)
  breakdown.title_disclosure_points = titleDocScore

  // +15: Clean complaint record (180 days)
  if (input.complaints_count_180d === 0) {
    score_e += 15
    breakdown.complaint_free_points = 15
  } else {
    breakdown.complaint_free_points = Math.max(0, 15 - (input.complaints_count_180d * 20))
    const penalty = Math.min(15, input.complaints_count_180d * 20)
    score_e -= penalty
    if (input.complaints_count_180d > 0) {
      tips.push(`${input.complaints_count_180d} complaint(s) on record. Resolve immediately — unresolved complaints reduce your Ethics score permanently.`)
    }
  }

  // +10: No fake listing flags
  if (input.fake_listing_flags === 0) {
    score_e += 10
    breakdown.fake_flag_points = 10
  } else {
    breakdown.fake_flag_points = Math.max(0, 10 - (input.fake_listing_flags * 25))
    const flagPenalty = Math.min(10, input.fake_listing_flags * 25)
    score_e -= flagPenalty
    if (input.fake_listing_flags > 0) {
      tips.push(`${input.fake_listing_flags} fake listing flag(s). Remove or correct these immediately — fake listings result in permanent badge suspension.`)
    }
  }

  // +10: Professionalism rating (admin-assigned 0–5 score mapped to 0–10)
  const professionScore = Math.round((input.professionalism_rating / 5) * 10)
  score_e += professionScore
  breakdown.professionalism_rating = input.professionalism_rating
  breakdown.professionalism_points = professionScore

  score_e = Math.min(100, Math.max(0, score_e))

  // ──────────────────────────────────────────────────────────
  // TOTAL + INACTIVITY DECAY + BADGE
  // ──────────────────────────────────────────────────────────
  const rawTotal = score_i + score_p + score_m + score_a + score_e
  const inactivityPeriods = Math.floor(input.days_since_last_login / 90)
  const inactivityDecayPct = Math.min(0.2, inactivityPeriods * 0.02)
  const inactivityPenalty = Math.round((score_p + score_m + score_a + score_e) * inactivityDecayPct)
  const total = Math.max(0, rawTotal - inactivityPenalty)
  if (inactivityPenalty > 0) {
    breakdown.inactivity_decay = -inactivityPenalty
  }

  const hasVerification = input.verification_status === 'verified' || input.verification_status === 'approved'
  const badge = scoreToBadge(total, score_i, score_p, score_m, score_e, hasVerification)

  const badgeOrder: MAPEBadge[] = ['listed', 'verified', 'trust', 'elite']
  const currentIdx = badgeOrder.indexOf(badge)
  const next_badge = badgeOrder[currentIdx + 1] || null
  const pts_to_next = next_badge
    ? Math.max(0, BADGE_THRESHOLDS[next_badge] - total)
    : 0

  breakdown.total_score = total
  breakdown.score_i = score_i
  breakdown.score_p = score_p
  breakdown.score_m = score_m
  breakdown.score_a = score_a
  breakdown.score_e = score_e

  return {
    score_i,
    score_p,
    score_m,
    score_a,
    score_e,
    total,
    badge,
    tips: tips.slice(0, 3),
    next_badge,
    pts_to_next,
    breakdown,
  }
}

// ══════════════════════════════════════════════════════════════
// SCORE BREAKDOWN DISPLAY CONFIG
// For use in dashboard UI
// ══════════════════════════════════════════════════════════════
export const SCORE_DIMENSIONS = [
  {
    key: 'score_i' as const,
    label: 'Intelligence',
    abbr: 'I',
    max: 350,
    color: '#F59E0B',
    icon: '📊',
    why: 'Verified transactions submitted to Manop. The single highest-impact activity. Cannot be faked.',
  },
  {
    key: 'score_p' as const,
    label: 'Performance',
    abbr: 'P',
    max: 250,
    color: '#22C55E',
    icon: '🎯',
    why: 'Real buyer interaction: reply rate, lead advancement, and deal closure. Proof of sales skill.',
  },
  {
    key: 'score_m' as const,
    label: 'Market Quality',
    abbr: 'M',
    max: 200,
    color: '#5B2EFF',
    icon: '🏠',
    why: 'Professional listings: photos, complete data, title docs, and freshness. User experience signal.',
  },
  {
    key: 'score_a' as const,
    label: 'Activity',
    abbr: 'A',
    max: 100,
    color: '#14B8A6',
    icon: '⚡',
    why: 'Platform engagement: logins and listing updates. Shows active participation in Manop.',
  },
  {
    key: 'score_e' as const,
    label: 'Ethics',
    abbr: 'E',
    max: 100,
    color: '#94A3B8',
    icon: '🔒',
    why: 'Integrity: verified transactions, transparency, compliance, and clean record. Reputational foundation.',
  },
]

// ══════════════════════════════════════════════════════════════
// AGENCY RANKING UTILITY
// ══════════════════════════════════════════════════════════════
export interface AgencyRankEntry {
  agency_id:   string
  agency_name: string
  city:        string
  total:       number
  badge:       MAPEBadge
}

export function rankAgencies(entries: AgencyRankEntry[]): (AgencyRankEntry & {
  rank:        number
  rank_label:  string
  percentile:  number
})[] {
  const sorted = [...entries].sort((a, b) => b.total - a.total)
  return sorted.map((e, i) => {
    const percentile = Math.round(100 - (i / sorted.length) * 100)
    const rank_label =
      i === 0                           ? `#1 in ${e.city}` :
      percentile >= 90                  ? `Top 10% in ${e.city}` :
      percentile >= 75                  ? `Top 25% in ${e.city}` :
                                          `Rank #${i + 1} in ${e.city}`
    return { ...e, rank: i + 1, rank_label, percentile }
  })
}

// ══════════════════════════════════════════════════════════════
// SUPABASE UPSERT HELPER
// Call after computing scores to persist to agency_profiles
// ══════════════════════════════════════════════════════════════
export function mapeToDbRow(agencyId: string, result: MAPEResult) {
  return {
    id:                agencyId,
    mape_score:        result.total,
    mape_i:            result.score_i,
    mape_p:            result.score_p,
    mape_m:            result.score_m,
    mape_a:            result.score_a,
    mape_e:            result.score_e,
    badge_level:       result.badge,
    mape_last_computed: new Date().toISOString(),
    mape_breakdown:    result.breakdown,
  }
}