// lib/mandate-letter-db.ts — server-only: audit events for mandate letters. Append-only table; a failed log write is reported, never silent.
import { sbAdmin } from './supabase/admin'

export async function logLetterEvent(e: { letter_id: string; agency_id: string; event_type: string; actor_user_id: string | null; actor_role: 'agency' | 'admin' | 'system'; detail?: Record<string, unknown> }) {
  const { error } = await sbAdmin.from('mandate_letter_events').insert({ letter_id: e.letter_id, agency_id: e.agency_id, event_type: e.event_type, actor_user_id: e.actor_user_id, actor_role: e.actor_role, detail: e.detail ?? {} })
  if (error) console.error('mandate_letter_events insert failed', error.message)
  return !error
}
export const isMissingTable = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''))