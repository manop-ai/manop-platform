// app/api/cron/compute-mape/route.ts — FINAL WITH SIGNAL INTELLIGENCE
// This is the complete merged file:
// - Original MAPE scoring engine (unchanged)
// - + Neighborhood intelligence computation
// - + Platform intelligence computation  
// - + Association intelligence computation
// - + Signal expiration

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const DAY = 86_400_000

function computeBadge(
  total: number, score_i: number, score_p: number,
  score_m: number, score_e: number, hasVerification: boolean
): string {
  if (total >= 800 && score_i >= 280 && score_m >= 180 && score_e >= 80 && score_p >= 100) return 'elite'
  if (total >= 600 && score_i >= 150 && score_e >= 50 && score_p >= 50) return 'trust'
  if (hasVerification && score_e >= 30) return 'verified'
  if (total >= 400 && (score_i >= 40 || score_m >= 120) && score_e >= 30 && hasVerification) return 'verified'
  return 'listed'
}

async function scoreAgency(partnerId: string): Promise<{
  total: number; i: number; p: number; m: number; a: number; e: number
  badge: string; breakdown: Record<string, number>
}> {
  const now = Date.now()
  const d30  = new Date(now - 30  * DAY).toISOString()
  const d180 = new Date(now - 180 * DAY).toISOString()
  const breakdown: Record<string, number> = {}

  // ── I: INTELLIGENCE (0–350) ──────────────────────────────────
  const { data: propTxns } = await sb.from('property_transactions')
    .select('id, verified, neighborhood').eq('data_partner_id', partnerId)
  const { data: mktTxns } = await sb.from('market_transactions')
    .select('id, verification_status, neighborhood').eq('submitted_by', partnerId)
  const verifiedPropTxns = (propTxns || []).filter(t => t.verified)
  const verifiedMktTxns  = (mktTxns  || []).filter(t => t.verification_status === 'verified')
  const totalVerified = verifiedPropTxns.length + verifiedMktTxns.length
  let score_i = Math.min(280, totalVerified * 20)
  const uniqueNeighborhoods = new Set([
    ...verifiedPropTxns.map(t => t.neighborhood),
    ...verifiedMktTxns.map(t => t.neighborhood),
  ]).size
  score_i += Math.min(70, uniqueNeighborhoods * 10)
  score_i = Math.min(350, score_i)
  breakdown.verified_transactions = totalVerified
  breakdown.unique_neighborhoods  = uniqueNeighborhoods
  breakdown.i_score = score_i

  // ── P: PERFORMANCE (0–250) ───────────────────────────────────
  const { data: inquiries } = await sb.from('inquiries')
    .select('status').eq('agency_id', partnerId)
  let score_p = 0
  const inquiryCount = inquiries?.length || 0
  if (inquiryCount > 0) {
    const replied    = inquiries!.filter(i => i.status !== 'new').length
    const advanced   = inquiries!.filter(i => ['viewing','negotiation','offer','closed'].includes(i.status)).length
    const closed     = inquiries!.filter(i => i.status === 'closed').length
    score_p += Math.round((replied   / inquiryCount) * 100)
    score_p += Math.round((advanced  / inquiryCount) * 100)
    score_p += Math.min(50, closed * 10)
  }
  score_p = Math.min(250, Math.max(0, score_p))
  breakdown.inquiries_total = inquiryCount
  breakdown.p_score = score_p

  // ── M: MARKET QUALITY (0–200) ────────────────────────────────
  const { data: listings } = await sb.from('properties')
    .select('id, raw_data, price_local, bedrooms, title_document_type, updated_at')
    .eq('data_partner_id', partnerId)
  let score_m = 0
  const totalListings = listings?.length || 0
  if (totalListings > 0) {
    const withImages = (listings || []).filter(l => {
      const imgs = (l.raw_data as any)?.images
      return Array.isArray(imgs) && imgs.length >= 3
    }).length
    score_m += Math.round(Math.min(1, (withImages / totalListings) / 0.7) * 60)
    const withPrice = (listings || []).filter(l => l.price_local).length
    const withBeds  = (listings || []).filter(l => l.bedrooms).length
    const withDesc  = (listings || []).filter(l => {
      const d = (l.raw_data as any)?.description
      return typeof d === 'string' && d.length >= 50
    }).length
    score_m += Math.round(((withPrice + withBeds + withDesc) / 3 / totalListings) * 60)
    const withTitle = (listings || []).filter(l => {
      if (l.title_document_type && l.title_document_type !== 'Not Available') return true
      const td = (l.raw_data as any)?.title_document_type
      return td && td !== 'Not Available'
    }).length
    score_m += Math.round((withTitle / totalListings) * 40)
    const updated30d = (listings || []).filter(l => l.updated_at && new Date(l.updated_at) > new Date(d30)).length
    score_m += Math.round(Math.min(1, (updated30d / totalListings) / 0.5) * 60)
  }
  score_m = Math.min(200, Math.max(0, score_m))
  breakdown.listings_total = totalListings
  breakdown.m_score = score_m

  // ── A: ACTIVITY (0–100) ──────────────────────────────────────
  const { count: loginCount } = await sb.from('activity_log')
    .select('id', { count:'exact', head:true })
    .eq('partner_id', partnerId).gte('created_at', d30)
  let score_a = Math.min(50, Math.round(((loginCount || 0) / 15) * 50))
  const { data: lastLogin } = await sb.from('activity_log')
    .select('created_at').eq('partner_id', partnerId)
    .order('created_at', { ascending:false }).limit(1).maybeSingle()
  const daysSinceLogin = lastLogin
    ? Math.floor((now - new Date(lastLogin.created_at).getTime()) / DAY) : 999
  score_a += daysSinceLogin <= 7 ? 10 : 0
  score_a += (listings || []).some(l => l.updated_at && new Date(l.updated_at) > new Date(d30)) ? 40 : 0
  score_a = Math.min(100, Math.max(0, score_a))
  breakdown.a_score = score_a

  // ── E: ETHICS (0–100) ────────────────────────────────────────
  const { data: partnerRow } = await sb.from('data_partners')
    .select('verification_status, complaint_count, professionalism_rating')
    .eq('id', partnerId).maybeSingle()
  const { data: memberships } = await sb.from('association_memberships')
    .select('id, status, verified_by_assoc').eq('data_partner_id', partnerId)
    .eq('status','active').maybeSingle()
  const { data: verReqs } = await sb.from('verification_requests')
    .select('verification_type, status').eq('data_partner_id', partnerId)
  let score_e = 0
  const hasVerification = Boolean(
    partnerRow && ['verified','approved'].includes(partnerRow.verification_status || '')
  ) || (verReqs || []).some(r =>
    ['cac','professional_body'].includes(r.verification_type || '') && r.status === 'approved'
  )
  const assocPoints = memberships?.verified_by_assoc ? 15 : memberships ? 10 : 0
  if (totalVerified > 0) { score_e += 20; breakdown.transaction_activity = 20 }
  if (hasVerification)   { score_e += 15; breakdown.verification = 15 }
  if (memberships)       { score_e += assocPoints; breakdown.association_membership = assocPoints }
  if (totalListings > 0) {
    const withFee = (listings || []).filter(l => (l.raw_data as any)?.fees?.agency_fee_pct != null).length
    const feePct  = withFee / totalListings
    score_e += feePct >= 0.5 ? 15 : Math.round(feePct * 15)
    const titlePct = (listings || []).filter(l => {
      if (l.title_document_type && l.title_document_type !== 'Not Available') return true
      const td = (l.raw_data as any)?.title_document_type
      return td && td !== 'Not Available'
    }).length / totalListings
    score_e += titlePct >= 0.5 ? 15 : Math.round(titlePct * 15)
    const complaints = partnerRow?.complaint_count || 0
    if (complaints === 0) { score_e += 15 } else { score_e -= complaints * 20 }
    const { count: fakeFlags } = await sb.from('activity_log')
      .select('id', { count:'exact', head:true })
      .eq('partner_id', partnerId).eq('event_type','admin_fake_listing_flag').gte('created_at', d180)
    score_e += (fakeFlags || 0) === 0 ? 10 : -((fakeFlags || 0) * 25)
  }
  score_e += Math.round(((partnerRow?.professionalism_rating || 0) / 5) * 10)
  score_e = Math.min(100, Math.max(0, score_e))
  breakdown.e_score = score_e

  // ── TOTAL + DECAY + BADGE ────────────────────────────────────
  const inactivityDecayPct = Math.min(0.2, Math.floor(daysSinceLogin / 90) * 0.02)
  const inactivityPenalty  = Math.round((score_p + score_m + score_a + score_e) * inactivityDecayPct)
  const total = Math.max(0, score_i + score_p + score_m + score_a + score_e - inactivityPenalty)
  if (inactivityPenalty > 0) breakdown.inactivity_decay = -inactivityPenalty
  breakdown.total = total

  return {
    total, i: score_i, p: score_p, m: score_m, a: score_a, e: score_e,
    badge: computeBadge(total, score_i, score_p, score_m, score_e, hasVerification),
    breakdown,
  }
}

export async function GET(req: NextRequest)  { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }

async function handler(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results: any[] = []
  const errors:  any[] = []

  // ── STEP 1: Score all agencies ───────────────────────────────
  const { data: partners, error: fetchErr } = await sb.from('data_partners')
    .select('id, name').eq('partner_type', 'agency')
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  console.log(`[MAPE] Scoring ${partners?.length || 0} agencies…`)

  for (const partner of partners || []) {
    try {
      const score = await scoreAgency(partner.id)
      await sb.from('data_partners').update({
        mape_score: score.total, mape_i: score.i, mape_p: score.p,
        mape_m: score.m, mape_a: score.a, mape_e: score.e,
        badge_level: score.badge, mape_computed_at: new Date().toISOString(),
        mape_breakdown: score.breakdown,
      }).eq('id', partner.id)
      await sb.from('mape_score_log').insert({
        partner_id: partner.id, partner_type: 'agency', total_score: score.total,
        badge: score.badge, i_score: score.i, p_score: score.p,
        m_score: score.m, a_score: score.a, e_score: score.e,
        computed_at: new Date().toISOString(),
      })
      results.push({ id: partner.id, name: partner.name, score: score.total, badge: score.badge })
    } catch (err: any) {
      errors.push({ id: partner.id, error: err?.message ?? String(err) })
    }
  }

  // ── STEP 2: Neighborhood intelligence ───────────────────────
  let neighborhoodsProcessed = 0
  try {
    const { data: nCount } = await sb.rpc('compute_neighborhood_intelligence')
    neighborhoodsProcessed = nCount ?? 0
    console.log(`[CRON] Neighborhood intelligence: ${neighborhoodsProcessed} neighborhoods`)
  } catch (err: any) {
    console.error('[CRON] Neighborhood intelligence failed:', err?.message)
  }

  // ── STEP 3: Platform intelligence ───────────────────────────
  try {
    await sb.rpc('compute_platform_intelligence', { p_country_code: 'NG' })
    console.log('[CRON] Platform intelligence updated')
  } catch (err: any) {
    console.error('[CRON] Platform intelligence failed:', err?.message)
  }

  // ── STEP 4: Association intelligence ────────────────────────
  let associationsProcessed = 0
  try {
    const { data: assocs } = await sb.from('associations')
      .select('id, name').eq('status', 'active')
    for (const assoc of assocs ?? []) {
      try {
        await sb.rpc('compute_association_intelligence', { p_association_id: assoc.id })
        associationsProcessed++
      } catch (err: any) {
        console.error(`[CRON] Association ${assoc.name} failed:`, err?.message)
      }
    }
    console.log(`[CRON] Association intelligence: ${associationsProcessed} associations`)
  } catch (err: any) {
    console.error('[CRON] Association intelligence failed:', err?.message)
  }

  // ── STEP 5: Expire stale signals ────────────────────────────
  try {
    await sb.from('activity_log').delete()
      .lt('expires_at', new Date().toISOString())
      .not('expires_at', 'is', null)
    console.log('[CRON] Stale signals expired')
  } catch (err: any) {
    console.error('[CRON] Signal expiry failed:', err?.message)
  }

  const elapsed = Date.now() - startedAt
  console.log(`[MAPE] Complete: ${results.length} scored, ${errors.length} errors in ${elapsed}ms`)

  return NextResponse.json({
    ok: true,
    scored: results.length,
    errors: errors.length,
    elapsed_ms: elapsed,
    neighborhoods_updated: neighborhoodsProcessed,
    associations_updated:  associationsProcessed,
    results,
    ...(errors.length > 0 ? { error_details: errors } : {}),
  })
}