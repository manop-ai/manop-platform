// lib/agreement-docs-server.ts — server-only helpers for the agreement document routes. Reuses the private-Cloudinary functions written for mandate letters.
import { sbAdmin } from './supabase/admin'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const txt = (v: unknown, max = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export async function logDocEvent(e: { request_id: string; document_id?: string | null; event_type: string; actor_user_id: string | null; actor_role: 'requester' | 'admin' | 'system'; detail?: Record<string, unknown> }) {
  const { error } = await sbAdmin.from('agreement_document_events').insert({ request_id: e.request_id, document_id: e.document_id ?? null, event_type: e.event_type, actor_user_id: e.actor_user_id, actor_role: e.actor_role, detail: e.detail ?? {} })
  if (error) console.error('agreement_document_events insert failed', error.message)
  return !error
}

/** Entry in the request history the requester already sees (agreement_request_events). */
export async function logRequestEvent(e: { request_id: string; actor_user_id: string | null; actor_role: 'admin' | 'requester'; event_type?: string; from_status?: string | null; to_status?: string | null; message: string; visible: boolean }) {
  const { error } = await sbAdmin.from('agreement_request_events').insert({ request_id: e.request_id, actor_user_id: e.actor_user_id, actor_role: e.actor_role, event_type: e.event_type ?? 'status_changed', from_status: e.from_status ?? null, to_status: e.to_status ?? null, message: e.message, visible_to_requester: e.visible })
  if (error) console.error('agreement_request_events insert failed', error.message)
}

/** Move a request's status only if it is still where we think it is (guards against two people acting at once). */
export async function moveRequest(id: string, from: string, to: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  const { data } = await sbAdmin.from('agreement_requests').update({ status: to, status_updated_at: now, updated_at: now, ...extra }).eq('id', id).eq('status', from).select('id,status').maybeSingle()
  return !!data
}

/** Fields safe to show a requester. Never storage identifiers. */
export function publicDoc(d: any) {
  return { id: d.id, kind: d.kind, status: d.status, versionNumber: d.version_number, issuedVersionId: d.issued_version_id, title: d.title, scopeSummary: d.scope_summary, termsSummary: d.terms_summary,
    legalReviewStatus: d.legal_review_status, coveredProjectIds: d.covered_project_ids ?? [], filename: d.original_filename, bytes: d.bytes, issuedAt: d.issued_at, uploadedAt: d.uploaded_at,
    requesterNote: d.requester_note, reviewNote: ['held', 'rejected'].includes(d.status) ? d.review_note : null, countersignedAt: d.countersigned_at, createdAt: d.created_at }
}
export function adminDoc(d: any) {
  return { ...publicDoc(d), reviewNote: d.review_note, reviewedAt: d.reviewed_at, countersignerName: d.countersigner_name, countersignerTitle: d.countersigner_title, signingMethod: d.signing_method, signingReference: d.signing_reference, uploadedByRole: d.uploaded_by_role }
}

/** Exact coverage: an executed request whose ISSUED version named this development AND which has a completed record. Nothing else counts. */
export async function executedCoverageFor(projectId: string): Promise<{ requestId: string; reference: string } | null> {
  const { data: issued } = await sbAdmin.from('agreement_documents').select('id,request_id').eq('kind', 'issued').eq('status', 'issued').contains('covered_project_ids', [projectId])
  if (!issued?.length) return null
  const { data: finals } = await sbAdmin.from('agreement_documents').select('request_id,issued_version_id').eq('kind', 'final_executed').eq('status', 'final').in('issued_version_id', issued.map(i => i.id))
  if (!finals?.length) return null
  const { data: reqs } = await sbAdmin.from('agreement_requests').select('id,reference,status').in('id', finals.map(f => f.request_id)).eq('status', 'executed')
  return reqs?.[0] ? { requestId: reqs[0].id, reference: reqs[0].reference } : null
}

/** The open (or most recent) agreement request that includes this development, for the progress page. */
export async function agreementRequestFor(projectId: string): Promise<{ id: string; reference: string; status: string } | null> {
  const { data: links } = await sbAdmin.from('agreement_request_developments').select('request_id').eq('project_id', projectId)
  if (!links?.length) return null
  const { data: reqs } = await sbAdmin.from('agreement_requests').select('id,reference,status,created_at').in('id', links.map(l => l.request_id)).order('created_at', { ascending: false })
  const open = (reqs ?? []).find(r => !['declined', 'withdrawn'].includes(r.status))
  const r = open ?? (reqs ?? [])[0]
  return r ? { id: r.id, reference: r.reference, status: r.status } : null
}