// app/api/cron/compute-mape/route.ts — SPRINT 3 (corrected)
//
// Uses sale_price (existing column) NOT sale_price_ngn (our mistake in v1).
// Uses sale_date (existing column) NOT transaction_date.
// Both column names match the Phase 1 migration that already ran.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Must use service key — bypasses RLS so cron can read all rows
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

// ─── Badge gate logic ────────────────────────────────────────
function computeBadge(score: number, dims: {
  e: number
  p: number
  i: number
  hasDocs: boolean
  noComplaints: boolean
  daysSinceComplaint: number
  hasVerifiedTransaction: boolean
}): string {
  if (
    score >= 800 &&
    dims.i >= 150 &&
    dims.e >= 60 &&
    dims.p >= 100 &&
    dims.noComplaints &&
    dims.daysSinceComplaint >= 180
  ) return 'elite'

  if (
    score >= 600 &&
    dims.e >= 50 &&
    dims.p >= 50 &&
    dims.hasVerifiedTransaction
  ) return 'trust'

  if (
    score >= 400 &&
    dims.e >= 30 &&
    dims.hasDocs
  ) return 'verified'

  return 'listed'
}

// ─── Score one agency ────────────────────────────────────────
async function scoreAgency(partnerId: string): Promise<{
  total: number
  m: number; a: number; p: number; e: number; i: number
  badge: string
}> {
  const now = Date.now()
  const DAY = 86_400_000

  // ── M: Market Quality (0–200) ────────────────────────────
  const { data: listings } = await sb
    .from('properties')
    .select('bedrooms, price_local, neighborhood, listing_type, title_document_type, raw_data')
    .eq('data_partner_id', partnerId)

  let m = 0
  if (listings && listings.length > 0) {
    const total      = listings.length
    const withBeds   = listings.filter(l => l.bedrooms != null).length
    const withPrice  = listings.filter(l => l.price_local && l.price_local > 0).length
    const withNeigh  = listings.filter(l => l.neighborhood).length
    const withTitle  = listings.filter(l => l.title_document_type).length
    const withPhotos = listings.filter(l => {
      const imgs = (l.raw_data as any)?.images
      return Array.isArray(imgs) && imgs.length > 0
    }).length

    const completeness = (
      (withBeds   / total) * 40 +
      (withPrice  / total) * 40 +
      (withNeigh  / total) * 40 +
      (withTitle  / total) * 40 +
      (withPhotos / total) * 40
    )
    const volumeBonus = Math.min(Math.floor(total / 5) * 5, 40)
    m = Math.round(Math.min(completeness + volumeBonus, 200))
  }

  // ── A: Activity (0–150) ──────────────────────────────────
  const { data: recentListing } = await sb
    .from('properties')
    .select('created_at')
    .eq('data_partner_id', partnerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let a = 0
  if (recentListing?.created_at) {
    const daysSince = Math.floor(
      (now - new Date(recentListing.created_at).getTime()) / DAY
    )
    if      (daysSince <= 7)  a = 150
    else if (daysSince <= 14) a = 120
    else if (daysSince <= 30) a = 90
    else if (daysSince <= 60) a = 60
    else if (daysSince <= 90) a = 30
    else                      a = 0
  }

  // ── P: Performance (0–250) ──────────────────────────────
  const { data: inquiries } = await sb
    .from('inquiries')
    .select('status, created_at, updated_at')
    .eq('agency_id', partnerId)

  let p = 0
  if (inquiries && inquiries.length > 0) {
    const total     = inquiries.length
    const contacted = inquiries.filter(i => i.status !== 'new').length
    const viewing   = inquiries.filter(i =>
      ['viewing', 'negotiation', 'offer', 'closed'].includes(i.status)
    ).length
    const closed    = inquiries.filter(i => i.status === 'closed').length

    p = Math.round(
      (contacted / total) * 100 +
      (viewing   / total) * 100 +
      (closed    / total) * 50
    )
    p = Math.min(p, 250)
  }

  // ── E: Ethics (0–100) ───────────────────────────────────
  const { data: partner } = await sb
    .from('data_partners')
    .select('verification_status, complaint_count, last_complaint_at')
    .eq('id', partnerId)
    .maybeSingle()

  let e                   = 0
  let hasDocs             = false
  let noComplaints        = true
  let daysSinceComplaint  = 999

  if (partner) {
    hasDocs      = partner.verification_status === 'approved'
    const comps  = partner.complaint_count || 0
    noComplaints = comps === 0

    if (partner.last_complaint_at) {
      daysSinceComplaint = Math.floor(
        (now - new Date(partner.last_complaint_at).getTime()) / DAY
      )
    }

    e += 30
    if (noComplaints) e += 30
    if (hasDocs)      e += 40
    if (comps > 0)    e  = Math.max(0, e - comps * 10)
    e = Math.min(e, 100)
  }

  // ── I: Intelligence (0–300) ─────────────────────────────
  // Uses sale_price (existing column name) and verified column
  const { data: transactions } = await sb
    .from('property_transactions')
    .select('id, verified, sale_date')
    .eq('data_partner_id', partnerId)

  let intel                  = 0
  let hasVerifiedTransaction = false

  if (transactions && transactions.length > 0) {
    const verified         = transactions.filter(t => t.verified)
    hasVerifiedTransaction = verified.length > 0
    intel                  = Math.min(verified.length * 20, 300)
  }

  const total = m + a + p + e + intel
  const badge = computeBadge(total, {
    e, p, i: intel,
    hasDocs,
    noComplaints,
    daysSinceComplaint,
    hasVerifiedTransaction,
  })

  return { total, m, a, p, e, i: intel, badge }
}

// ─── Main handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Validate cron secret
  const secret = req.headers.get('x-cron-secret') ||
                 req.nextUrl.searchParams.get('secret')

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  const results:  { id: string; name: string; score: number; badge: string }[] = []
  const errors:   { id: string; error: string }[] = []

  const { data: partners, error: fetchErr } = await sb
    .from('data_partners')
    .select('id, name')
    .eq('active', true)
    .eq('partner_type', 'agency')

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  for (const partner of (partners || [])) {
    try {
      const score = await scoreAgency(partner.id)

      // Update the data_partners row — badge trigger fires automatically
      await sb.from('data_partners').update({
        mape_score:       score.total,
        mape_m:           score.m,
        mape_a:           score.a,
        mape_p:           score.p,
        mape_e:           score.e,
        mape_i:           score.i,
        mape_breakdown:   { m: score.m, a: score.a, p: score.p, e: score.e, i: score.i },
        mape_computed_at: new Date().toISOString(),
      }).eq('id', partner.id)

      // Log to mape_score_log
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
      errors.push({ id: partner.id, error: String(err) })
    }
  }

  return NextResponse.json({
    success:      true,
    computed:     results.length,
    errors:       errors.length,
    elapsed_ms:   Date.now() - startedAt,
    results:      results.slice(0, 20),
    error_detail: errors.slice(0, 5),
  })
}

export async function GET(req: NextRequest) {
  return POST(req)
}