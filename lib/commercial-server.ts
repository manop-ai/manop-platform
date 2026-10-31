// lib/commercial-server.ts — server-only reads of the commercial configuration (service role; callers have already authorised).
// The ONLY source of rates and prices is a commercial_terms_versions row. If no version is approved, nothing is assumed:
// prices are null ("not yet confirmed") and Buyer Pack access stays open (pricing not approved).

import { sbAdmin } from './supabase/admin'
import type { BuyerPackPolicy } from './commercial-terms'

export interface TermsVersion {
  id: string; version_label: string; status: string; effective_from: string | null; legal_review_status: string
  success_fee_schedule: unknown; fee_currency: string; fee_payer: string; qualifying_milestones: string[]
  agency_subscription_price: number | null; agency_subscription_currency: string; agency_subscription_period_months: number
  buyer_pack_price: number | null; buyer_pack_currency: string | null; buyer_pack_access_required: boolean
  // present only after sql/phase20 is applied; null/undefined = not decided
  agency_success_fee_schedule?: unknown; agency_fee_payer?: string; agency_entitlements?: unknown
}

export async function getEffectiveTerms(): Promise<TermsVersion | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sbAdmin.from('commercial_terms_versions').select('*').eq('status', 'approved').lte('effective_from', today)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle()
  return (data as TermsVersion) ?? null
}

/** What an agency may see about the subscription: the price and period, never the success-fee schedule. */
export function subscriptionTermsView(v: TermsVersion | null) {
  return v && v.agency_subscription_price !== null
    ? { versionLabel: v.version_label, price: Number(v.agency_subscription_price), currency: v.agency_subscription_currency, periodMonths: v.agency_subscription_period_months, confirmed: true }
    : { versionLabel: v?.version_label ?? null, price: null, currency: null, periodMonths: v?.agency_subscription_period_months ?? 12, confirmed: false }
}

export async function getBuyerPackPolicy(): Promise<BuyerPackPolicy & { versionId: string | null }> {
  const v = await getEffectiveTerms()
  return { accessRequired: v?.buyer_pack_access_required === true, price: v?.buyer_pack_price != null ? Number(v.buyer_pack_price) : null, currency: v?.buyer_pack_currency ?? null, versionId: v?.id ?? null }
}

/** Agency-facing terms (price, agency success-fee schedule, entitlements). Nothing is assumed when a piece is missing. */
export async function getAgencyTerms() {
  const { agencyTermsFromVersion } = await import('./agency-commercial')
  return agencyTermsFromVersion(await getEffectiveTerms() as any)
}