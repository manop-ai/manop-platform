// app/api/agreement-documents/[id]/file/route.ts — the ONLY way an agreement document is opened.
// MANOP admins may open any document of any request (recorded). A requester may open only documents of THEIR OWN request that are visible to them
// (sent versions, their own signed copies, the final executed copy). Everyone else gets 404. The file is private (authenticated delivery); a
// 5-minute signed link is made only after this decision. Opening the current sent version for the first time moves the request to "awaiting signature".
import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { canOpenDocument } from '../../../../../lib/agreement-docs'
import { cloudConfig, openUrlFor } from '../../../../../lib/mandate-letter-server'
import { logDocEvent, logRequestEvent, moveRequest, UUID } from '../../../../../lib/agreement-docs-server'

export const dynamic = 'force-dynamic'
const nf = () => NextResponse.json({ error: 'Document not found.' }, { status: 404 })

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) return nf()
    const sb = sbFromRequest(req); const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: d } = await sbAdmin.from('agreement_documents').select('id,request_id,kind,status,cloudinary_public_id,version_number').eq('id', params.id).maybeSingle()
    if (!d || !d.cloudinary_public_id) return nf()
    const { data: a } = await sb.rpc('is_manop_admin'); const isAdmin = a === true
    const { data: r } = await sbAdmin.from('agreement_requests').select('id,status,requester_user_id').eq('id', d.request_id).maybeSingle()
    if (!r) return nf()
    const dec = canOpenDocument(isAdmin ? { role: 'admin' } : { role: 'requester', userId: user.id, requestOwnerUserId: r.requester_user_id }, d as any)
    if (!dec.allowed) return nf()
    const cfg = cloudConfig(); if (!cfg) return NextResponse.json({ error: 'Document access is not configured (storage credentials are missing).' }, { status: 503 })
    const u = openUrlFor(cfg, d.cloudinary_public_id, isAdmin ? 'admin' : 'owner')
    await logDocEvent({ request_id: d.request_id, document_id: d.id, event_type: isAdmin ? 'opened_by_admin' : 'opened_by_requester', actor_user_id: user.id, actor_role: isAdmin ? 'admin' : 'requester', detail: { kind: d.kind, version: d.version_number } })
    if (!isAdmin && d.kind === 'issued' && d.status === 'issued' && r.status === 'agreement_sent') {
      if (await moveRequest(r.id, 'agreement_sent', 'awaiting_signature')) await logRequestEvent({ request_id: r.id, actor_user_id: user.id, actor_role: 'requester', from_status: 'agreement_sent', to_status: 'awaiting_signature', message: `Version ${d.version_number} downloaded. Waiting for the signed copy.`, visible: true })
    }
    return NextResponse.json({ url: u.url, expiresInSeconds: u.expiresInSeconds })
  } catch (e) { console.error('GET agreement document', e); return NextResponse.json({ error: 'Could not open the document.' }, { status: 500 }) }
}