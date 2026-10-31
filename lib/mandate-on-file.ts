// lib/mandate-on-file.ts — server-only. "Mandate on file" for an agency submission means: an uploaded letter that MANOP has ACCEPTED,
// or (older submissions only) a legacy document link on the record. An uploaded letter that is still waiting for review does not count.
import { sbAdmin } from './supabase/admin'

export async function acceptedLetterIds(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const list = Array.from(new Set(ids.filter((x): x is string => !!x)))
  if (!list.length) return new Set()
  const { data } = await sbAdmin.from('agency_mandate_letters').select('id,status').in('id', list)
  return new Set((data ?? []).filter(r => r.status === 'approved').map(r => r.id))
}

export async function mandateOnFile(p: { mandate_document_url?: string | null; mandate_letter_id?: string | null } | null | undefined): Promise<boolean> {
  if (!p) return false
  if (p.mandate_letter_id) return (await acceptedLetterIds([p.mandate_letter_id])).has(p.mandate_letter_id)
  return !!p.mandate_document_url
}