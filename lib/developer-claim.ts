// lib/developer-claim.ts
//
// Pure rules for a developer claiming an account MANOP created for them (account_status 'unclaimed').
//
// WHAT WAS WRONG: the onboarding page matched the unclaimed account with
//   .ilike('email', <the email typed into the form>)
// - the typed email is not the signed-in identity, so anyone could type another company's email;
// - ilike treats % and _ (and PostgREST also *) as wildcards, so typing "%" matched any unclaimed account.
// Claiming hands the claimant that developer's projects and (through developer_id) its introductions.
//
// NOW: the claim is made on the server (app/api/developer/claim), against the email Supabase Auth
// has CONFIRMED for the caller, compared exactly (case-insensitive, no pattern matching).

/** Exact, case-insensitive email equality. No pattern matching: %, _ and * are ordinary characters here. */
export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export type ClaimCheck =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403; error: string }

/** The caller must have an email that Supabase Auth has confirmed. */
export function checkClaimant(user: { email?: string | null; email_confirmed_at?: string | null } | null): ClaimCheck {
  if (!user) return { ok: false, status: 401, error: 'Sign in required.' }
  const email = (user.email ?? '').trim().toLowerCase()
  if (!email) return { ok: false, status: 403, error: 'Your account has no email address to match.' }
  if (!user.email_confirmed_at) return { ok: false, status: 403, error: 'Confirm your email address first. A MANOP-created developer account can only be claimed from a confirmed email.' }
  return { ok: true, email }
}

export type ClaimMatch =
  | { kind: 'none' }
  | { kind: 'one'; id: string }
  | { kind: 'ambiguous' }

/** Only unclaimed accounts with no login attached are claimable; exactly one may match. */
export function pickClaimable(rows: { id: string; email?: string | null; auth_user_id?: string | null; account_status?: string | null }[], email: string): ClaimMatch {
  const claimable = rows.filter(r => !r.auth_user_id && r.account_status === 'unclaimed' && sameEmail(r.email, email))
  if (claimable.length === 0) return { kind: 'none' }
  if (claimable.length > 1) return { kind: 'ambiguous' }
  return { kind: 'one', id: claimable[0].id }
}

/** What a claimant may set. MANOP's recorded company name, CAC number and track record are NOT overwritten. */
export const CLAIM_EDITABLE = ['contact_name', 'phone', 'website', 'description', 'cities', 'project_scale'] as const

export function claimUpdate(input: Record<string, unknown>, userId: string, nowIso: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of CLAIM_EDITABLE) if (k in input) out[k] = input[k] ?? null
  return { ...out, auth_user_id: userId, account_status: 'claimed', active: true, updated_at: nowIso }
}