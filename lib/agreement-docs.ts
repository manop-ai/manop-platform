// lib/agreement-docs.ts
//
// Pure rules for the agreement document trail (no network, no database). Three kinds of file, never confused:
//   issued         a version MANOP prepared and sent. Revisions are NEW versions; old ones stay on record.
//   signed_copy    the partner's physically signed copy of ONE exact issued version (MANOP signed the issued version first). A submission for review, not execution.
//   final_executed the COMPLETED record: the accepted partner-signed copy, recorded by MANOP. Only this makes a request "executed".
// Nothing here verifies an opportunity, publishes it or activates commercial coverage.

import { validateUpload, MAX_BYTES, ALLOWED_EXTENSIONS } from './mandate-letter'
export { MAX_BYTES, ALLOWED_EXTENSIONS }
export const validateAgreementUpload = validateUpload

export type DocKind = 'issued' | 'signed_copy' | 'final_executed'
export type DocStatus = 'pending_upload' | 'upload_failed' | 'draft' | 'issued' | 'superseded' | 'withdrawn' | 'received' | 'accepted' | 'held' | 'rejected' | 'final'
export interface DocRow { id: string; request_id: string; kind: DocKind; status: DocStatus; version_number: number; issued_version_id: string | null; cloudinary_public_id?: string | null }

export const OPPORTUNITY_KINDS = ['development', 'land', 'redevelopment', 'agency_level'] as const
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number]
export const OPPORTUNITY_LABEL: Record<OpportunityKind, string> = { development: 'Development', land: 'Land opportunity', redevelopment: 'Redevelopment opportunity', agency_level: 'Agency-level arrangement (no single development)' }

/** Server-generated storage id. The user's filename is never part of it. */
export const agreementPublicId = (requestId: string, docId: string, ext: string) => `agreement-docs/${requestId}/${docId}.${ext}`
export const agreementPublicIdBelongs = (requestId: string, docId: string, publicId: string | null | undefined) => !!publicId && publicId.startsWith(`agreement-docs/${requestId}/${docId}.`)

export const DOC_LABEL: Record<DocStatus, string> = {   // 'final' = the completed record
  pending_upload: 'Upload not finished', upload_failed: 'Upload failed', draft: 'Prepared, not yet sent', issued: 'Current version, sent to you', superseded: 'Replaced by a newer version',
  withdrawn: 'Withdrawn', received: 'Received, waiting for MANOP review', accepted: 'Accepted by MANOP', held: 'Held, needs correction', rejected: 'Not accepted', final: 'Completed (recorded by MANOP)',
}

/** Does the document exist as far as THIS viewer is concerned? Requesters never see drafts, withdrawn versions or unfinished uploads. */
export function visibleToRequester(d: Pick<DocRow, 'kind' | 'status'>): boolean {
  if (d.kind === 'issued') return ['issued', 'superseded'].includes(d.status)
  if (d.kind === 'signed_copy') return ['received', 'accepted', 'held', 'rejected', 'superseded'].includes(d.status)
  return d.status === 'final'
}

export type Viewer = { role: 'admin' } | { role: 'requester'; userId: string; requestOwnerUserId: string | null }
export function canOpenDocument(v: Viewer, d: Pick<DocRow, 'kind' | 'status'>): { allowed: boolean; reason?: string } {
  if (v.role === 'admin') return d.status === 'pending_upload' || d.status === 'upload_failed' ? { allowed: false, reason: 'not_stored' } : { allowed: true }
  if (!v.requestOwnerUserId || v.userId !== v.requestOwnerUserId) return { allowed: false, reason: 'not_yours' }
  return visibleToRequester(d) ? { allowed: true } : { allowed: false, reason: 'not_available' }
}

// ── MANOP prepares and sends ────────────────────────────────────────────────────────────────────────────────────
const CAN_PREPARE_FROM = ['ready_for_agreement_preparation', 'agreement_prepared', 'agreement_sent', 'awaiting_signature', 'signed_copy_received', 'countersignature_pending']
export function canPrepareVersion(status: string): { ok: boolean; error?: string } {
  return CAN_PREPARE_FROM.includes(status) ? { ok: true } : { ok: false, error: 'An agreement can be prepared once the request is ready for agreement preparation.' }
}
export interface IssueInput { title: unknown; scopeSummary: unknown; termsSummary: unknown; coveredProjectIds: string[]; opportunityKind: string | null }
export function planIssue(i: IssueInput, requestStatus: string): { ok: boolean; error?: string } {
  const c = canPrepareVersion(requestStatus); if (!c.ok) return c
  if (typeof i.title !== 'string' || !i.title.trim()) return { ok: false, error: 'Give this version a title (for example "MANOP agency agreement v1").' }
  if (typeof i.scopeSummary !== 'string' || !i.scopeSummary.trim()) return { ok: false, error: 'State what this agreement covers, in plain words.' }
  if (typeof i.termsSummary !== 'string' || !i.termsSummary.trim()) return { ok: false, error: 'Summarise the commercial terms exactly as the document states them. Nothing is applied automatically from this summary.' }
  if (i.opportunityKind === 'development' && i.coveredProjectIds.length === 0) return { ok: false, error: 'A development agreement must name at least one development.' }
  return { ok: true }
}

// ── Requester returns a signed copy ──────────────────────────────────────────────────────────────────────────────
export function canUploadSigned(requestStatus: string, version: Pick<DocRow, 'kind' | 'status'> | null): { ok: boolean; error?: string } {
  if (!version || version.kind !== 'issued') return { ok: false, error: 'Choose the agreement version you are signing.' }
  if (version.status !== 'issued') return { ok: false, error: version.status === 'superseded' ? 'MANOP has issued a newer version. Download and sign the current one.' : 'That version is not available for signing.' }
  if (!['agreement_sent', 'awaiting_signature'].includes(requestStatus)) {
    return { ok: false, error: requestStatus === 'signed_copy_received' || requestStatus === 'countersignature_pending' ? 'MANOP already has your signed copy and is reviewing it.' : requestStatus === 'executed' ? 'This agreement is already executed.' : 'A signed copy cannot be uploaded at this stage.' }
  }
  return { ok: true }
}

export type SignedReviewAction = 'accept' | 'hold' | 'reject'
export function planSignedReview(action: unknown, note: unknown, requestStatus: string, copy: Pick<DocRow, 'kind' | 'status'>): { ok: boolean; error?: string; copyStatus?: DocStatus; requestStatus?: string } {
  if (copy.kind !== 'signed_copy' || copy.status !== 'received') return { ok: false, error: 'Only a signed copy that is waiting for review can be reviewed.' }
  if (requestStatus !== 'signed_copy_received') return { ok: false, error: 'The request is not waiting for a signed-copy review.' }
  const n = typeof note === 'string' ? note.trim() : ''
  if (action === 'accept') return { ok: true, copyStatus: 'accepted', requestStatus: 'countersignature_pending' }
  if (action === 'hold' || action === 'reject') {
    if (!n) return { ok: false, error: 'Tell the requester what is wrong (incomplete, unreadable, altered, or not the issued version).' }
    return { ok: true, copyStatus: action === 'hold' ? 'held' : 'rejected', requestStatus: 'awaiting_signature' }
  }
  return { ok: false, error: 'Unknown review action.' }
}

// ── MANOP records the agreement as completed ───────────────────────────────────────────────────────────────────────
// MANOP signs the prepared agreement FIRST (outside this system) and sends that signed PDF. The partner signs by hand and uploads the copy.
// Once MANOP has reviewed and accepted the returned copy, recording it as completed stores that accepted copy as the completed record.
// There is no second MANOP signature step and no digital-signature process here (not required unless MANOP decides it separately).
export function planCompletion(requestStatus: string, acceptedCopy: Pick<DocRow, 'kind' | 'status' | 'issued_version_id'> | null, issuedVersion: Pick<DocRow, 'id' | 'status'> | null):
  { ok: boolean; error?: string } {
  if (requestStatus !== 'countersignature_pending') return { ok: false, error: 'An agreement can be recorded as completed only after MANOP has accepted the returned signed copy.' }
  if (!acceptedCopy || acceptedCopy.kind !== 'signed_copy' || acceptedCopy.status !== 'accepted') return { ok: false, error: 'There is no accepted signed copy to record.' }
  if (!issuedVersion || issuedVersion.id !== acceptedCopy.issued_version_id || issuedVersion.status !== 'issued') return { ok: false, error: 'The signed copy does not belong to the current issued version.' }
  return { ok: true }
}

/** The one place a request is allowed to count as executed coverage. */
export function coversProject(r: { status: string; hasFinalRecord: boolean; coveredProjectIds: string[] }, projectId: string): boolean {
  return r.status === 'executed' && r.hasFinalRecord && r.coveredProjectIds.includes(projectId)
}

/** Plain-language next step for the requester, from the request status and its documents. */
export function requesterNextStep(status: string, docs: Pick<DocRow, 'kind' | 'status'>[]): string {
  const issued = docs.find(d => d.kind === 'issued' && d.status === 'issued')
  const held = docs.find(d => d.kind === 'signed_copy' && ['held', 'rejected'].includes(d.status))
  switch (status) {
    case 'agreement_sent': case 'awaiting_signature':
      return held ? 'MANOP could not accept your signed copy. Read the note, then sign and upload the current version again.' : issued ? 'Download the agreement, read it, sign it by hand and upload the signed copy.' : 'MANOP is preparing your agreement.'
    case 'signed_copy_received': return 'MANOP has your signed copy and is checking it. Nothing more is needed from you unless MANOP asks.'
    case 'countersignature_pending': return 'Your signed copy has been accepted. MANOP will record the agreement as completed.'
    case 'executed': return 'The agreement is completed and recorded by MANOP. You can download the completed copy below.'
    default: return ''
  }
}