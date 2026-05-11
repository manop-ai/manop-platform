// lib/mape.ts — MAPE v2
// ═══════════════════════════════════════════════════════════════
// MAPE = Manop Agency Performance Engine
// Total: 1000 points
//
// WEIGHT PHILOSOPHY (why these allocations):
//
// T = Transaction Intelligence  (0–350 pts) ← #1 most important
//   Sales records submitted to market_transactions / property_transactions
//   are the CORE data asset of MANOP. Every confirmed sale makes our
//   neighborhood benchmarks more accurate. An agency that submits
//   verified sales is giving Manop irreplaceable intelligence.
//   This is weighted heaviest to incentivise the right behaviour.
//
// P = Performance / Conversion  (0–250 pts) ← #2
//   Did leads actually convert? Did viewings happen? Did deals close?
//   This is the proof that an agency delivers for buyers.
//   High weight because it's the hardest to fake and most meaningful
//   to users deciding who to trust.
//
// M = Market Quality            (0–200 pts) ← #3
//   Are listings accurate, complete, well-photographed, realistically priced?
//   Important for user experience and data integrity.
//
// A = Activity                  (0–120 pts) ← #4
//   Login frequency, listing freshness, response speed.
//   Important but can be gamed more easily than T and P,
//   so weighted lower than real-world outcomes.
//
// E = Ethics / Excellence       (0–80 pts)  ← #5
//   Complaints, fake listings, verification status.
//   Acts as a floor — bad ethics tanks the total via penalties.
//   Lower base weight because it's more binary (clean record = max).
//
// BADGE THRESHOLDS (out of 1000):
//   Listed   0–399    (just signed up)
//   Verified 400–599  (approved + active)
//   Trust    600–799  (earned through consistent delivery)
//   Elite    800–1000 (top tier — exceptional across all dimensions)
// ═══════════════════════════════════════════════════════════════

export type MAPEBadge = 'listed' | 'verified' | 'trust' | 'elite'

export interface MAPEInput {

  // ── T: Transaction Intelligence (0–350) ──────────────────────
  // The crown jewel. Sales submitted to market_transactions table.
  transactions_submitted_90d:      number   // verified closed deals submitted
  transactions_verified_90d:       number   // subset that passed Manop verification
  transaction_quality_pct:         number   // % with price + date + evidence (0–1)
  unique_neighborhoods_covered:    number   // breadth of market data contributed

  // ── P: Performance / Conversion (0–250) ──────────────────────
  leads_received_90d:              number
  leads_replied_90d:               number
  viewings_booked_90d:             number
  deals_closed_90d:                number   // self-reported via pipeline stage
  median_reply_hours:              number | null

  // ── M: Market Quality (0–200) ────────────────────────────────
  listings_total:                  number
  listings_with_images:            number   // count with ≥3 images
  listings_with_price:             number   // count with price filled
  listings_with_beds:              number   // count with bedrooms filled
  listings_with_desc:              number   // count with description ≥50 chars
  listings_with_title_doc:         number   // count with land title specified
  listings_price_flagged:          number   // count with unrealistic price flag
  listings_duplicates:             number   // admin-detected duplicates

  // ── A: Activity (0–120) ──────────────────────────────────────
  logins_last_30d:                 number
  listings_updated_30d:            number   // count updated in last 30d

  // ── E: Ethics (0–80) ─────────────────────────────────────────
  complaints_count_180d:           number
  fake_listing_flags:              number
  verification_status:             'pending' | 'verified' | 'rejected'
  professionalism_rating:          number   // admin score 0–5
}

export interface MAPEResult {
  score_t:     number   // 0–350
  score_p:     number   // 0–250
  score_m:     number   // 0–200
  score_a:     number   // 0–120
  score_e:     number   // 0–80
  total:       number   // 0–1000
  badge:       MAPEBadge
  tips:        string[] // top 3 actionable improvements
  next_badge:  MAPEBadge | null
  pts_to_next: number
}

// ── Badge thresholds ──────────────────────────────────────────
export const BADGE_THRESHOLDS: Record<MAPEBadge, number> = {
  listed:   0,
  verified: 400,
  trust:    600,
  elite:    800,
}

export function scoreToBadge(total: number): MAPEBadge {
  if (total >= 800) return 'elite'
  if (total >= 600) return 'trust'
  if (total >= 400) return 'verified'
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
    description: 'Basic account. Start listing properties and submitting market data to progress.',
  },
  verified: {
    label: 'Verified', icon: '◇', color: '#60A5FA', points: 400,
    bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.2)',
    description: 'Manop has verified your legal documents. Buyers see the Verified badge on your listings.',
  },
  trust: {
    label: 'Trust', icon: '◈', color: '#14B8A6', points: 600,
    bg: 'rgba(20,184,166,0.1)', border: 'rgba(20,184,166,0.2)',
    description: 'Earned through consistent quality, response speed, and real deal closures.',
  },
  elite: {
    label: 'Elite', icon: '◆', color: '#F59E0B', points: 800,
    bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)',
    description: 'Top tier on Manop. Exceptional across all dimensions. Prioritised in all search results.',
  },
}

// ══════════════════════════════════════════════════════════════
// MAIN SCORING FUNCTION
// ══════════════════════════════════════════════════════════════
export function computeMAPE(input: MAPEInput): MAPEResult {
  const tips: string[] = []

  // ──────────────────────────────────────────────────────────
  // T: TRANSACTION INTELLIGENCE — 0 to 350 pts
  // ──────────────────────────────────────────────────────────
  // Sub-components:
  //   Volume score     (0–120): raw count of transactions submitted
  //   Verified score   (0–100): subset that passed Manop verification
  //   Quality score    (0–80):  completeness of each submission
  //   Breadth score    (0–50):  number of distinct neighborhoods covered
  let score_t = 0

  // Volume: 1 transaction = 15 pts, cap at 120 (8 txns = full volume score)
  const volumeScore = Math.min(120, input.transactions_submitted_90d * 15)
  score_t += volumeScore

  // Verified: 1 verified txn = 20 pts, cap at 100 (5 verified = full)
  const verifiedScore = Math.min(100, input.transactions_verified_90d * 20)
  score_t += verifiedScore

  // Quality: % of submissions with complete fields
  const qualityScore = Math.round(input.transaction_quality_pct * 80)
  score_t += qualityScore

  // Breadth: each unique neighborhood = 10 pts, cap at 50
  const breadthScore = Math.min(50, input.unique_neighborhoods_covered * 10)
  score_t += breadthScore

  // Tips
  if (input.transactions_submitted_90d === 0) {
    tips.push('Submit your first closed sale to market_transactions. This is the single highest-impact action for your Manop score — 15 points per verified transaction.')
  } else if (input.transactions_verified_90d < input.transactions_submitted_90d) {
    const unverified = input.transactions_submitted_90d - input.transactions_verified_90d
    tips.push(`${unverified} transaction submission(s) still pending verification. Attach deed of assignment or bank confirmation to fast-track approval (+${unverified * 20} pts).`)
  }
  if (input.transaction_quality_pct < 0.7 && input.transactions_submitted_90d > 0) {
    tips.push('Improve transaction submission quality: include exact sale date, evidence type, and size (sqm) to maximise your quality score.')
  }

  score_t = Math.min(350, Math.max(0, score_t))

  // ──────────────────────────────────────────────────────────
  // P: PERFORMANCE / CONVERSION — 0 to 250 pts
  // ──────────────────────────────────────────────────────────
  // Sub-components:
  //   Reply rate      (0–80):  leads replied / leads received
  //   Response speed  (0–60):  how fast replies arrive
  //   Viewings        (0–60):  viewings booked signals intent conversion
  //   Deals closed    (0–50):  deals in pipeline → closed_won stage
  let score_p = 0

  // Reply rate
  if (input.leads_received_90d > 0) {
    const replyRate = input.leads_replied_90d / input.leads_received_90d
    score_p += Math.round(Math.min(1, replyRate) * 80)
    if (replyRate < 0.6) {
      tips.push(`You replied to only ${Math.round(replyRate * 100)}% of inquiries. Reply to all leads to earn up to 80 performance points and prevent buyers from going to competitors.`)
    }
  } else {
    tips.push('No leads received yet. Ensure your listings have complete contact details and competitive pricing to attract inquiries.')
  }

  // Response speed
  if (input.median_reply_hours !== null) {
    if      (input.median_reply_hours <= 2)   score_p += 60
    else if (input.median_reply_hours <= 6)   score_p += 50
    else if (input.median_reply_hours <= 24)  score_p += 35
    else if (input.median_reply_hours <= 72)  { score_p += 15; tips.push('Your median response time is over 24 hours. Enable notifications — buyers move fast.') }
    else { tips.push('Response time is critically slow. Under 6 hours is the standard for Trust and Elite agencies.') }
  } else {
    tips.push('Start responding to inquiries inside Manop. Your response time will appear on your profile once measured.')
  }

  // Viewings booked (1 viewing = 10 pts, cap at 60)
  score_p += Math.min(60, input.viewings_booked_90d * 10)

  // Deals closed (1 deal = 10 pts, cap at 50)
  score_p += Math.min(50, input.deals_closed_90d * 10)

  score_p = Math.min(250, Math.max(0, score_p))

  // ──────────────────────────────────────────────────────────
  // M: MARKET QUALITY — 0 to 200 pts
  // ──────────────────────────────────────────────────────────
  // Sub-components:
  //   Images          (0–60):  % of listings with ≥3 images
  //   Data completeness(0–60): price + beds + description all filled
  //   Title document  (0–30):  % with land title specified
  //   Pricing realism (0–30):  inverse of flagged-price ratio
  //   Duplicate penalty        -10 per 5 duplicates detected
  let score_m = 0

  if (input.listings_total > 0) {
    // Images (0–60): 70%+ with images = full score
    const imgPct = input.listings_with_images / input.listings_total
    score_m += Math.round(Math.min(1, imgPct / 0.7) * 60)
    if (imgPct < 0.5) tips.push(`Only ${Math.round(imgPct * 100)}% of your listings have photos. Add at least 3 images per listing — listings with photos get 3× more views.`)

    // Data completeness (0–60): average of price%, beds%, desc%
    const pricePct = input.listings_with_price / input.listings_total
    const bedsPct  = input.listings_with_beds  / input.listings_total
    const descPct  = input.listings_with_desc  / input.listings_total
    const dataAvg  = (pricePct + bedsPct + descPct) / 3
    score_m += Math.round(dataAvg * 60)
    if (dataAvg < 0.7) tips.push('Incomplete listing data detected. Ensure every listing has price, bedrooms, and a description of at least 50 characters.')

    // Title document (0–30)
    const titlePct = input.listings_with_title_doc / input.listings_total
    score_m += Math.round(titlePct * 30)

    // Pricing realism (0–30): 0 flagged = 30, each 10% flagged = -3
    const flagPct = input.listings_price_flagged / input.listings_total
    score_m += Math.max(0, Math.round((1 - flagPct * 3) * 30))
    if (flagPct > 0.15) tips.push(`${Math.round(flagPct * 100)}% of your listings have flagged prices. Review and correct these to improve your Market Quality score.`)

    // Duplicate penalty
    const dupPenalty = Math.floor(input.listings_duplicates / 5) * 10
    if (dupPenalty > 0) {
      score_m = Math.max(0, score_m - dupPenalty)
      tips.push(`${input.listings_duplicates} duplicate listings detected. Remove them to recover ${dupPenalty} Market Quality points.`)
    }
  } else {
    tips.push('Add your first listings to start building your Market Quality score.')
  }

  score_m = Math.min(200, Math.max(0, score_m))

  // ──────────────────────────────────────────────────────────
  // A: ACTIVITY — 0 to 120 pts
  // ──────────────────────────────────────────────────────────
  // Sub-components:
  //   Login frequency (0–40):  logins in last 30d
  //   Listing freshness(0–80): % of listings updated in last 30d
  let score_a = 0

  // Login frequency: 15+ logins/month = full 40 pts
  score_a += Math.min(40, Math.round((input.logins_last_30d / 15) * 40))
  if (input.logins_last_30d < 5) tips.push('Log in more frequently. Active agencies rank higher in search results and receive more leads.')

  // Listing freshness: 50%+ listings updated in 30d = full 80 pts
  if (input.listings_total > 0) {
    const freshPct = input.listings_updated_30d / input.listings_total
    score_a += Math.min(80, Math.round((freshPct / 0.5) * 80))
    if (freshPct < 0.25) tips.push(`Only ${Math.round(freshPct * 100)}% of your listings were updated in the last 30 days. Mark sold listings as sold and refresh prices regularly.`)
  }

  score_a = Math.min(120, Math.max(0, score_a))

  // ──────────────────────────────────────────────────────────
  // E: ETHICS — 0 to 80 pts
  // Acts as a multiplier floor: serious violations tank the total
  // ──────────────────────────────────────────────────────────
  // Sub-components:
  //   Complaint-free  (0–30):  0 complaints = 30, each complaint = -10
  //   No fake flags   (0–30):  0 fake flags = 30, each flag = -15
  //   Verification    (0–15):  verified docs = 15
  //   Professionalism (0–5):   admin-assigned 0–5
  let score_e = 0

  // Complaints
  score_e += Math.max(0, 30 - (input.complaints_count_180d * 10))
  if (input.complaints_count_180d > 0) tips.push(`${input.complaints_count_180d} complaint(s) on record. Resolve these directly with affected parties. Unresolved complaints permanently affect your Ethics score.`)

  // Fake listing flags
  score_e += Math.max(0, 30 - (input.fake_listing_flags * 15))
  if (input.fake_listing_flags > 0) tips.push(`${input.fake_listing_flags} fake listing flag(s). Remove or correct these listings immediately. Fake listings can result in permanent badge downgrade.`)

  // Verification
  if (input.verification_status === 'verified') {
    score_e += 15
  } else if (input.verification_status === 'pending') {
    tips.push('Your CAC documents are pending review. Verification unlocks 15 Ethics points and the Verified badge.')
  } else if (input.verification_status === 'rejected') {
    tips.push('Verification was rejected. Contact support@manopintel.com with updated documents.')
  }

  // Professionalism (0–5)
  score_e += Math.round((input.professionalism_rating / 5) * 5)

  score_e = Math.min(80, Math.max(0, score_e))

  // ──────────────────────────────────────────────────────────
  // TOTAL + BADGE
  // ──────────────────────────────────────────────────────────
  const total = score_t + score_p + score_m + score_a + score_e
  const badge = scoreToBadge(total)

  const badgeOrder: MAPEBadge[] = ['listed', 'verified', 'trust', 'elite']
  const currentIdx = badgeOrder.indexOf(badge)
  const next_badge = badgeOrder[currentIdx + 1] || null
  const pts_to_next = next_badge
    ? Math.max(0, BADGE_THRESHOLDS[next_badge] - total)
    : 0

  return {
    score_t, score_p, score_m, score_a, score_e,
    total,
    badge,
    tips: tips.slice(0, 3),
    next_badge,
    pts_to_next,
  }
}

// ══════════════════════════════════════════════════════════════
// SCORE BREAKDOWN DISPLAY CONFIG
// For use in dashboard UI
// ══════════════════════════════════════════════════════════════
export const SCORE_DIMENSIONS = [
  {
    key: 'score_t' as const,
    label: 'Transaction Intelligence',
    abbr: 'T',
    max: 350,
    color: '#F59E0B',
    icon: '📊',
    why: 'Verified sales submitted to Manop market data. The most valuable contribution you can make.',
  },
  {
    key: 'score_p' as const,
    label: 'Performance',
    abbr: 'P',
    max: 250,
    color: '#22C55E',
    icon: '🎯',
    why: 'Lead reply rate, response speed, viewings booked, and deals closed.',
  },
  {
    key: 'score_m' as const,
    label: 'Market Quality',
    abbr: 'M',
    max: 200,
    color: '#5B2EFF',
    icon: '🏠',
    why: 'Listing completeness, images, realistic pricing, and title documentation.',
  },
  {
    key: 'score_a' as const,
    label: 'Activity',
    abbr: 'A',
    max: 120,
    color: '#14B8A6',
    icon: '⚡',
    why: 'Login frequency and listing freshness. Active agencies rank higher.',
  },
  {
    key: 'score_e' as const,
    label: 'Ethics',
    abbr: 'E',
    max: 80,
    color: '#94A3B8',
    icon: '🔒',
    why: 'Zero complaints, no fake listings, verification status. Acts as a floor on your total.',
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
    mape_t:            result.score_t,
    mape_p:            result.score_p,
    mape_m:            result.score_m,
    mape_a:            result.score_a,
    mape_e:            result.score_e,
    badge_level:       result.badge,
    mape_last_computed: new Date().toISOString(),
  }
}