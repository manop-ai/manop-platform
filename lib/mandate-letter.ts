// lib/mandate-letter.ts
//
// Pure rules for agency mandate letters: what may be uploaded, how a file is recognised, who may open it, and which status and
// visibility changes are allowed. No network or database here, so every rule is unit-tested.
//
// Three DIFFERENT things are kept apart on purpose and never inferred from each other:
//   review_status  uploaded -> under_review -> approved | changes_requested | rejected   (is the letter acceptable proof of authority?)
//   visibility     internal (default) | public                                          (may anyone outside MANOP open it?)
//   the agency's verification and the development's review/publication (separate records, not touched here)
// Approval of a letter never makes it public, and never approves the development it supports.

export const MAX_BYTES = 10 * 1024 * 1024                      // 10 MB
export const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const
export type Ext = (typeof ALLOWED_EXTENSIONS)[number]

export const REVIEW_STATUSES = ['pending_upload', 'uploaded', 'under_review', 'approved', 'changes_requested', 'rejected', 'superseded', 'removed', 'upload_failed'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export const VISIBILITIES = ['internal', 'public'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending_upload: 'Upload not finished', uploaded: 'Received, waiting for MANOP review', under_review: 'Being reviewed by MANOP', approved: 'Accepted by MANOP as proof of authority',
  changes_requested: 'MANOP needs a corrected or clearer letter', rejected: 'Not accepted', superseded: 'Replaced by a newer letter', removed: 'Removed', upload_failed: 'Upload failed, please try again',
}
export const STATUS_NEXT_STEP: Record<ReviewStatus, string> = {
  pending_upload: 'Finish uploading the file, or start again.', uploaded: 'No action needed. MANOP will review it.', under_review: 'No action needed.',
  approved: 'Your letter is accepted as proof of authority. This is separate from MANOP’s review and publication of the development itself.',
  changes_requested: 'Read MANOP’s note and upload a corrected letter.', rejected: 'Read MANOP’s note. You can upload a different letter.', superseded: 'A newer letter replaced this one.', removed: 'This letter was removed.', upload_failed: 'Try uploading the file again.',
}

export function extensionOf(name: string): string { const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim()); return m ? m[1].toLowerCase() : '' }

/** Safe display name: no path parts, no control characters. The original name is never used to build a storage path. */
export function cleanFilename(name: string): string { return name.replace(/[\\/\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'mandate-letter' }

export function validateUpload(i: { filename: unknown; bytes: unknown }): { ok: boolean; error?: string; ext?: Ext; bytes?: number; filename?: string } {
  if (typeof i.filename !== 'string' || !i.filename.trim()) return { ok: false, error: 'Choose a file to upload.' }
  const ext = extensionOf(i.filename) as Ext
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { ok: false, error: 'Upload a PDF, JPG or PNG file.' }
  const bytes = Number(i.bytes)
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: 'That file looks empty.' }
  if (bytes > MAX_BYTES) return { ok: false, error: `The file is too large. The limit is ${MAX_BYTES / 1024 / 1024} MB.` }
  return { ok: true, ext, bytes, filename: cleanFilename(i.filename) }
}

/** What a file actually IS, from its first bytes. The browser-supplied type and the file name are never trusted. */
export function sniffType(head: Uint8Array): Ext | null {
  const b = (i: number) => head[i]
  if (head.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return 'pdf'                          // %PDF-
  if (head.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpg'
  if (head.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'png'
  return null
}
export const sameKind = (declared: string, sniffed: Ext | null) => !!sniffed && (declared === sniffed || (declared === 'jpeg' && sniffed === 'jpg'))

/** Storage path: only server-generated ids, so nothing user-chosen or guessable-by-name appears in it. */
export function publicIdFor(agencyId: string, letterId: string, ext: string): string { return `mandate-letters/${agencyId}/${letterId}.${ext === 'jpeg' ? 'jpg' : ext}` }
export function publicIdBelongsTo(publicId: string, agencyId: string, letterId: string): boolean { return /^mandate-letters\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(publicId) && publicId.startsWith(`mandate-letters/${agencyId}/${letterId}.`) }

export interface LetterFacts { status: ReviewStatus; visibility: Visibility; agency_id: string; project_id?: string | null }
export interface Caller { isAdmin: boolean; agencyId: string | null }

/** Who may open the document. Public access exists ONLY when an admin recorded public visibility on an accepted, current letter of a published development. */
export function decideLetterAccess(l: LetterFacts, c: Caller, ctx: { parentPublished: boolean }): { allowed: boolean; via?: 'admin' | 'owner' | 'public' } {
  if (['pending_upload', 'upload_failed', 'removed'].includes(l.status)) return { allowed: false }       // no stored file to open
  if (c.isAdmin) return { allowed: true, via: 'admin' }
  if (c.agencyId && c.agencyId === l.agency_id) return { allowed: true, via: 'owner' }
  if (l.visibility === 'public' && l.status === 'approved' && (!l.project_id || ctx.parentPublished)) return { allowed: true, via: 'public' }
  return { allowed: false }
}

export type AdminAction = 'start_review' | 'approve' | 'request_changes' | 'reject' | 'set_visibility' | 'remove'

/** Review and visibility are separate decisions. `set_visibility` never changes review status; no review action changes visibility except supersede/remove/reject, which force it back to internal. */
export function planAdminAction(l: { status: ReviewStatus; visibility: Visibility }, a: { action: AdminAction; note?: string | null; visibility?: Visibility }): { ok: boolean; error?: string; patch?: Record<string, unknown>; event?: string } {
  const note = (a.note ?? '').trim()
  switch (a.action) {
    case 'start_review':
      if (l.status !== 'uploaded') return { ok: false, error: 'Only a newly received letter can be moved to review.' }
      return { ok: true, patch: { status: 'under_review' }, event: 'review_started' }
    case 'approve':
      if (!['uploaded', 'under_review'].includes(l.status)) return { ok: false, error: 'Only a letter that is waiting for review can be accepted.' }
      return { ok: true, patch: { status: 'approved' }, event: 'approved' }          // visibility deliberately untouched
    case 'request_changes':
    case 'reject':
      if (!['uploaded', 'under_review', 'approved'].includes(l.status)) return { ok: false, error: 'This letter can no longer be reviewed.' }
      if (note.length < 5) return { ok: false, error: 'Tell the agency what is wrong, so they can act on it.' }
      return { ok: true, patch: { status: a.action === 'reject' ? 'rejected' : 'changes_requested', visibility: 'internal' }, event: a.action === 'reject' ? 'rejected' : 'changes_requested' }
    case 'set_visibility': {
      if (a.visibility !== 'public' && a.visibility !== 'internal') return { ok: false, error: 'Choose internal or public.' }
      if (a.visibility === l.visibility) return { ok: false, error: `This letter is already ${l.visibility}.` }
      if (a.visibility === 'public') {
        if (l.status !== 'approved') return { ok: false, error: 'Only a letter MANOP has accepted can be made public.' }
        if (note.length < 5) return { ok: false, error: 'Record why this letter is being made public.' }
      }
      if (a.visibility === 'internal' && note.length < 5) return { ok: false, error: 'Record why public access is being withdrawn.' }
      return { ok: true, patch: { visibility: a.visibility }, event: a.visibility === 'public' ? 'made_public' : 'made_internal' }
    }
    case 'remove':
      if (['removed'].includes(l.status)) return { ok: false, error: 'Already removed.' }
      if (note.length < 5) return { ok: false, error: 'Record why the file is being removed.' }
      return { ok: true, patch: { status: 'removed', visibility: 'internal' }, event: 'removed' }
    default: return { ok: false, error: 'Unknown action.' }
  }
}

/** Fields an agency (owner) may see. Cloudinary identifiers and signed URLs never leave the server in a list. */
export function ownerView(l: Record<string, any>) {
  const s = l.status as ReviewStatus
  return { id: l.id, projectId: l.project_id ?? null, filename: l.original_filename, bytes: l.bytes, format: l.format, status: s, statusLabel: STATUS_LABEL[s] ?? s, nextStep: STATUS_NEXT_STEP[s] ?? '', reviewNote: ['changes_requested', 'rejected'].includes(s) ? l.review_note ?? null : null, uploadedAt: l.uploaded_at, reviewedAt: l.reviewed_at ?? null, version: l.version }
}