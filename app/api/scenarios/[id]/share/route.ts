// app/api/scenarios/[id]/share/route.ts
//
// POST creates (or returns the existing) share link for a scenario.
// DELETE revokes it. Both go through the SECURITY DEFINER RPCs in
// sql/2026_site_studio_sharing_and_reports.sql — the actual shared
// report itself is served by a separate, public, unauthenticated
// route (app/site-intelligence/shared/[token]/page.tsx), which is
// the whole point: the person receiving the link has no MANOP
// session at all.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { data: { user } } = await sb.auth.getUser()

  const { data: token, error } = await sb.rpc('create_or_get_scenario_share', {
    p_scenario_id: params.id, p_created_by: user?.id ?? null,
  })

  if (error || !token) return NextResponse.json({ error: error?.message || 'Could not create a share link.' }, { status: 500 })
  return NextResponse.json({ token, url: `/site-intelligence/shared/${token}` })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { error } = await sb.rpc('revoke_scenario_share', { p_scenario_id: params.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}