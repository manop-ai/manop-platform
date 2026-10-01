// lib/log-site-signal.ts
//
// Site Intelligence writes into the SAME activity_log table
// (and signal_category/signal_weight vocabulary) that already drives
// neighborhood_intelligence and platform_intelligence — not a
// separate signals system. Weights are chosen to sit sensibly
// alongside the existing ones already defined for properties
// (property_view = 2, enquiry_sent = 25, etc.) — see the Signal
// Intelligence Infrastructure migration for those.

import { SupabaseClient } from '@supabase/supabase-js'

type SiteSignalEvent = 'site_submitted' | 'site_quick_review' | 'site_viewed' | 'appraisal_run'

const SIGNAL_CONFIG: Record<SiteSignalEvent, { category: string; weight: number }> = {
  site_submitted:     { category: 'supply', weight: 15 },  // a new site entering the dataset
  site_quick_review:  { category: 'demand', weight: 5 },   // a developer checking interest in an area
  site_viewed:        { category: 'demand', weight: 2 },   // matches property_view's existing weight
  appraisal_run:      { category: 'demand', weight: 15 },  // someone modeling real numbers on a specific site — stronger intent than a view
}

export async function logSiteSignal(
  sb: SupabaseClient,
  event: SiteSignalEvent,
  params: { siteId: string; city?: string | null; neighborhood?: string | null; countryCode?: string | null },
) {
  const { category, weight } = SIGNAL_CONFIG[event]
  try {
    await sb.from('activity_log').insert({
      event_type: event,
      message: `${event.replace(/_/g, ' ')} — ${params.neighborhood || params.city || 'unknown location'}`,
      signal_category: category,
      signal_weight: weight,
      neighborhood: params.neighborhood ?? null,
      city: params.city ?? null,
      country_code: params.countryCode ?? 'NG',
      metadata: { site_id: params.siteId, source: 'site_intelligence' },
    })
  } catch {
    // Signal logging is additive intelligence, never a blocker — a
    // failure here should never fail the actual site submission/view.
  }
}