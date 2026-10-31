// app/api/admin/documents/[id]/review/route.ts
// Admin: set a document's REVIEW STATUS and/or its PUBLIC VISIBILITY. The two are independent: setting a status never
// changes visibility, and making a document public never changes its status. Every change is recorded in
// document_review_events. Runs as the admin (RLS is_manop_admin()). Confidential documents can never be made public.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../../../../lib/admin-guard'
import { DOCUMENT_STATUSES, isConfidentialByNature } from '../../../../../../lib/documents-access'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s })

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return bad('Invalid document id.')
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return bad('Invalid request.') }
  const g = await requireAdmin(req); if ('error' in g) return g.error

  const { data: doc, error: readErr } = await g.sb.from('developer_documents').select('id,status,publicly_visible,verification_note,document_type,document_name').eq('id', params.id).maybeSingle()
  if (readErr) return bad(readErr.message)
  if (!doc) return bad('Document not found.', 404)

  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 2000) : null
  const update: Record<string, unknown> = {}
  const events: Record<string, unknown>[] = []

  if (body.status !== undefined) {
    if (!(DOCUMENT_STATUSES as readonly string[]).includes(body.status as string)) return bad('Unknown document status.')
    update.status = body.status
    update.verified_by = g.user.id
    if (typeof body.verification_note === 'string') update.verification_note = body.verification_note.trim().slice(0, 2000) || null
    events.push({ event_type: 'status_changed', previous: { status: doc.status }, new_value: { status: body.status }, note: note ?? (update.verification_note as string | null) ?? null })
  }
  if (body.publicly_visible !== undefined) {
    if (typeof body.publicly_visible !== 'boolean') return bad('publicly_visible must be true or false.')
    if (body.publicly_visible && isConfidentialByNature(doc)) return bad('This looks like a confidential commercial document (mandate, agreement or commission). It cannot be made public.', 409)
    if (body.publicly_visible !== !!doc.publicly_visible) {
      update.publicly_visible = body.publicly_visible
      events.push({ event_type: 'visibility_changed', previous: { publicly_visible: !!doc.publicly_visible }, new_value: { publicly_visible: body.publicly_visible }, note })
    }
  }
  if (!Object.keys(update).length) return NextResponse.json({ document: doc, unchanged: true })

  const { data, error } = await g.sb.from('developer_documents').update(update).eq('id', params.id).select('id,status,publicly_visible,verification_note').maybeSingle()
  if (error) return bad(error.message)
  if (!data) return bad('Not permitted, or the document no longer exists.', 403)
  if (events.length) await g.sb.from('document_review_events').insert(events.map(e => ({ document_id: params.id, actor_user_id: g.user.id, ...e })))
  return NextResponse.json({ document: data })
}