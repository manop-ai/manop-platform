// POST /api/developer/verification-request — a developer asks MANOP to verify their account.
// This never verifies anything: it records the request (once) and tells MANOP. Only an admin can set developer_accounts.verified.
// If sql/phase31_developer_verification.sql has not been applied yet the request cannot be recorded, so we say so rather than pretend.
import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sendAdminNotification, notificationHtml } from '../../../../lib/email'
import { developerSetupStatus, canRequestVerification } from '../../../../lib/developer-setup'

export async function POST(req: NextRequest) {
  try {
    const { data: { user } } = await sbFromRequest(req).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: acct } = await sbAdmin.from('developer_accounts').select('*').eq('auth_user_id', user.id).maybeSingle()
    if (!acct) return NextResponse.json({ error: 'Complete your developer setup first.' }, { status: 404 })

    const status = developerSetupStatus(acct as any)
    const can = canRequestVerification(status)
    if ('reason' in can) return NextResponse.json({ error: can.reason }, { status: 409 })

    if (!('verification_requested_at' in (acct as object))) {
      return NextResponse.json({ error: 'Verification requests are not switched on yet. Please contact MANOP directly.' }, { status: 503 })
    }
    const now = new Date().toISOString()
    const { data: upd, error } = await sbAdmin.from('developer_accounts')
      .update({ verification_requested_at: now })
      .eq('id', (acct as any).id).eq('verified', false).is('verification_requested_at', null)
      .select('id').maybeSingle()
    if (error) return NextResponse.json({ error: 'Could not record the request.' }, { status: 500 })
    if (!upd) return NextResponse.json({ error: 'Verification has already been requested.' }, { status: 409 })

    void sendAdminNotification(
      `Developer verification requested — ${(acct as any).company_name}`,
      notificationHtml('A developer asked MANOP to verify their account', [
        ['Company', (acct as any).company_name], ['Contact', `${(acct as any).contact_name} · ${(acct as any).email}`], ['Phone', (acct as any).phone],
        ['Cities', ((acct as any).cities ?? []).join(', ')], ['Account ID', (acct as any).id],
        ['What to do', 'Check the company (registration, identity, track record), then mark the developer verified from Admin.'],
      ]),
    ).catch(() => { /* the request is stored; email is supplementary */ })

    return NextResponse.json({ ok: true, requestedAt: now })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}