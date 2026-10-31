// app/api/agreements/[id]/withdraw/route.ts — the requester withdraws their own request (before an agreement is sent).

import { NextRequest, NextResponse } from 'next/server'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { requireRequester, UUID_RE } from '../../../../../lib/agreements-server'
import { REQUESTER_WITHDRAWABLE, type RequestStatus } from '../../../../../lib/commercial-terms'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 })
  const g = await requireRequester(req); if ('error' in g) return g.error
  const { data: current } = await g.sb.from('agreement_requests').select('id,status,requester_user_id').eq('id', params.id).maybeSingle()
  if (!current || current.requester_user_id !== g.requester.userId) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (!REQUESTER_WITHDRAWABLE.includes(current.status as RequestStatus)) {
    return NextResponse.json({ error: 'This request can no longer be withdrawn here. Contact MANOP.' }, { status: 409 })
  }
  const now = new Date().toISOString()
  const { error } = await sbAdmin.from('agreement_requests').update({ status: 'withdrawn', status_updated_at: now, updated_at: now }).eq('id', params.id).eq('requester_user_id', g.requester.userId)
  if (error) return NextResponse.json({ error: 'Could not withdraw the request.' }, { status: 500 })
  await sbAdmin.from('agreement_request_events').insert({ request_id: params.id, actor_user_id: g.requester.userId, actor_role: 'requester', event_type: 'withdrawn', from_status: current.status, to_status: 'withdrawn', visible_to_requester: true, message: 'Request withdrawn by the requester.' })
  return NextResponse.json({ ok: true })
}