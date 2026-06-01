// app/api/listings/create/route.ts
//
// LISTING CAP ENFORCEMENT
//
// Unverified agency  → max 3 active listings
// Unverified developer → max 1 active project
//
// When cap is hit, returns 403 with a clear message that guides
// the agency to verify their identity to unlock unlimited listings.
//
// This is intentional product design:
//   - Caps create the incentive to verify
//   - Verification creates the data integrity MANOP needs
//   - Trust is earned, not assumed
//
// Cap is checked server-side (not just in the UI) so it cannot be bypassed.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

const UNVERIFIED_LISTING_CAP  = 3
const UNVERIFIED_PROJECT_CAP  = 1

export async function POST(req: NextRequest) {
  try {
    // Authenticate the request
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the session user from Supabase Auth
    const sbClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { authorization: authHeader } } },
    )

    const { data: { user }, error: authErr } = await sbClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { listing_type: entityType = 'property', ...listingData } = body

    // ── Agency listing cap ──────────────────────────────────
    if (entityType === 'property') {
      // Find the agency for this user
      const { data: partner } = await sb
        .from('data_partners')
        .select('id, name, verification_status, badge_level')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!partner) {
        return NextResponse.json({ error: 'Agency not found' }, { status: 404 })
      }

      const isVerified = partner.verification_status === 'verified' ||
                         partner.verification_status === 'approved' ||
                         partner.badge_level === 'verified' ||
                         partner.badge_level === 'trust' ||
                         partner.badge_level === 'elite'

      if (!isVerified) {
        // Count current active listings
        const { count } = await sb
          .from('properties')
          .select('id', { count: 'exact', head: true })
          .eq('data_partner_id', partner.id)

        const currentCount = count || 0

        if (currentCount >= UNVERIFIED_LISTING_CAP) {
          return NextResponse.json({
            error:   'listing_cap_reached',
            message: `You have reached the ${UNVERIFIED_LISTING_CAP}-listing limit for unverified agencies. Verify your identity to publish unlimited listings and unlock your full MAPE potential.`,
            current: currentCount,
            cap:     UNVERIFIED_LISTING_CAP,
            action:  'verify_identity',
          }, { status: 403 })
        }
      }

      // Insert the listing
      const { data: newListing, error: insertErr } = await sb
        .from('properties')
        .insert({ ...listingData, data_partner_id: partner.id })
        .select('id')
        .maybeSingle()

      if (insertErr) {
        console.error('[Listing Create] Insert error:', insertErr)
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      return NextResponse.json({ id: newListing?.id, success: true })
    }

    // ── Developer project cap ───────────────────────────────
    if (entityType === 'project') {
      const { data: developer } = await sb
        .from('developer_accounts')
        .select('id, company_name, verified, badge_level')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (!developer) {
        return NextResponse.json({ error: 'Developer account not found' }, { status: 404 })
      }

      const isVerified = developer.verified ||
                         developer.badge_level === 'verified' ||
                         developer.badge_level === 'trust' ||
                         developer.badge_level === 'elite'

      if (!isVerified) {
        const { count } = await sb
          .from('developer_projects')
          .select('id', { count: 'exact', head: true })
          .eq('developer_id', developer.id)
          .eq('active', true)

        const currentCount = count || 0

        if (currentCount >= UNVERIFIED_PROJECT_CAP) {
          return NextResponse.json({
            error:   'project_cap_reached',
            message: `You have reached the ${UNVERIFIED_PROJECT_CAP}-project limit for unverified developers. Verify your identity to list multiple projects and build your MAPE score.`,
            current: currentCount,
            cap:     UNVERIFIED_PROJECT_CAP,
            action:  'verify_identity',
          }, { status: 403 })
        }
      }

      const { data: newProject, error: insertErr } = await sb
        .from('developer_projects')
        .insert({ ...listingData, developer_id: developer.id })
        .select('id')
        .maybeSingle()

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 })
      }

      return NextResponse.json({ id: newProject?.id, success: true })
    }

    return NextResponse.json({ error: 'Unknown entity type' }, { status: 400 })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    console.error('[Listing Create] Unexpected error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}