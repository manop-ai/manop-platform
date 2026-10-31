// app/api/developer/claim/route.ts
//
// A developer claims the account MANOP created for them. The caller's identity and CONFIRMED email come
// from their token; the account is matched exactly on that email in code, with no pattern matching (never on text typed into a form);
// the write uses the service role only after those checks. See lib/developer-claim.ts for what was wrong
// before.
//
// Claiming does NOT by itself hand over earlier introductions: introductions MANOP received while the
// developer was unclaimed stay with MANOP until an admin refers them (see lib/deal-room-access.ts).
//
// Responses: 200 { claimed: true, id } | 404 { claimed: false } (nothing to claim; the caller carries on
// with ordinary onboarding) | 409 (ambiguous) | 401/403.

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { checkClaimant, pickClaimable, claimUpdate } from '../../../../lib/developer-claim'

export async function POST(req: NextRequest) {
  try {
    const { data: { user } } = await sbFromRequest(req).auth.getUser()
    const who = checkClaimant(user)
    if ('error' in who) return NextResponse.json({ error: who.error }, { status: who.status })

    // A login that already has a developer account is not claiming anything.
    const { data: mine } = await sbAdmin.from('developer_accounts').select('id').eq('auth_user_id', user!.id).maybeSingle()
    if (mine) return NextResponse.json({ claimed: false, reason: 'already_has_account' }, { status: 404 })

    const { data: rows, error } = await sbAdmin.from('developer_accounts')
      .select('id, email, auth_user_id, account_status')
      .eq('account_status', 'unclaimed').is('auth_user_id', null)
    if (error) return NextResponse.json({ error: 'Could not check for an existing account.' }, { status: 500 })

    const match = pickClaimable(rows ?? [], who.email)
    if (match.kind === 'none') return NextResponse.json({ claimed: false }, { status: 404 })
    if (match.kind === 'ambiguous') return NextResponse.json({ error: 'More than one MANOP-created account matches your email. Contact MANOP to resolve it.' }, { status: 409 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const { data: upd, error: updErr } = await sbAdmin.from('developer_accounts')
      .update(claimUpdate(body, user!.id, new Date().toISOString()))
      .eq('id', match.id).eq('account_status', 'unclaimed').is('auth_user_id', null)   // lose the race, not the account
      .select('id').maybeSingle()
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    if (!upd) return NextResponse.json({ error: 'That account was claimed by someone else a moment ago.' }, { status: 409 })
    return NextResponse.json({ claimed: true, id: upd.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}