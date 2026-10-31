// lib/agency-election-server.ts — server-only reads/writes of agency_commercial_elections. Callers have already authorised.
// If sql/phase20 has not been applied, the table does not exist: every helper then reports `unavailable` instead of failing, so the
// existing Agency Subscription flow keeps working unchanged.

import type { ElectionRow } from './agency-commercial'
import { endDateForReplaced } from './agency-commercial'

export const isMissingTable = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? ''))

type Client = { from: (t: string) => any }

export async function listElections(sb: Client, agencyId: string): Promise<{ rows: any[]; unavailable: boolean; error: string | null }> {
  const { data, error } = await sb.from('agency_commercial_elections').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false })
  if (error) return { rows: [], unavailable: isMissingTable(error), error: isMissingTable(error) ? null : error.message }
  return { rows: data ?? [], unavailable: false, error: null }
}

export const asElectionRow = (r: any): ElectionRow => ({ id: r.id, model: r.model, status: r.status, effective_from: r.effective_from, effective_to: r.effective_to, subscription_id: r.subscription_id ?? null })

/**
 * Make `target` the active election: the active one it replaces ends the day before, with a reason. If activation fails after the old
 * election was ended, the old one is restored, so an agency is never left with no route by a half-finished change.
 */
export async function activateElection(sb: Client, target: any, effectiveFrom: string, actorId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const { data: act } = await sb.from('agency_commercial_elections').select('*').eq('agency_id', target.agency_id).eq('status', 'active').maybeSingle()
  if (act && act.id === target.id) return { ok: false, error: 'Already active.' }
  if (act) {
    const end = endDateForReplaced(effectiveFrom)
    if (act.effective_from && end < act.effective_from) return { ok: false, error: 'The new route cannot start before the current route began.' }
    const { error: e1 } = await sb.from('agency_commercial_elections').update({ status: 'ended', effective_to: end, ended_reason: reason, updated_at: new Date().toISOString() }).eq('id', act.id)
    if (e1) return { ok: false, error: e1.message }
  }
  const { error: e2 } = await sb.from('agency_commercial_elections').update({ status: 'active', effective_from: effectiveFrom, activated_by: actorId, supersedes_id: act?.id ?? null, updated_at: new Date().toISOString() }).eq('id', target.id).eq('status', 'proposed')
  if (e2) {
    if (act) await sb.from('agency_commercial_elections').update({ status: 'active', effective_to: null, ended_reason: null }).eq('id', act.id)
    return { ok: false, error: e2.message }
  }
  return { ok: true }
}