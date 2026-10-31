// lib/development-admin.ts — pure rules for suspending, reinstating and deleting a development (no I/O).
//   suspend    reversible, needs a reason, keeps every record, takes it off the public site
//   reinstate  clears the suspension only; publishing is a separate admin step (and passes the agreement gate for partner-submitted ones)
//   delete     permanent, only when nothing depends on it, and only after typing the exact name. Counts we could not read (null) count as "unknown":
//              unknown is never treated as zero.

export interface AttachedRecords { enquiries: number | null; agreementRequests: number | null; mandateLetters: number | null }

export function planSuspend(i: { suspendedAt: string | null; reason: unknown }): { ok: boolean; error?: string } {
  if (i.suspendedAt) return { ok: false, error: 'This development is already suspended.' }
  if (typeof i.reason !== 'string' || i.reason.trim().length < 5) return { ok: false, error: 'Give a reason for suspending it (a short sentence). The reason is kept on the record.' }
  return { ok: true }
}

export function planReinstate(i: { suspendedAt: string | null }): { ok: boolean; error?: string } {
  return i.suspendedAt ? { ok: true } : { ok: false, error: 'This development is not suspended.' }
}

export function planDelete(i: { records: AttachedRecords; confirmName: unknown; name: string }): { ok: boolean; error?: string } {
  const r = i.records
  if (r.enquiries === null || r.agreementRequests === null || r.mandateLetters === null) return { ok: false, error: 'MANOP could not check what depends on this development, so it will not be deleted. Suspend it instead.' }
  const parts: string[] = []
  if (r.enquiries > 0) parts.push(`${r.enquiries} enquiry record${r.enquiries === 1 ? '' : 's'}`)
  if (r.agreementRequests > 0) parts.push(`${r.agreementRequests} agreement request${r.agreementRequests === 1 ? '' : 's'}`)
  if (r.mandateLetters > 0) parts.push(`${r.mandateLetters} mandate letter${r.mandateLetters === 1 ? '' : 's'}`)
  if (parts.length) return { ok: false, error: `This development has ${parts.join(', ')}, which must be kept. Suspend it instead of deleting it.` }
  if (typeof i.confirmName !== 'string' || i.confirmName.trim() !== i.name.trim()) return { ok: false, error: 'Type the exact development name to confirm the deletion.' }
  return { ok: true }
}