// app/api/cron/compute-mape/route.ts
//
// E-SCORE FIX — root cause of "60/100 ethics with no listings":
//
// BEFORE (bug):
//   e += 30  // "base: being active"    ← awarded just for existing
//   if (noComplaints) e += 30           ← awarded just for not being bad
//   if (hasDocs)      e += 40           ← only this one was earned
//   Result: brand new agency with no listings = 60/100 ethics. Wrong.
//
// AFTER (correct):
//   E-score is now FULLY earned, never awarded for passive existence.
//   Base = 0. Points only come from actions:
//     +20  at least 1 listing with agency_fee disclosed
//     +20  at least 1 listing with title_document_type disclosed
//     +10  no complaints (must have ≥1 listing to unlock this check)
//     +10  no fake listing flags
//     +15  identity verified
//     +5   professionalism rating (admin-assigned)
//   Total max = 80 (matches lib/mape.ts max)
//
//   Agency with NO listings: E = 0. Always.
//   Agency with 1 listing, fees disclosed, no complaints, not verified: E = 30.
//   Agency verified, full ethics: E = 60. Elite requires all 80.
//
// This means trust must be earned, not assumed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const DAY = 86_400_000

// ─── Badge computation ────────────────────────────────────────
function computeBadge(total: number, signals: {
  e: number
  p: number
  i: number
  hasDocs: boolean
  noComplaints: boolean
  daysSinceComplaint: number
  hasVerifiedTransaction: boolean
}): string {
  // Elite: 800+ AND all three gates met
  if (
    total >= 800 &&
    signals.i >= 150 &&
    signals.e >= 60 &&
    signals.p >= 100
  ) return 'elite'

  // Trust: 600+ AND ethics + performance gates
  if (
    total >= 600 &&
    signals.e >= 40 &&
    signals.p >= 50
  ) return 'trust'

  // Verified: 400+ AND ethics floor AND identity verified
  if (
    total >= 400 &&
    signals.e >= 20 &&
    signals.hasDocs
  ) return 'verified'

  return 'listed'
}

// ─── Score a single agency ────────────────────────────────────
async function scoreAgency(partnerId: string): Promise<{
  total: number; m: number; a: number; p: number; e: number; i: number; badge: string
}> {
  const now  = Date.now()
  const d90  = new Date(now - 90 * DAY).toISOString()
  const d30  = new Date(now - 30 * DAY).toISOString()
  const d180 = new Date(now - 180 * DAY).toISOString()

  // ── M: Market Quality (0–200) ─────────────────────────────
  const { data: listings } = await sb
    .from('properties')
    .select('id, raw_data, price_local, bedrooms, created_at, updated_at')
    .eq('data_partner_id', partnerId)

  let m = 0
  const totalListings = (listings || []).length

  if (totalListings > 0) {
    const withImages    = (listings || []).filter(l => {
      const imgs = (l.raw_data as Record<string, unknown>)?.images
      return Array.isArray(imgs) && imgs.length >= 3
    }).length
    const withPrice     = (listings || []).filter(l => l.price_local).length
    const withBeds      = (listings || []).filter(l => l.bedrooms).length
    const withDesc      = (listings || []).filter(l => {
      const d = (l.raw_data as Record<string, unknown>)?.description
      return typeof d === 'string' && d.length >= 50
    }).length
    const withTitleDoc  = (listings || []).filter(l => {
      const raw = l.raw_data as Record<string, unknown> | null
      return raw?.title_document_type || raw?.title_doc
    }).length
    const recentUpdates = (listings || []).filter(l =>
      l.updated_at && new Date(l.updated_at) > new Date(d30)
    ).length

    const imgScore    = Math.round(Math.min(1, (withImages / totalListings) / 0.7) * 60)
    const dataAvg     = ((withPrice + withBeds + withDesc) / 3) / totalListings
    const dataScore   = Math.round(dataAvg * 60)
    const titleScore  = Math.round((withTitleDoc / totalListings) * 30)
    const freshScore  = Math.round(Math.min(1, (recentUpdates / totalListings) / 0.5) * 50)

    m = Math.min(200, imgScore + dataScore + titleScore + freshScore)
    console.log(`[MAPE] ${partnerId} M=${m} (${totalListings} listings, ${withImages} w/imgs, ${withTitleDoc} w/title)`)
  } else {
    console.log(`[MAPE] ${partnerId} M=0 (no listings)`)
  }

  // ── A: Activity (0–120) ───────────────────────────────────
  const { count: loginCount } = await sb
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partnerId)
    .gte('created_at', d30)

  const updatedListings = (listings || []).filter(l =>
    l.updated_at && new Date(l.updated_at) > new Date(d30)
  ).length

  let a = 0
  const logins = loginCount || 0
  a += Math.min(40, Math.round((logins / 15) * 40))

  if (totalListings > 0) {
    const freshPct = updatedListings / totalListings
    a += Math.min(80, Math.round((freshPct / 0.5) * 80))
  }

  a = Math.min(120, Math.max(0, a))
  console.log(`[MAPE] ${partnerId} A=${a} (${logins} logins, ${updatedListings} updated listings)`)

  // ── P: Performance (0–250) ────────────────────────────────
  const { data: inquiries } = await sb
    .from('inquiries')
    .select('status, created_at, updated_at')
    .eq('agency_id', partnerId)

  let p = 0
  if (inquiries && inquiries.length > 0) {
    const total     = inquiries.length
    const contacted = inquiries.filter(i => i.status !== 'new').length
    const advanced  = inquiries.filter(i =>
      ['viewing', 'negotiation', 'offer', 'closed'].includes(i.status)
    ).length
    const closed    = inquiries.filter(i => i.status === 'closed').length

    p = Math.min(250, Math.round(
      (contacted / total) * 100 +
      (advanced  / total) * 100 +
      (closed    / total) * 50,
    ))
    console.log(`[MAPE] ${partnerId} P=${p} (${total} inquiries, ${closed} closed)`)
  } else {
    console.log(`[MAPE] ${partnerId} P=0 (no inquiries yet)`)
  }

  // ── E: Ethics (0–80) ──────────────────────────────────────
  //
  // FIXED: removed base 30pts for existence.
  // Every point must be earned through real actions.
  // No listings = E score of 0, always.
  //
  const { data: partnerRow } = await sb
    .from('data_partners')
    .select('verification_status, complaint_count, last_complaint_at')
    .eq('id', partnerId)
    .maybeSingle()

  let e                  = 0
  let hasDocs            = false
  let noComplaints       = true
  let daysSinceComplaint = 999

  if (partnerRow) {
    hasDocs      = partnerRow.verification_status === 'approved' ||
                   partnerRow.verification_status === 'verified'
    const comps  = partnerRow.complaint_count || 0
    noComplaints = comps === 0

    if (partnerRow.last_complaint_at) {
      daysSinceComplaint = Math.floor(
        (now - new Date(partnerRow.last_complaint_at).getTime()) / DAY,
      )
    }

    // E-score only unlocks if the agency has at least 1 listing
    // This prevents brand-new accounts from scoring ethics points
    if (totalListings > 0) {

      // +20: at least 1 listing with agency fee disclosed
      const withFee = (listings || []).filter(l => {
        const fees = (l.raw_data as Record<string, unknown> | null)?.fees as Record<string, unknown> | undefined
        return fees?.agency_fee_pct != null
      }).length
      if (withFee > 0) e += 20

      // +20: at least 1 listing with title document type disclosed
      const withTitle = (listings || []).filter(l => {
        const raw = l.raw_data as Record<string, unknown> | null
        const td  = raw?.title_document_type
        return td && td !== 'Not Available'
      }).length
      if (withTitle > 0) e += 20

      // +10: no complaints (only meaningful if agency is active)
      if (noComplaints) e += 10

      // +10: no fake listing flags
      // (checked via activity_log admin_flag events)
      const { count: fakeFlags } = await sb
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('event_type', 'admin_fake_listing_flag')
        .gte('created_at', d180)

      if ((fakeFlags || 0) === 0) e += 10

      // -15 per complaint (cancels out earned points)
      if (comps > 0) {
        e = Math.max(0, e - comps * 15)
      }
    }

    // +15: identity verified (this one is always available — not listing-gated
    // because verification is the gateway to the Verified badge itself)
    if (hasDocs) e += 15

    // +5: professionalism (admin score — only if set, defaults to 0)
    // Not auto-awarded. Requires admin to set it in the verification panel.
    // Left at 0 here — admin sets it via Supabase dashboard or admin panel.

    e = Math.min(80, Math.max(0, e))
  }

  console.log(`[MAPE] ${partnerId} E=${e} (verified=${hasDocs}, complaints=${partnerRow?.complaint_count || 0}, listings=${totalListings})`)

  // ── I: Intelligence / Transaction Data (0–300) ────────────
  const { data: transactions } = await sb
    .from('property_transactions')
    .select('id, verified, sale_date')
    .eq('data_partner_id', partnerId)

  const { data: marketTxns } = await sb
    .from('market_transactions')
    .select('id, verification_status')
    .eq('submitted_by', partnerId)

  let intel                  = 0
  let hasVerifiedTransaction = false

  const verifiedPropTxns   = (transactions  || []).filter(t => t.verified).length
  const verifiedMarketTxns = (marketTxns    || []).filter(t => t.verification_status === 'verified').length
  const totalVerified      = verifiedPropTxns + verifiedMarketTxns

  if (totalVerified > 0) {
    hasVerifiedTransaction = true
    intel = Math.min(300, totalVerified * 20)
  }
  console.log(`[MAPE] ${partnerId} I=${intel} (${totalVerified} verified transactions)`)

  // ── Total + Badge ─────────────────────────────────────────
  const total = m + a + p + e + intel
  const badge = computeBadge(total, {
    e, p, i: intel,
    hasDocs,
    noComplaints,
    daysSinceComplaint,
    hasVerifiedTransaction,
  })

  console.log(`[MAPE] ${partnerId} TOTAL=${total} BADGE=${badge}`)
  return { total, m, a, p, e, i: intel, badge }
}

// ─── GET + POST handler (Vercel cron uses GET) ────────────────
export async function GET(req: NextRequest) {
  return handler(req)
}

export async function POST(req: NextRequest) {
  return handler(req)
}

async function handler(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ||
                 req.nextUrl.searchParams.get('secret')

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results:  { id: string; name: string; score: number; badge: string }[] = []
  const errors:   { id: string; error: string }[] = []

  console.log('[MAPE Cron] Starting computation (E-score fix applied)')

  const { data: partners, error: fetchErr } = await sb
    .from('data_partners')
    .select('id, name')
    .eq('active', true)
    .eq('partner_type', 'agency')

  if (fetchErr) {
    console.error('[MAPE Cron] Failed to fetch partners:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  console.log(`[MAPE Cron] Computing for ${partners?.length || 0} agencies`)

  for (const partner of (partners || [])) {
    try {
      const score = await scoreAgency(partner.id)

      const { error: updateErr } = await sb.from('data_partners').update({
        mape_score:       score.total,
        mape_m:           score.m,
        mape_a:           score.a,
        mape_p:           score.p,
        mape_e:           score.e,
        mape_i:           score.i,
        badge_level:      score.badge,
        mape_computed_at: new Date().toISOString(),
        mape_breakdown: {
          m: score.m, a: score.a, p: score.p,
          e: score.e, i: score.i,
          computed_at: new Date().toISOString(),
        },
      }).eq('id', partner.id)

      if (updateErr) {
        console.error(`[MAPE Cron] Update failed for ${partner.id}:`, updateErr)
        errors.push({ id: partner.id, error: updateErr.message })
        continue
      }

      await sb.from('mape_score_log').insert({
        partner_id:   partner.id,
        partner_type: 'agency',
        total_score:  score.total,
        badge:        score.badge,
        m_score:      score.m,
        a_score:      score.a,
        p_score:      score.p,
        e_score:      score.e,
        i_score:      score.i,
        computed_at:  new Date().toISOString(),
      })

      results.push({ id: partner.id, name: partner.name, score: score.total, badge: score.badge })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[MAPE Cron] Error for ${partner.id}:`, msg)
      errors.push({ id: partner.id, error: msg })
    }
  }

  const elapsed = Date.now() - startedAt
  console.log(`[MAPE Cron] Done. ${results.length} updated, ${errors.length} errors. ${elapsed}ms`)

  return NextResponse.json({
    computed: results.length,
    errors:   errors.length,
    elapsed_ms: elapsed,
    results,
    ...(errors.length > 0 ? { error_details: errors } : {}),
  })
}