// lib/developer-setup.ts — what "set up" means for a developer account, in one place so the dashboard, the API and the tests agree.
// Profile complete = the fields the onboarding form asks for as required, plus a phone number MANOP can reach. Verification is MANOP's decision
// (developer_accounts.verified, set only by a MANOP admin); a developer can ask for it, never grant it.

export interface DeveloperAccountLike {
  company_name?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  cities?: string[] | null
  verified?: boolean | null
  verification_requested_at?: string | null
}

export type SetupStepState = 'done' | 'todo' | 'waiting'

export interface SetupStatus {
  profileComplete: boolean
  missing: string[]
  verified: boolean
  verificationRequestedAt: string | null
  verification: SetupStepState        // done = verified, waiting = requested and MANOP has not answered, todo = not asked yet
}

const has = (v: unknown) => typeof v === 'string' && v.trim().length > 0

export function developerSetupStatus(a: DeveloperAccountLike | null | undefined): SetupStatus {
  const acct = a ?? {}
  const missing: string[] = []
  if (!has(acct.company_name)) missing.push('Company name')
  if (!has(acct.contact_name)) missing.push('Contact name')
  if (!has(acct.email)) missing.push('Email')
  if (!has(acct.phone)) missing.push('Phone number')
  if (!Array.isArray(acct.cities) || acct.cities.length === 0) missing.push('At least one city')
  const verified = acct.verified === true
  const requested = acct.verification_requested_at ?? null
  return {
    profileComplete: missing.length === 0,
    missing,
    verified,
    verificationRequestedAt: requested,
    verification: verified ? 'done' : requested ? 'waiting' : 'todo',
  }
}

/** A developer may ask for verification only once the profile is complete, and only if not already verified or already asked. */
export function canRequestVerification(s: SetupStatus): { ok: true } | { ok: false; reason: string } {
  if (s.verified) return { ok: false, reason: 'This account is already verified.' }
  if (!s.profileComplete) return { ok: false, reason: `Complete your profile first. Missing: ${s.missing.join(', ')}.` }
  if (s.verificationRequestedAt) return { ok: false, reason: 'Verification has already been requested. MANOP will be in touch.' }
  return { ok: true }
}