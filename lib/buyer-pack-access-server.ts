// lib/buyer-pack-access-server.ts — server-only: who may download a Buyer Pack, and the record that a signed-in buyer was issued one.
// Policy comes from the approved commercial terms version (lib/commercial-server getBuyerPackPolicy). With no approved terms, or terms that do not
// require access, the pack is FREE and open (this is the testing setting: price not approved). When a later terms version sets
// buyer_pack_access_required, a recorded grant for this development and format is needed (lib/commercial-terms buyerPackDecision).
import { sbAdmin } from './supabase/admin'
import { getBuyerPackPolicy } from './commercial-server'
import { buyerPackDecision, BUYER_PACK_FORMAT_VERSION } from './commercial-terms'
import { isMissingTable } from './agency-election-server'

export const PACK_DENIED_MESSAGE: Record<string, string> = {
  access_required: 'This Buyer Pack needs access first. Ask MANOP for access to this development\'s pack.',
  pending: 'Your request for this Buyer Pack is waiting for MANOP.',
  revoked: 'Access to this Buyer Pack has been withdrawn.',
  expired: 'Your access to this Buyer Pack has expired.',
  format_changed: 'The Buyer Pack format has changed. Ask MANOP to renew your access.',
}

export async function checkPackAccess(userId: string | null, projectId: string, isAdmin: boolean): Promise<{ allowed: boolean; reason: string; free: boolean; versionId: string | null }> {
  const policy = await getBuyerPackPolicy()
  let access = null
  if (userId && policy.accessRequired) {
    const { data } = await sbAdmin.from('buyer_pack_access').select('status,basis,format_version,expires_at').eq('project_id', projectId).eq('user_id', userId).eq('format_version', BUYER_PACK_FORMAT_VERSION).maybeSingle()
    access = data ?? null
  }
  const d = buyerPackDecision(policy, access, isAdmin)
  return { allowed: d.allowed, reason: d.reason, free: !policy.accessRequired, versionId: policy.versionId }
}

/** Remember that a signed-in buyer was issued the pack, so it appears on their dashboard. Best effort: never blocks a download. */
export async function recordPackIssued(userId: string, projectId: string, versionId: string | null): Promise<{ recorded: boolean; error?: string }> {
  try {
    const now = new Date().toISOString()
    const { error } = await sbAdmin.from('buyer_pack_access').upsert({
      project_id: projectId, user_id: userId, status: 'granted', basis: 'free_access', format_version: BUYER_PACK_FORMAT_VERSION,
      granted_at: now, granted_by: userId, terms_version_id: versionId, notes: 'Free access (price not yet approved); issued on download',
    }, { onConflict: 'project_id,user_id,format_version', ignoreDuplicates: true })
    if (error) { if (!isMissingTable(error)) console.error('recordPackIssued', error.message); return { recorded: false, error: error.message } }
    return { recorded: true }
  } catch (e: unknown) { console.error('recordPackIssued', e); return { recorded: false, error: e instanceof Error ? e.message : 'error' } }
}