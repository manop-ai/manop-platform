// lib/demand.ts — UPDATED v2
// Signal Intelligence Layer — MANOP
//
// Every user action is a signal. Signals compound into intelligence.
// This file is the primary signal capture layer for the platform.
//
// Signal taxonomy:
//   DEMAND:      search_location(1), property_view(2), property_save(5),
//                contact_click(10), phone_reveal(20), enquiry_sent(25)
//   FINANCING:   financing_requested(30-40), financing_approved(50), financing_closed(100)
//   TRUST:       association_membership_verified(25), cac_verified(20), verification_approved(20)
//   TRANSACTION: transaction_submitted(15), transaction_verified(30)
//   SUPPLY:      listing_created(3), listing_updated(1), listing_removed(4)
//   PARTICIPATION: agency_login(1), data_contribution(20)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

// Signal decay rules (days until signal expires)
const SIGNAL_DECAY_DAYS: Record<string, number> = {
  search_location:   7,
  search_filter:     7,
  property_view:     14,
  property_save:     30,
  contact_click:     60,
  phone_reveal:      60,
  enquiry_sent:      60,
  financing_requested: 90,
  financing_approved:  0,  // 0 = never expires
  financing_closed:    0,
  transaction_verified: 0,
  verification_approved: 0,
  association_membership_verified: 0,
}

export type SignalType =
  | 'search_location'
  | 'search_filter'
  | 'property_view'
  | 'property_save'
  | 'contact_click'
  | 'phone_reveal'
  | 'enquiry_sent'
  | 'financing_requested'
  | 'financing_approved'
  | 'financing_closed'
  | 'transaction_submitted'
  | 'transaction_verified'
  | 'verification_approved'
  | 'association_membership_verified'
  | 'listing_created'
  | 'listing_updated'
  | 'listing_removed'
  | 'cac_verified'
  | 'data_contribution'

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  search_location:   1,
  search_filter:     1,
  property_view:     2,
  property_save:     5,
  contact_click:     10,
  phone_reveal:      20,
  enquiry_sent:      25,
  financing_requested: 30,
  financing_approved:  50,
  financing_closed:    100,
  transaction_submitted: 15,
  transaction_verified:  30,
  verification_approved: 20,
  association_membership_verified: 25,
  listing_created:   3,
  listing_updated:   1,
  listing_removed:   4,
  cac_verified:      20,
  data_contribution: 20,
}

const SIGNAL_CATEGORIES: Record<SignalType, string> = {
  search_location:   'demand',
  search_filter:     'demand',
  property_view:     'demand',
  property_save:     'demand',
  contact_click:     'demand',
  phone_reveal:      'demand',
  enquiry_sent:      'demand',
  financing_requested: 'financing',
  financing_approved:  'financing',
  financing_closed:    'financing',
  transaction_submitted: 'transaction',
  transaction_verified:  'transaction',
  verification_approved: 'trust',
  association_membership_verified: 'trust',
  listing_created:   'supply',
  listing_updated:   'supply',
  listing_removed:   'supply',
  cac_verified:      'trust',
  data_contribution: 'participation',
}

export interface DemandSignal {
  signal_type:   SignalType
  neighborhood?: string
  city?:         string
  country_code?: string
  property_id?:  string
  partner_id?:   string
  metadata?:     Record<string, unknown>
}

// ── Log a signal ──────────────────────────────────────────────
// Fire-and-forget — never block the UI for analytics
// Now writes enriched data including signal_category, signal_weight,
// neighborhood top-level column, and expires_at
export async function logSignal(signal: DemandSignal): Promise<void> {
  try {
    const weight   = SIGNAL_WEIGHTS[signal.signal_type] ?? 1
    const category = SIGNAL_CATEGORIES[signal.signal_type] ?? 'demand'
    const decayDays = SIGNAL_DECAY_DAYS[signal.signal_type]
    const expiresAt = decayDays > 0
      ? new Date(Date.now() + decayDays * 24 * 60 * 60 * 1000).toISOString()
      : null  // null = never expires

    await supabase.from('activity_log').insert({
      event_type:       signal.signal_type,
      message:          `${signal.signal_type}${signal.neighborhood ? ` · ${signal.neighborhood}` : ''}`,
      signal_category:  category,
      signal_weight:    weight,
      neighborhood:     signal.neighborhood ?? null,
      city:             signal.city ?? null,
      country_code:     signal.country_code ?? 'NG',
      partner_id:       signal.partner_id ?? null,
      expires_at:       expiresAt,
      metadata: {
        neighborhood: signal.neighborhood ?? null,
        city:         signal.city ?? null,
        property_id:  signal.property_id ?? null,
        partner_id:   signal.partner_id ?? null,
        weight,
        category,
        ...signal.metadata,
        logged_at: new Date().toISOString(),
      },
    })
  } catch {
    // Never throw — analytics failure must never break the UI
  }
}

// ── Get neighborhood demand (now reads from neighborhood_intelligence) ──
// Falls back to activity_log query if intelligence table not populated yet
export async function getNeighborhoodDemand(neighborhood: string): Promise<{
  searches_7d:   number
  views_7d:      number
  enquiries_7d:  number
  demand_score:  number
  area_score:    number
  supply_gap:    number
  trend:         'rising' | 'stable' | 'falling'
  data_quality:  string
}> {
  try {
    // Try neighborhood_intelligence first (fast, pre-computed)
    const { data: intel } = await supabase
      .from('neighborhood_intelligence')
      .select('*')
      .ilike('neighborhood', `%${neighborhood}%`)
      .eq('meets_display_threshold', true)
      .limit(1)
      .maybeSingle()

    if (intel) {
      return {
        searches_7d:  intel.searches_7d ?? 0,
        views_7d:     intel.views_7d ?? 0,
        enquiries_7d: intel.enquiries_7d ?? 0,
        demand_score: intel.demand_score_7d ?? 0,
        area_score:   intel.area_score ?? 0,
        supply_gap:   intel.supply_gap_score ?? 0,
        trend:        intel.demand_trend ?? 'stable',
        data_quality: intel.data_quality ?? 'sparse',
      }
    }

    // Fallback: compute from raw activity_log
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('activity_log')
      .select('event_type, signal_weight')
      .gte('created_at', sevenDaysAgo)
      .or(`neighborhood.ilike.%${neighborhood}%,metadata->>neighborhood.ilike.%${neighborhood}%`)

    if (!data?.length) {
      return { searches_7d:0, views_7d:0, enquiries_7d:0, demand_score:0, area_score:0, supply_gap:0, trend:'stable', data_quality:'sparse' }
    }

    const searches  = data.filter(r => r.event_type === 'search_location').length
    const views     = data.filter(r => r.event_type === 'property_view').length
    const enquiries = data.filter(r => ['contact_click','enquiry_sent','phone_reveal'].includes(r.event_type)).length
    const totalWeight = data.reduce((s, r) => s + (r.signal_weight ?? SIGNAL_WEIGHTS[r.event_type as SignalType] ?? 1), 0)
    const demandScore = Math.min(100, Math.round(totalWeight / 5))

    return {
      searches_7d:  searches,
      views_7d:     views,
      enquiries_7d: enquiries,
      demand_score: demandScore,
      area_score:   demandScore,  // fallback = same
      supply_gap:   0,
      trend:        demandScore > 60 ? 'rising' : demandScore > 20 ? 'stable' : 'falling',
      data_quality: 'low',
    }
  } catch {
    return { searches_7d:0, views_7d:0, enquiries_7d:0, demand_score:0, area_score:0, supply_gap:0, trend:'stable', data_quality:'sparse' }
  }
}

// ── Get top trending neighborhoods ────────────────────────────
// Now reads from neighborhood_intelligence (pre-computed, fast)
export async function getTrendingNeighborhoods(limit = 5): Promise<{
  neighborhood: string
  city:         string
  demand_score: number
  area_score:   number
  trend:        string
}[]> {
  try {
    // Try pre-computed intelligence first
    const { data: intel } = await supabase
      .from('neighborhood_intelligence')
      .select('neighborhood, city, demand_score_7d, area_score, demand_trend')
      .eq('meets_display_threshold', true)
      .order('demand_score_7d', { ascending: false })
      .limit(limit)

    if (intel?.length) {
      return intel.map(n => ({
        neighborhood: n.neighborhood,
        city:         n.city,
        demand_score: n.demand_score_7d,
        area_score:   n.area_score,
        trend:        n.demand_trend,
      }))
    }

    // Fallback: compute from activity_log
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('activity_log')
      .select('neighborhood, city, signal_weight')
      .gte('created_at', sevenDaysAgo)
      .not('neighborhood', 'is', null)
      .not('city', 'is', null)

    if (!data?.length) return []

    const grouped = data.reduce((acc: Record<string, any>, row) => {
      const key = `${row.neighborhood}||${row.city}`
      if (!acc[key]) acc[key] = { neighborhood: row.neighborhood, city: row.city, weight: 0 }
      acc[key].weight += row.signal_weight ?? 1
      return acc
    }, {})

    return Object.values(grouped)
      .sort((a: any, b: any) => b.weight - a.weight)
      .slice(0, limit)
      .map((n: any) => ({
        neighborhood: n.neighborhood,
        city:         n.city,
        demand_score: Math.min(100, Math.round(n.weight / 5)),
        area_score:   Math.min(100, Math.round(n.weight / 5)),
        trend:        n.weight > 300 ? 'rising' : n.weight > 100 ? 'stable' : 'falling',
      }))
  } catch {
    return []
  }
}

// ── Get platform signal summary (for admin Command Center) ────
export async function getPlatformSignalSummary(): Promise<{
  total_signals_7d:    number
  demand_signals_7d:   number
  supply_signals_7d:   number
  trust_signals_7d:    number
  financing_signals_30d: number
  top_neighborhoods:   string[]
}> {
  try {
    const { data } = await supabase
      .from('platform_intelligence')
      .select('*')
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) return {
      total_signals_7d:     data.total_signals_7d,
      demand_signals_7d:    data.demand_signals_7d,
      supply_signals_7d:    data.supply_signals_7d,
      trust_signals_7d:     data.trust_signals_7d,
      financing_signals_30d: data.financing_signals_30d,
      top_neighborhoods:    data.top_neighborhoods ?? [],
    }

    return { total_signals_7d:0, demand_signals_7d:0, supply_signals_7d:0, trust_signals_7d:0, financing_signals_30d:0, top_neighborhoods:[] }
  } catch {
    return { total_signals_7d:0, demand_signals_7d:0, supply_signals_7d:0, trust_signals_7d:0, financing_signals_30d:0, top_neighborhoods:[] }
  }
}