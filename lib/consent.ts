// lib/consent.ts
//
// Signup acknowledgement. Designed to be extended without touching auth:
// bump CONSENT_VERSION and edit the wording here; every new signup records the
// version it accepted. Nothing is stored in a new database column — the record
// travels in the auth user's metadata (user_metadata.consent).
//
// Terms / Privacy links come from environment variables ONLY. The repository
// has no /terms or /privacy pages today, so by default no link is shown and the
// wording does not claim agreement to documents that do not exist.
//   NEXT_PUBLIC_TERMS_URL     e.g. https://manopintel.com/terms
//   NEXT_PUBLIC_PRIVACY_URL   e.g. https://manopintel.com/privacy
//
// Caveat: user_metadata can be edited by the signed-in user, so treat this as a
// convenience record, not tamper-proof evidence. A server-side consents table
// would be the durable fix (schema requirement, not created here).

export const CONSENT_VERSION = '2026-10-signup-v1'
export const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL || ''
export const PRIVACY_URL = process.env.NEXT_PUBLIC_PRIVACY_URL || ''

export const hasLegalLinks = () => !!TERMS_URL && !!PRIVACY_URL

/** The non-legal acknowledgement, always shown. */
export const EVIDENCE_NOTICE =
  'I understand that information provided through MANOP may be based on available evidence, and that MANOP does not provide legal, financial or investment advice.'

export function consentRecord() {
  return {
    consent_version: CONSENT_VERSION,
    accepted_at: new Date().toISOString(),
    terms_url: TERMS_URL || null,
    privacy_url: PRIVACY_URL || null,
  }
}