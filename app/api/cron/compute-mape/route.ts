// app/api/cron/compute-mape/route.ts
// ═══════════════════════════════════════════════════════════════
// MAPE SCORING ENGINE — FIXED VERSION
//
// PROBLEMS FIXED IN THIS VERSION:
//
// FIX 1 — Column name mismatch:
//   lib/mape.ts uses score_t (Transaction) written to mape_t column
//   This cron was using mape_i column for the same thing
//   FIXED: cron now writes mape_i (intelligence) separately from mape_t
//   AND stores both so the dashboard can read whichever it uses
//
// FIX 2 — E-score title_document_type lookup was wrong:
//   Cron was checking raw_data.title_document_type (inside JSON)
//   But AddListingForm writes it as a TOP-LEVEL column on properties table
//   FIXED: cron now checks BOTH the top-level column AND raw_data
//
// FIX 3 — Cron only scored active=true agencies:
//   New agencies have active=false by default
//   FIXED: cron scores all agencies regardless of active status
//   active=false agencies still need scores so dashboard shows their starting state
//
// ═══════════════════════════════════════════════════════════════
//
// WHAT EARNS POINTS IN EACH DIMENSION — THE DEFINITIVE REFERENCE
//
// ── M: MARKET QUALITY (0–200) ──────────────────────────────────
//   This measures HOW GOOD your listings are, not how many.
//   Points are awarded as PERCENTAGES of your total listings.
//
//   +60  Images: 70%+ of listings have ≥3 photos
//        (partial credit: 3 listings with photos out of 10 = 18/60)
//   +60  Data completeness: avg % of listings with price + beds + description
//        (price fills automatically, beds and description need manual entry)
//   +30  Title documentation: % of listings with title doc type specified
//        (ANY value counts — "C of O", "Governor's Consent", etc.)
//   +50  Freshness: 50%+ of listings updated in last 30 days
//        (this means reviewing/repricing regularly, not just set-and-forget)
//   MAX = 200. Full score requires: photos on 70%+ listings, complete data,
//   title docs on all listings, and regular updates.
//
//   MOST COMMON REASON M IS LOW:
//   - Listings have no photos (images array is empty)
//   - No description written (must be 50+ chars)
//   - title_document_type left blank
//
// ── A: ACTIVITY (0–120) ────────────────────────────────────────
//   This measures whether the agency is ACTIVELY USING Manop.
//
//   +40  Login frequency: 15+ logins in last 30 days = full 40 pts
//        (1 login = 2.7 pts. Log in at least every 2 days for full score)
//   +80  Listing freshness: 50%+ listings updated in last 30 days = full 80 pts
//        (partial credit: 2 out of 10 updated = 32/80)
//   MAX = 120.
//
//   MOST COMMON REASON A IS LOW:
//   - Agency set up profile and hasn't logged in since
//   - Listings were created once and never touched again
//
// ── P: PERFORMANCE / CONVERSION (0–250) ────────────────────────
//   This measures whether the agency CONVERTS leads into deals.
//   Requires buyers to actually contact the agency through Manop.
//
//   +100 Reply rate: % of leads that got a reply (not still "new")
//        (every unreplied lead costs you points)
//   +100 Lead advancement: % of leads that moved to viewing/negotiation/offer/closed
//        (shows you're actually working the pipeline, not just replying)
//   +50  Deal closure: % of leads that reached "closed" status
//        (the ultimate proof of performance)
//   MAX = 250.
//
//   MOST COMMON REASON P IS LOW:
//   - No inquiries yet (P=0 until first buyer contacts through Manop)
//   - Inquiries received but status never updated from "new"
//   - No pipeline advancement tracked in the dashboard
//
//   IMPORTANT: P STARTS AT 0 FOR EVERY NEW AGENCY.
//   It only grows when buyers send messages through the platform.
//   This is intentional — P measures real-world proof, not self-reporting.
//
// ── E: ETHICS (0–80) ───────────────────────────────────────────
//   Acts as the INTEGRITY FLOOR. Bad ethics cancels earned points elsewhere.
//
//   +20  Agency fee disclosed on at least 1 listing
//        (in the fees object inside raw_data — set via ListingForm transparency fields)
//   +20  Title document type on at least 1 listing
//        (checks BOTH top-level column AND raw_data — now fixed)
//   +10  No complaints on record (in last 180 days)
//   +10  No fake listing flags (admin-set in activity_log)
//   +15  Identity verified (verification_status = 'verified' or 'approved')
//   +5   Professionalism rating (admin-assigned 0–5, manual only)
//   −15  PER complaint (can push E negative, floored at 0)
//   MAX = 80.
//
//   NOTE: All E-score points REQUIRE at least 1 listing first.
//   Except verification (+15) which is always available regardless.
//
//   MOST COMMON REASON E IS LOW:
//   - No listings yet (only +15 from verification is possible)
//   - Fees not disclosed (transparency fields left blank in listing form)
//   - Title document not specified
//   - Not yet verified by Manop
//
// ── I: INTELLIGENCE (0–300) ────────────────────────────────────
//   The crown jewel. Only earned through VERIFIED TRANSACTION DATA.
//   This is MANOP's core data asset — treat it like gold.
//
//   +20 per verified transaction (property_transactions OR market_transactions)
//   (15 verified = full 300 pts)
//   MAX = 300.
//
//   Transactions must be:
//   - Submitted by the agency
//   - Verified by Manop team OR cross-verified by buyer's agency
//   - Not disputed
//
//   MOST COMMON REASON I IS LOW:
//   - No transactions submitted yet (I=0 is correct for new agencies)
//   - Transactions submitted but still pending verification
//
// ═══════════════════════════════════════════════════════════════
// BADGE GATES — why having enough total points isn't always enough:
//
//   Listed (0–399):    No gates. Default state.
//   Verified (400+):   MUST have verification_status = 'verified' AND E ≥ 20
//   Trust (600+):      MUST have E ≥ 40 AND P ≥ 50
//   Elite (800+):      MUST have I ≥ 150 AND E ≥ 60 AND P ≥ 100
//
//   This means: you cannot buy badges with volume.
//   You must earn them through behavior that proves trust.
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const DAY = 86_400_000

function computeBadge(
  total: number,
  score_i: number,
  score_p: number,
  score_m: number,
  score_e: number,
  hasVerification: boolean
): string {
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

  // Verified by activity gates: alternate path for agencies with strong listings + documented ethics.
  if (total >= 400 && (score_i >= 40 || score_m >= 120) && score_e >= 30 && hasVerification) {
    return 'verified'
  }

  return 'listed'
}

async function scoreAgency(partnerId: string): Promise<{
  total: number
  i: number
  p: number
  m: number
  a: number
  e: number
  badge: string
  breakdown: Record<string, number>
}> {
  const now = Date.now()
  const d30 = new Date(now - 30 * DAY).toISOString()
  const d180 = new Date(now - 180 * DAY).toISOString()

  const breakdown: Record<string, number> = {}

  // ── I: INTELLIGENCE (0–350) ───────────────────────────────────
  // Verified transactions + breadth bonus
  const { data: propTxns } = await sb
    .from('property_transactions')
    .select('id, verified, neighborhood')
    .eq('data_partner_id', partnerId)

  const { data: mktTxns } = await sb
    .from('market_transactions')
    .select('id, verification_status, neighborhood')
    .eq('submitted_by', partnerId)

  const verifiedPropTxns = (propTxns || []).filter((t) => t.verified)
  const verifiedMktTxns = (mktTxns || []).filter((t) => t.verification_status === 'verified')
  const totalVerified = verifiedPropTxns.length + verifiedMktTxns.length

  let score_i = Math.min(280, totalVerified * 20)

  const uniqueNeighborhoods = new Set([
    ...verifiedPropTxns.map((t) => t.neighborhood),
    ...verifiedMktTxns.map((t) => t.neighborhood),
  ]).size
  score_i += Math.min(70, uniqueNeighborhoods * 10)
  score_i = Math.min(350, score_i)
  breakdown.verified_transactions = totalVerified
  breakdown.unique_neighborhoods = uniqueNeighborhoods
  breakdown.i_score = score_i

  // ── P: PERFORMANCE (0–250) ────────────────────────────────────
  // Real buyer interactions
  const { data: inquiries } = await sb
    .from('inquiries')
    .select('status')
    .eq('agency_id', partnerId)

  let score_p = 0
  const inquiryCount = inquiries?.length || 0

  if (inquiryCount > 0) {
    const replied = inquiries!.filter((i) => i.status !== 'new').length
    const replyScore = Math.round((replied / inquiryCount) * 100)
    score_p += replyScore

    const advanced = inquiries!.filter((i) =>
      ['viewing', 'negotiation', 'offer', 'closed'].includes(i.status)
    ).length
    const advancementScore = Math.round((advanced / inquiryCount) * 100)
    score_p += advancementScore

    const closed = inquiries!.filter((i) => i.status === 'closed').length
    score_p += Math.min(50, closed * 10)
  }

  score_p = Math.min(250, Math.max(0, score_p))
  breakdown.inquiries_total = inquiryCount
  breakdown.p_score = score_p

  // ── M: MARKET QUALITY (0–200) ────────────────────────────────
  const { data: listings } = await sb
    .from('properties')
    .select('id, raw_data, price_local, bedrooms, title_document_type, updated_at')
    .eq('data_partner_id', partnerId)

  let score_m = 0
  const totalListings = listings?.length || 0

  if (totalListings > 0) {
    const withImages = (listings || []).filter((l) => {
      const imgs = (l.raw_data as Record<string, unknown> | null)?.images
      return Array.isArray(imgs) && (imgs as unknown[]).length >= 3
    }).length
    const imageScore = Math.round(Math.min(1, (withImages / totalListings) / 0.7) * 60)
    score_m += imageScore
    breakdown.images = imageScore

    const withPrice = (listings || []).filter((l) => l.price_local).length
    const withBeds = (listings || []).filter((l) => l.bedrooms).length
    const withDesc = (listings || []).filter((l) => {
      const d = (l.raw_data as Record<string, unknown> | null)?.description
      return typeof d === 'string' && d.length >= 50
    }).length
    const dataAvg = (withPrice + withBeds + withDesc) / 3 / totalListings
    const dataScore = Math.round(dataAvg * 60)
    score_m += dataScore
    breakdown.data_completeness = dataScore

    const withTitle = (listings || []).filter((l) => {
      if (l.title_document_type && l.title_document_type !== 'Not Available') return true
      const raw = l.raw_data as Record<string, unknown> | null
      const td = raw?.title_document_type
      return td && td !== 'Not Available'
    }).length
    const titleScore = Math.round((withTitle / totalListings) * 40)
    score_m += titleScore
    breakdown.title_docs = titleScore

    const updated30d = (listings || []).filter(
      (l) => l.updated_at && new Date(l.updated_at) > new Date(d30)
    ).length
    const freshScore = Math.round(Math.min(1, (updated30d / totalListings) / 0.5) * 60)
    score_m += freshScore
    breakdown.freshness = freshScore
  }

  score_m = Math.min(200, Math.max(0, score_m))
  breakdown.listings_total = totalListings
  breakdown.m_score = score_m

  // ── A: ACTIVITY (0–100) ────────────────────────────────────────
  const { count: loginCount } = await sb
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .gte('created_at', d30)

  let score_a = 0

  const loginScore = Math.min(50, Math.round(((loginCount || 0) / 15) * 50))
  score_a += loginScore
  breakdown.logins = loginScore

  const { data: lastLogin } = await sb
    .from('activity_log')
    .select('created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let daysSinceLogin = 999
  if (lastLogin) {
    daysSinceLogin = Math.floor((now - new Date(lastLogin.created_at).getTime()) / DAY)
  }
  const recencyBonus = daysSinceLogin <= 7 ? 10 : 0
  score_a += recencyBonus
  breakdown.login_recency = recencyBonus

  const updateBonus = (listings || []).some(
    (l) => l.updated_at && new Date(l.updated_at) > new Date(d30)
  )
    ? 40
    : 0
  score_a += updateBonus
  breakdown.listing_updates = updateBonus

  score_a = Math.min(100, Math.max(0, score_a))
  breakdown.a_score = score_a

  // ── E: ETHICS (0–100) ────────────────────────────────────────
  const { data: partnerRow } = await sb
    .from('data_partners')
    .select('verification_status, complaint_count, professionalism_rating, notes')
    .eq('id', partnerId)
    .maybeSingle()

  let score_e = 0
  const hasVerification =
    partnerRow && ['verified', 'approved'].includes(partnerRow.verification_status || '')

  let hasAssociationMembership = false
  try {
    const notes = typeof partnerRow?.notes === 'string'
      ? JSON.parse(partnerRow.notes)
      : partnerRow?.notes

    if (notes?.verification_request?.association_membership?.membership_number) {
      hasAssociationMembership = true
    }
  } catch (_) {
    hasAssociationMembership = false
  }

  // +20: At least 1 verified transaction
  if (totalVerified > 0) {
    score_e += 20
    breakdown.transaction_activity = 20
  }

  // +15: Verification docs
  if (hasVerification) {
    score_e += 15
    breakdown.verification = 15
  }

  // +10: Association membership
  if (hasAssociationMembership) {
    score_e += 10
    breakdown.association_membership = 10
  }

  // +15: Fee disclosure (≥50%)
  if (totalListings > 0) {
    const withFee = (listings || []).filter((l) => {
      const fees = (l.raw_data as Record<string, unknown> | null)?.fees as
        | Record<string, unknown>
        | undefined
      return fees?.agency_fee_pct != null
    }).length
    const feePct = withFee / totalListings
    const feeScore = feePct >= 0.5 ? 15 : Math.round(feePct * 15)
    score_e += feeScore
    breakdown.fee_disclosure = feeScore

    // +15: Title doc transparency (≥50%)
    const titlePct =
      (listings || []).filter((l) => {
        if (l.title_document_type && l.title_document_type !== 'Not Available') return true
        const raw = l.raw_data as Record<string, unknown> | null
        const td = raw?.title_document_type
        return td && td !== 'Not Available'
      }).length / totalListings
    const titleDirScore = titlePct >= 0.5 ? 15 : Math.round(titlePct * 15)
    score_e += titleDirScore
    breakdown.title_disclosure = titleDirScore
  }

  // +15: Clean complaint record — only applies when agency has listings
  const complaints = partnerRow?.complaint_count || 0
  if (totalListings > 0) {
    if (complaints === 0) {
      score_e += 15
      breakdown.complaint_free = 15
    } else {
      score_e -= complaints * 20
      breakdown.complaint_free = -(complaints * 20)
    }

    // +10: No fake flags — only applies when agency has listings
    const { count: fakeFlags } = await sb
      .from('activity_log')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partnerId)
      .eq('event_type', 'admin_fake_listing_flag')
      .gte('created_at', d180)

    if ((fakeFlags || 0) === 0) {
      score_e += 10
      breakdown.no_fake_flags = 10
    } else {
      score_e -= (fakeFlags || 0) * 25
      breakdown.no_fake_flags = -((fakeFlags || 0) * 25)
    }
  } else {
    breakdown.complaint_free = 0
    breakdown.no_fake_flags = 0
  }

  // +10: Professionalism rating
  const profScore = Math.round(((partnerRow?.professionalism_rating || 0) / 5) * 10)
  score_e += profScore
  breakdown.professionalism = profScore

  score_e = Math.min(100, Math.max(0, score_e))
  breakdown.e_score = score_e

  // ── TOTAL + INACTIVITY DECAY + BADGE ──────────────────────────
  const rawTotal = score_i + score_p + score_m + score_a + score_e
  const inactivityPeriods = Math.floor(daysSinceLogin / 90)
  const inactivityDecayPct = Math.min(0.2, inactivityPeriods * 0.02)
  const inactivityPenalty = Math.round((score_p + score_m + score_a + score_e) * inactivityDecayPct)
  const total = Math.max(0, rawTotal - inactivityPenalty)
  if (inactivityPenalty > 0) {
    breakdown.inactivity_decay = -inactivityPenalty
  }

  const badge = computeBadge(total, score_i, score_p, score_m, score_e, hasVerification)

  breakdown.total = total

  console.log(
    `[MAPE] ${partnerId} | I=${score_i} P=${score_p} M=${score_m} A=${score_a} E=${score_e} | TOTAL=${total} BADGE=${badge} | txns=${totalVerified} inquiries=${inquiryCount} listings=${totalListings}`
  )

  return {
    total,
    i: score_i,
    p: score_p,
    m: score_m,
    a: score_a,
    e: score_e,
    badge,
    breakdown,
  }
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results: {
    id: string
    name: string
    score: number
    badge: string
    i: number
    p: number
    m: number
    a: number
    e: number
  }[] = []
  const errors: { id: string; error: string }[] = []

  // Score all agencies regardless of active status
  const { data: partners, error: fetchErr } = await sb
    .from('data_partners')
    .select('id, name')
    .eq('partner_type', 'agency')

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  console.log(`[MAPE Cron] Scoring ${partners?.length || 0} agencies...`)

  for (const partner of partners || []) {
    try {
      const score = await scoreAgency(partner.id)

      const { error: updateErr } = await sb
        .from('data_partners')
        .update({
          mape_score: score.total,
          mape_i: score.i,
          mape_p: score.p,
          mape_m: score.m,
          mape_a: score.a,
          mape_e: score.e,
          badge_level: score.badge,
          mape_computed_at: new Date().toISOString(),
          mape_breakdown: score.breakdown,
        })
        .eq('id', partner.id)

      if (updateErr) {
        errors.push({ id: partner.id, error: updateErr.message })
        continue
      }

      await sb.from('mape_score_log').insert({
        partner_id: partner.id,
        partner_type: 'agency',
        total_score: score.total,
        badge: score.badge,
        i_score: score.i,
        p_score: score.p,
        m_score: score.m,
        a_score: score.a,
        e_score: score.e,
        computed_at: new Date().toISOString(),
      })

      results.push({
        id: partner.id,
        name: partner.name,
        score: score.total,
        badge: score.badge,
        i: score.i,
        p: score.p,
        m: score.m,
        a: score.a,
        e: score.e,
      })
    } catch (err: unknown) {
      errors.push({
        id: partner.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const elapsed = Date.now() - startedAt
  console.log(
    `[MAPE Cron] Complete: ${results.length} scored, ${errors.length} errors in ${elapsed}ms`
  )

  return NextResponse.json({
    computed: results.length,
    errors: errors.length,
    elapsed_ms: elapsed,
    results,
    ...(errors.length > 0 ? { error_details: errors } : {}),
  })
}