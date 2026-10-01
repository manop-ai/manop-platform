// app/api/sites/[id]/appraisals/route.ts
//
// POST creates a new appraisal scenario for a site (open to anyone,
// per Joel's decision — no login wall on running the numbers, only
// on downloading a report, which is checked client-side). GET lists
// existing scenarios for a site.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { computeAppraisal, AppraisalInputs } from '../../../../../lib/construction-appraisal'
import { logSiteSignal } from '../../../../../lib/log-site-signal'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json() as { scenario_name?: string; scenario_id?: string | null } & AppraisalInputs

  if (!body.unit_mix || body.unit_mix.length === 0 || !body.build_cost_per_sqm_ngn) {
    return NextResponse.json({ error: 'Unit mix and build cost per sqm are required.' }, { status: 400 })
  }

  // was: an inline createClient(url, key, authHeader...) — route-client.ts
  // exists precisely so every route carrying the caller's own auth uses one
  // factory instead of repeating this construction.
  const sb = sbFromRequest(req)

  const { data: { user } } = await sb.auth.getUser()
  const { data: site } = await sb.from('sites').select('city, neighborhood, country_code').eq('id', params.id).single()

  const outputs = computeAppraisal(body)

  const { data: appraisal, error } = await sb
    .from('site_appraisals')
    .insert({
      site_id: params.id,
      scenario_id: body.scenario_id || null,
      scenario_name: body.scenario_name || 'Base Case',
      created_by_user_id: user?.id ?? null,
      landowner_asking_price_ngn: body.landowner_asking_price_ngn,
      landowner_jv_expectation_pct: body.landowner_jv_expectation_pct,
      unit_mix: body.unit_mix,
      build_cost_per_sqm_ngn: body.build_cost_per_sqm_ngn,
      other_development_costs_ngn: body.other_development_costs_ngn,
      contingency_pct: body.contingency_pct,
      debt_funding_pct: body.debt_funding_pct,
      interest_rate_pct: body.interest_rate_pct,
      loan_period_months: body.loan_period_months,
      developer_profit_target_pct: body.developer_profit_target_pct,
      sales_downside_pct: body.sales_downside_pct,
      cost_upside_pct: body.cost_upside_pct,
      gross_development_value_ngn: outputs.gross_development_value_ngn,
      gross_floor_area_sqm: outputs.gross_floor_area_sqm,
      construction_cost_ngn: outputs.construction_cost_ngn,
      contingency_amount_ngn: outputs.contingency_amount_ngn,
      finance_cost_ngn: outputs.finance_cost_ngn,
      developer_profit_allowance_ngn: outputs.developer_profit_allowance_ngn,
      total_costs_excl_land_ngn: outputs.total_costs_excl_land_ngn,
      residual_land_value_ngn: outputs.residual_land_value_ngn,
      residual_margin_pct: outputs.residual_margin_pct,
      landowner_jv_expectation_value_ngn: outputs.landowner_jv_expectation_value_ngn,
      viability_label: outputs.viability_label,
      sensitivity_results: outputs.sensitivity_results,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (site) {
    await logSiteSignal(sb, 'appraisal_run', {
      siteId: params.id, city: site.city, neighborhood: site.neighborhood, countryCode: site.country_code,
    })
  }

  return NextResponse.json({ appraisal }, { status: 201 })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = sbFromRequest(req)
  const { data, error } = await sb
    .from('site_appraisals')
    .select('*')
    .eq('site_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ appraisals: data })
}