// lib/shared-scenario-response.ts
//
// Pure response-shaping logic for the shared-scenario endpoint, pulled out of
// the route handler so it's testable without mocking Supabase/Next.js. Given
// the exact shape get_shared_scenario_report(p_token) returns (verified live
// via pg_proc inspection — see sql/2026_site_studio_shared_view.sql), decide
// what HTTP status + body the route should send.

const INTERNAL_SCENARIO_FIELDS = ['created_by_user_id', 'preset_id', 'duplicated_from_id', 'superseded_by_id', 'parameters_json'] as const

export interface RpcResult {
  data: Record<string, unknown> | null
  error: { code?: string; message?: string } | null
}
export interface ShapedResponse {
  status: number
  body: Record<string, unknown>
}

export function shapeSharedScenarioResponse({ data, error }: RpcResult): ShapedResponse {
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) {
      return {
        status: 503,
        body: { code: 'SHARED_VIEW_NOT_INSTALLED', error: 'Shared scenario viewing has not been enabled on this MANOP environment yet.' },
      }
    }
    return { status: 500, body: { error: 'Could not load this shared scenario.' } }
  }

  // The RPC signals "not valid" / "revoked" / "expired" as a normal jsonb
  // {error: "..."} return value, not a thrown exception — see its own source
  // (SELECT ... INTO v_share; IF v_share.id IS NULL / revoked_at IS NOT NULL /
  // expires_at < NOW() THEN RETURN jsonb_build_object('error', ...)).
  if (!data || data.error) {
    return { status: 404, body: { error: (data?.error as string) || 'This share link is invalid or has been revoked.' } }
  }

  const scenario = { ...(data.scenario as Record<string, unknown>) }
  for (const f of INTERNAL_SCENARIO_FIELDS) delete scenario[f]

  return {
    status: 200,
    body: {
      permission: 'view',
      scenario,
      readings: data.readings || [],
      buildings: data.buildings || [],
      openSpaces: data.open_spaces || [],
      site: data.site || null,
      share: data.share || null,
      // Deliberately omitted: data.evidence, data.investigation_items.
      // See sql/2026_site_studio_shared_view.sql for why.
    },
  }
}