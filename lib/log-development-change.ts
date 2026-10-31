// lib/log-development-change.ts
//
// Development changes are recorded in the shared activity_log, the same way
// lib/log-site-signal.ts records Site Intelligence activity: same columns, a
// per-event category/weight map, additive and never a blocker. No actor column
// exists on activity_log, so the actor lives in metadata.

import { SupabaseClient } from '@supabase/supabase-js'

export type DevelopmentChangeEvent =
  | 'development_update_added'
  | 'development_unit_price_changed'
  | 'development_unit_availability_changed'
  | 'development_status_changed'
  | 'development_image_added'
  | 'development_submitted'
  | 'development_info_requested'
  | 'development_reviewed'
  | 'development_published'

// All supply-side: they describe the development stock changing, not buyer demand.
const SIGNAL_CONFIG: Record<DevelopmentChangeEvent, { category: string; weight: number }> = {
  development_submitted:                 { category: 'supply', weight: 15 }, // same weight as site_submitted
  development_published:                 { category: 'supply', weight: 15 },
  development_reviewed:                  { category: 'supply', weight: 10 },
  development_info_requested:            { category: 'supply', weight: 2 },
  development_update_added:              { category: 'supply', weight: 5 },
  development_status_changed:            { category: 'supply', weight: 5 },
  development_unit_price_changed:        { category: 'supply', weight: 8 },
  development_unit_availability_changed: { category: 'supply', weight: 8 },
  development_image_added:               { category: 'supply', weight: 2 },
}

export interface DevelopmentChangeContext {
  projectId: string
  projectName: string
  neighborhood?: string | null
  city?: string | null
  countryCode?: string | null
  actorUserId?: string | null
  actorRole: 'admin' | 'developer' | 'agency'
}

export async function logDevelopmentChange(
  sb: SupabaseClient,
  event: DevelopmentChangeEvent,
  ctx: DevelopmentChangeContext,
  detail: Record<string, unknown> = {},
) {
  const { category, weight } = SIGNAL_CONFIG[event]
  try {
    await sb.from('activity_log').insert({
      event_type: event,
      message: `${event.replace(/_/g, ' ')} — ${ctx.projectName}`,
      signal_category: category,
      signal_weight: weight,
      neighborhood: ctx.neighborhood ?? null,
      city: ctx.city ?? null,
      country_code: ctx.countryCode ?? 'NG',
      metadata: {
        project_id: ctx.projectId,
        actor_user_id: ctx.actorUserId ?? null,
        actor_role: ctx.actorRole,
        source: 'development_updates',
        ...detail,
      },
    })
  } catch {
    // Signal logging is additive intelligence, never a blocker.
  }
}