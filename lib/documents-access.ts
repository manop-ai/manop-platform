// lib/documents-access.ts
//
// Document access control, shared by the file-access route, the admin review UI, the public pages and the Buyer Pack.
// Pure functions (no I/O) so the rules can be tested exhaustively.
//
// Two SEPARATE dimensions (existing columns on developer_documents):
//   status           provided | under_review | reviewed | unable_to_verify | requires_further_verification
//   publicly_visible boolean — an explicit MANOP admin decision
// "Reviewed" never publishes a document, and "public" never implies verification.

import { createHash } from 'crypto'

export const DOCUMENT_STATUSES = ['provided', 'under_review', 'reviewed', 'unable_to_verify', 'requires_further_verification'] as const
export type DocStatus = (typeof DOCUMENT_STATUSES)[number]
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  provided: 'Submitted, not reviewed', under_review: 'Under review', reviewed: 'Reviewed',
  unable_to_verify: 'Unable to verify', requires_further_verification: 'Requires further verification',
}

/** Documents that are confidential by their nature and can never be made public or put in a Buyer Pack. */
export function isConfidentialByNature(d: { document_type?: string | null; document_name?: string | null }): boolean {
  return /mandate|agreement|commission|contract|fee[\s_-]?(share|schedule)/i.test(`${d.document_type ?? ''} ${d.document_name ?? ''}`)
}

export const ACCESS_LEVELS = ['public', 'member', 'deal_participant', 'internal', 'restricted'] as const
export type AccessLevel = (typeof ACCESS_LEVELS)[number]
export interface DocLike { id: string; publicly_visible: boolean | null; document_type?: string | null; document_name?: string | null; access_level?: AccessLevel | null }
export interface AccessContext {
  isAdmin: boolean
  /** true when the requester owns the document's development/site (agency or developer that submitted it) */
  isOwner: boolean
  /** the parent development/site is published */
  parentPublished: boolean
  /** an approved member (definition owned by the Agency Subscription / membership design). Undefined = false: FAILS CLOSED. */
  isApprovedMember?: boolean
  /** the requester is a participant (e.g. the buyer) of a deal this document was explicitly SHARED into (document_shares). Undefined = false. */
  isDealParticipantForDoc?: boolean
}

/** NULL access_level means "derive": publicly_visible -> public, otherwise internal. */
export function effectiveAccessLevel(d: DocLike): AccessLevel { return d.access_level ?? (d.publicly_visible === true ? 'public' : 'internal') }
export type AccessDecision = { allowed: true; via: 'admin' | 'owner' | 'public' | 'member' | 'deal_participant' } | { allowed: false }

/** Who may open a file. Admins always; owners their own; the public only what an admin explicitly approved. */
export function decideAccess(doc: DocLike, ctx: AccessContext): AccessDecision {
  if (ctx.isAdmin) return { allowed: true, via: 'admin' }
  if (ctx.isOwner) return { allowed: true, via: 'owner' }
  if (isConfidentialByNature(doc)) return { allowed: false }                // mandates, agreements, commission documents: admin/owner only
  const level = effectiveAccessLevel(doc)
  if (level === 'public') return doc.publicly_visible === true && ctx.parentPublished ? { allowed: true, via: 'public' } : { allowed: false }
  if (level === 'member') return ctx.isApprovedMember === true ? { allowed: true, via: 'member' } : { allowed: false }
  if (level === 'deal_participant') return ctx.isDealParticipantForDoc === true ? { allowed: true, via: 'deal_participant' } : { allowed: false }
  return { allowed: false }                                                   // internal, restricted
}

/** Public lists (public page, Buyer Pack) include ONLY documents an admin approved, never confidential ones. */
export function isPublicDocument(doc: DocLike): boolean {
  return doc.publicly_visible === true && effectiveAccessLevel(doc) === 'public' && !isConfidentialByNature(doc)
}

// ── Cloudinary ────────────────────────────────────────────────────────────────────────────────────
export interface CloudinaryRef { cloud: string; resourceType: 'image' | 'raw' | 'video'; deliveryType: 'upload' | 'authenticated' | 'private' | string; version: string | null; publicId: string; format: string | null }

/** Parses a stored Cloudinary URL. Returns null for anything that is not a Cloudinary delivery URL. */
export function parseCloudinaryUrl(url: string | null | undefined): CloudinaryRef | null {
  if (!url) return null
  const m = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|raw|video)\/(upload|authenticated|private)\/(?:s--[^/]+--\/)?(?:[^/]*,[^/]*\/)*(?:v(\d+)\/)?(.+)$/.exec(url.split('?')[0])
  if (!m) return null
  const [, cloud, resourceType, deliveryType, version, rest] = m
  let publicId = decodeURIComponent(rest), format: string | null = null
  if (resourceType !== 'raw') { const dot = publicId.lastIndexOf('.'); if (dot > 0) { format = publicId.slice(dot + 1); publicId = publicId.slice(0, dot) } }
  return { cloud, resourceType: resourceType as CloudinaryRef['resourceType'], deliveryType, version: version ?? null, publicId, format }
}

/** True when the stored file can be fetched by anyone who has (or guesses) the link. */
export function hasPublicLink(url: string | null | undefined): boolean {
  const p = parseCloudinaryUrl(url)
  return !p || p.deliveryType === 'upload'
}

/** Cloudinary's documented API signature: sorted `k=v` pairs joined with &, secret appended, SHA-1 hex. */
export function signCloudinaryParams(params: Record<string, string | number | boolean | string[] | null | undefined>, apiSecret: string): string {
  const toSign = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '').sort()
    .map(k => `${k}=${Array.isArray(params[k]) ? (params[k] as string[]).join(',') : params[k]}`).join('&')
  return createHash('sha1').update(toSign + apiSecret).digest('hex')
}

/** A short-lived, signed download URL for an authenticated/private Cloudinary asset. */
export function privateDownloadUrl(ref: CloudinaryRef, cfg: { apiKey: string; apiSecret: string }, opts: { ttlSeconds?: number; now?: number } = {}): { url: string; expiresAt: number } {
  const now = Math.floor((opts.now ?? Date.now()) / 1000)
  const expiresAt = now + (opts.ttlSeconds ?? 300)
  const params: Record<string, string | number> = { attachment: 'false', expires_at: expiresAt, public_id: ref.publicId, timestamp: now, type: ref.deliveryType }
  if (ref.format) params.format = ref.format
  const signature = signCloudinaryParams(params, cfg.apiSecret)
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: cfg.apiKey, signature })
  return { url: `https://api.cloudinary.com/v1_1/${ref.cloud}/${ref.resourceType}/download?${qs.toString()}`, expiresAt }
}