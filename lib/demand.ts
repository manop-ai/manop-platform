// lib/demand.ts
// Manop Demand Intelligence
//
// Every search, view, and contact click on Manop is a signal.
// These signals compound over time into proprietary market intelligence
// that nobody else has — because nobody else has the users.
//
// Signal types and weights:
//   search_location  → 1  (user typed a neighborhood)
//   property_view    → 2  (user opened a property page)
//   property_save    → 5  (user saved/bookmarked)
//   contact_click    → 10 (user clicked WhatsApp or enquire)
//   phone_reveal     → 20 (user revealed agent phone)
//
// This data feeds:
//   1. Agency dashboard (your 3 serious buyers this week)
//   2. Neighborhood demand scores
//   3. Manop market intelligence (what buyers actually want)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

export type SignalType =
  | 'search_location'
  | 'search_filter'
  | 'property_view'
  | 'property_save'
  | 'contact_click'
  | 'phone_reveal'
  | 'enquiry_sent'

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  search_location: 1,
  search_filter:   1,
  property_view:   2,
  property_save:   5,
  contact_click:   10,
  phone_reveal:    20,
  enquiry_sent:    25,
}

export interface DemandSignal {
  signal_type:   SignalType
  neighborhood?: string
  city?:         string
  property_id?:  string
  partner_id?:   string
  metadata?:     Record<string, unknown>
}

// ─── Log a signal ─────────────────────────────────────────────
// Fire-and-forget — never block the UI for analytics
export async function logSignal(signal: DemandSignal): Promise<void> {
  try {
    await supabase.from('activity_log').insert({
      event_type: signal.signal_type,
      message:    `${signal.signal_type}${signal.neighborhood ? ` · ${signal.neighborhood}` : ''}`,
      metadata: {
        neighborhood: signal.neighborhood || null,
        city:         signal.city || null,
        property_id:  signal.property_id || null,
        partner_id:   signal.partner_id || null,
        weight:       SIGNAL_WEIGHTS[signal.signal_type],
        ...signal.metadata,
        logged_at:    new Date().toISOString(),
      },
    })
  } catch {
    // Never throw — analytics failure must not break the UI
  }
}

// ─── Get demand summary for a neighborhood ────────────────────
// Used by neighborhood page to show "X investors searched this week"
export async function getNeighborhoodDemand(neighborhood: string): Promise<{
  searches_7d:  number
  views_7d:     number
  enquiries_7d: number
  demand_score: number  // 0-100
  trend:        'rising' | 'stable' | 'falling'
}> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data } = await supabase
      .from('activity_log')
      .select('event_type, metadata')
      .gte('created_at', sevenDaysAgo)
      .or(`metadata->>neighborhood.ilike.%${neighborhood}%`)

    if (!data || data.length === 0) {
      return { searches_7d: 0, views_7d: 0, enquiries_7d: 0, demand_score: 0, trend: 'stable' }
    }

    const searches  = data.filter(r => r.event_type === 'search_location').length
    const views     = data.filter(r => r.event_type === 'property_view').length
    const enquiries = data.filter(r => ['contact_click','enquiry_sent','phone_reveal'].includes(r.event_type)).length
    const totalWeight = data.reduce((s, r) => s + (SIGNAL_WEIGHTS[r.event_type as SignalType] || 0), 0)

    // Score: normalised to 100, capped
    const demandScore = Math.min(100, Math.round(totalWeight / 5))

    return {
      searches_7d:  searches,
      views_7d:     views,
      enquiries_7d: enquiries,
      demand_score: demandScore,
      trend:        demandScore > 60 ? 'rising' : demandScore > 20 ? 'stable' : 'falling',
    }
  } catch {
    return { searches_7d: 0, views_7d: 0, enquiries_7d: 0, demand_score: 0, trend: 'stable' }
  }
}

// ─── Get top trending neighborhoods ──────────────────────────
// Used by homepage and search page for "trending now"
export async function getTrendingNeighborhoods(limit = 5): Promise<{
  neighborhood: string
  city:         string
  signal_count: number
  score:        number
}[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data } = await supabase
      .from('activity_log')
      .select('metadata')
      .gte('created_at', sevenDaysAgo)
      .not('metadata->>neighborhood', 'is', null)

    if (!data) return []

    // Aggregate by neighborhood
    const counts: Record<string, { city: string; count: number; score: number }> = {}
    for (const row of data) {
      const meta  = row.metadata as Record<string, unknown>
      const hood  = meta?.neighborhood as string
      const city  = meta?.city as string || 'Lagos'
      const weight = (meta?.weight as number) || 1
      if (!hood) continue
      if (!counts[hood]) counts[hood] = { city, count: 0, score: 0 }
      counts[hood].count += 1
      counts[hood].score += weight
    }

    return Object.entries(counts)
      .map(([neighborhood, v]) => ({ neighborhood, city: v.city, signal_count: v.count, score: v.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  } catch {
    return []
  }
}