// lib/agency-subscription-server.ts — server-only helpers for the custom Agency Subscription workflow. Callers have already authorised.
import { sbAdmin } from './supabase/admin'
import { isMissingTable } from './agency-election-server'

export { isMissingTable }

export async function logEvent(e: { agency_id: string; event_type: string; actor_user_id: string | null; actor_role: 'agency' | 'admin' | 'system'; request_id?: string | null; proposal_id?: string | null; election_id?: string | null; subscription_id?: string | null; detail?: Record<string, unknown> }) {
  try {
    const { error } = await sbAdmin.from('agency_commercial_events').insert({ agency_id: e.agency_id, event_type: e.event_type, actor_user_id: e.actor_user_id, actor_role: e.actor_role, request_id: e.request_id ?? null, proposal_id: e.proposal_id ?? null, election_id: e.election_id ?? null, subscription_id: e.subscription_id ?? null, detail: e.detail ?? {} })
    if (error) console.error('agency_commercial_events insert failed', error.message)
  } catch (err) { console.error('agency_commercial_events insert failed', err) }
}

/** Idempotent: issued proposals past their expiry become expired and their open request becomes expired. Safe to call on every read. */
export async function expireStale(agencyId?: string) {
  const now = new Date().toISOString()
  let q = sbAdmin.from('agency_subscription_proposals').select('id,request_id,agency_id').eq('status', 'issued').lte('expires_at', now)
  if (agencyId) q = q.eq('agency_id', agencyId)
  const { data, error } = await q
  if (error || !data?.length) return
  for (const p of data) {
    const { data: upd } = await sbAdmin.from('agency_subscription_proposals').update({ status: 'expired', updated_at: now }).eq('id', p.id).eq('status', 'issued').select('id')
    if (upd?.length) {
      await sbAdmin.from('agency_subscription_requests').update({ status: 'expired', updated_at: now }).eq('id', p.request_id).eq('status', 'proposal_issued')
      await logEvent({ agency_id: p.agency_id, event_type: 'proposal_expired', actor_user_id: null, actor_role: 'system', request_id: p.request_id, proposal_id: p.id })
    }
  }
}

/** A subscription created from this route may only be paid, approved or activated once its proposal has been accepted. */
export async function acceptedProposalFor(sub: { proposal_id?: string | null }): Promise<{ ok: boolean; reason?: string }> {
  if (!sub.proposal_id) return { ok: false, reason: 'This subscription has no accepted proposal. A custom subscription needs a MANOP proposal that the agency has accepted.' }
  const { data } = await sbAdmin.from('agency_subscription_proposals').select('status').eq('id', sub.proposal_id).maybeSingle()
  return data?.status === 'accepted' ? { ok: true } : { ok: false, reason: 'The linked proposal has not been accepted by the agency.' }
}