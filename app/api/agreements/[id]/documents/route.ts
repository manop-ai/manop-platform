// app/api/agreements/[id]/documents/route.ts — the requester's side of the agreement document trail (own requests only).
//   GET   the versions MANOP has issued, the requester's own signed copies and, once completed, the completed copy (the accepted partner-signed copy)
//   POST  { action:'sign', version_id, filename, bytes, note? }  reserve an upload of the signed copy of ONE exact issued version
//         { action:'complete', document_id }                      check what was stored; the signed copy is then "received", NOT executed
//         { action:'fail', document_id }
// Ownership is the request's requester_user_id, checked on every call. Drafts, withdrawn versions and storage identifiers are never returned.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { validateAgreementUpload, agreementPublicId, agreementPublicIdBelongs, canUploadSigned, visibleToRequester, requesterNextStep } from '../../../../../lib/agreement-docs'
import { cloudConfig, signedUploadFor, verifyUploadedAsset } from '../../../../../lib/mandate-letter-server'
import { logDocEvent, logRequestEvent, moveRequest, publicDoc, txt, UUID } from '../../../../../lib/agreement-docs-server'

export const dynamic = 'force-dynamic'
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })
const nf = () => bad('Request not found.', 404)
type Ctx = { params: { id: string } }

async function owner(req: NextRequest, id: string) {
  if (!UUID.test(id)) return { error: nf() } as const
  const sb = sbFromRequest(req); const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: bad('Sign in required.', 401) } as const
  const { data: request } = await sbAdmin.from('agreement_requests').select('id,reference,status,requester_user_id,company_name').eq('id', id).maybeSingle()
  if (!request || request.requester_user_id !== user.id) return { error: nf() } as const     // same answer for "missing" and "not yours"
  return { user, request } as const
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const o = await owner(req, params.id); if ('error' in o) return o.error
  const { data, error } = await sbAdmin.from('agreement_documents').select('*').eq('request_id', params.id).order('created_at', { ascending: true })
  if (error) return /does not exist|schema cache/i.test(error.message) ? NextResponse.json({ unavailable: true, documents: [] }) : bad('Could not load the documents.', 500)
  const docs = (data ?? []).filter(d => visibleToRequester(d as any))
  return NextResponse.json({ documents: docs.map(publicDoc), nextStep: requesterNextStep(o.request.status, docs as any), requestStatus: o.request.status, uploadsConfigured: !!cloudConfig() })
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const o = await owner(req, params.id); if ('error' in o) return o.error
    let b: Record<string, unknown>; try { b = await req.json() } catch { return bad('Invalid request.') }
    const cfg = cloudConfig()
    if (!cfg && b.action !== 'fail') return bad('Document upload is not configured yet. Please contact MANOP.', 503)
    const uid = o.user.id

    if (b.action === 'sign') {
      const v = validateAgreementUpload({ filename: b.filename, bytes: b.bytes }); if (!v.ok) return bad(v.error!)
      const vid = typeof b.version_id === 'string' && UUID.test(b.version_id) ? b.version_id : null
      const { data: ver } = vid ? await sbAdmin.from('agreement_documents').select('id,kind,status,version_number').eq('id', vid).eq('request_id', params.id).maybeSingle() : { data: null }
      const gate = canUploadSigned(o.request.status, ver as any); if (!gate.ok) return bad(gate.error!, 409)
      const { count } = await sbAdmin.from('agreement_documents').select('id', { count: 'exact', head: true }).eq('issued_version_id', ver!.id).eq('kind', 'signed_copy').eq('status', 'pending_upload').eq('uploaded_by', uid)
      if ((count ?? 0) >= 5) return bad('Several uploads are unfinished. Please wait a moment or contact MANOP.', 429)
      const id = randomUUID(); const publicId = agreementPublicId(params.id, id, v.ext!)
      const { error } = await sbAdmin.from('agreement_documents').insert({ id, request_id: params.id, kind: 'signed_copy', version_number: ver!.version_number, issued_version_id: ver!.id, status: 'pending_upload', original_filename: v.filename, cloudinary_public_id: publicId, uploaded_by: uid, uploaded_by_role: 'requester', requester_note: txt(b.note, 1500) })
      if (error) return bad('Could not start the upload.', 500)
      return NextResponse.json({ document_id: id, upload: signedUploadFor(cfg!, publicId) })
    }

    const docId = typeof b.document_id === 'string' && UUID.test(b.document_id) ? b.document_id : null
    const { data: d } = docId ? await sbAdmin.from('agreement_documents').select('*').eq('id', docId).eq('request_id', params.id).maybeSingle() : { data: null }
    if (!d || d.kind !== 'signed_copy' || d.uploaded_by !== uid || d.status !== 'pending_upload') return bad('Upload not found. Please start again.', 404)

    if (b.action === 'fail') { await sbAdmin.from('agreement_documents').update({ status: 'upload_failed' }).eq('id', d.id); return NextResponse.json({ ok: true }) }

    if (b.action === 'complete') {
      if (!agreementPublicIdBelongs(params.id, d.id, d.cloudinary_public_id)) return bad('Upload not found. Please start again.', 404)
      const { data: ver } = await sbAdmin.from('agreement_documents').select('id,kind,status,version_number').eq('id', d.issued_version_id).maybeSingle()
      const gate = canUploadSigned(o.request.status, ver as any)
      if (!gate.ok) { await sbAdmin.from('agreement_documents').update({ status: 'upload_failed' }).eq('id', d.id); return bad(gate.error!, 409) }
      const chk = await verifyUploadedAsset(cfg!, { publicId: d.cloudinary_public_id, declaredExt: d.cloudinary_public_id.split('.').pop() ?? '' })
      if (!chk.ok) { await sbAdmin.from('agreement_documents').update({ status: 'upload_failed' }).eq('id', d.id); await logDocEvent({ request_id: params.id, document_id: d.id, event_type: 'upload_rejected', actor_user_id: uid, actor_role: 'requester', detail: { error: (chk as any).error } }); return bad((chk as any).error) }
      const { error } = await sbAdmin.from('agreement_documents').update({ status: 'received', format: chk.format, bytes: chk.bytes, uploaded_at: new Date().toISOString() }).eq('id', d.id).eq('status', 'pending_upload')
      if (error) return bad(error.code === '23505' ? 'A signed copy for this version is already with MANOP.' : 'Could not save the signed copy.', error.code === '23505' ? 409 : 500)
      const from = o.request.status
      await moveRequest(params.id, from, 'signed_copy_received')
      await logDocEvent({ request_id: params.id, document_id: d.id, event_type: 'signed_copy_uploaded', actor_user_id: uid, actor_role: 'requester', detail: { version: d.version_number, has_note: !!d.requester_note } })
      await logRequestEvent({ request_id: params.id, actor_user_id: uid, actor_role: 'requester', from_status: from, to_status: 'signed_copy_received', message: `Signed copy of version ${d.version_number} uploaded${d.requester_note ? `. Note: ${d.requester_note}` : '.'} Not yet executed: MANOP will review it.`, visible: true })
      return NextResponse.json({ ok: true })
    }
    return bad('Unknown action.')
  } catch (e) { console.error('POST agreement documents', e); return bad('That could not be completed. Please try again.', 500) }
}
