// GET /api/developer/setup-status — the signed-in developer's own setup state (profile completeness, verification).
// Read with the service role AFTER the caller is identified from their token and matched to their own developer account; nothing is taken from the query.
// select('*') on purpose: verification_requested_at only exists once sql/phase31_developer_verification.sql has been applied, and this must work before and after.
import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { developerSetupStatus } from '../../../../lib/developer-setup'

export async function GET(req: NextRequest) {
  try {
    const { data: { user } } = await sbFromRequest(req).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: acct, error } = await sbAdmin.from('developer_accounts').select('*').eq('auth_user_id', user.id).maybeSingle()
    if (error) return NextResponse.json({ error: 'Could not load your account.' }, { status: 500 })
    if (!acct) return NextResponse.json({ exists: false })
    return NextResponse.json({ exists: true, status: developerSetupStatus(acct as any) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Server error' }, { status: 500 })
  }
}