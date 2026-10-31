// app/api/developments/[id]/workflow/route.ts — where a development stands, for the agency or developer that owns it, or MANOP admin.
// Everyone else gets 404. Facts are read here (service role, after the ownership check) and explained by lib/development-workflow.ts.
import { executedCoverageFor, agreementRequestFor } from '../../../../../lib/agreement-docs-server'
import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../../lib/supabase/admin'
import { developmentProgress } from '../../../../../lib/development-workflow'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const nf = () => NextResponse.json({ error: 'Development not found.' }, { status: 404 })

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!UUID.test(params.id)) return nf()
    const sb = sbFromRequest(req)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
    const { data: p } = await sbAdmin.from('developer_projects').select('id,developer_id,submitting_agency_id,submitted_via,publish_status,reviewed_at,manop_flag_note,mandate_document_url,mandate_letter_id').eq('id', params.id).maybeSingle()
    if (!p) return nf()
    const [{ data: isAdmin }, { data: devId }, { data: agencyId }] = await Promise.all([sb.rpc('is_manop_admin'), sb.rpc('my_developer_account_id'), sb.rpc('my_agency_id')])
    const owner = (agencyId && p.submitting_agency_id === agencyId) || (devId && p.developer_id === devId)
    if (isAdmin !== true && !owner) return nf()

    let mandate: any = p.mandate_letter_id ? null : p.mandate_document_url ? { kind: 'legacy_link' } : { kind: 'none' }
    if (p.mandate_letter_id) { const { data: l } = await sbAdmin.from('agency_mandate_letters').select('status,review_note').eq('id', p.mandate_letter_id).maybeSingle(); mandate = l ? { kind: 'letter', status: l.status, note: ['changes_requested', 'rejected'].includes(l.status) ? l.review_note : null } : { kind: 'none' } }

    let verification: string | null = null, route: any = null, subscription: any = null
    if (p.submitting_agency_id) {
      const { data: ag } = await sbAdmin.from('data_partners').select('verification_status').eq('id', p.submitting_agency_id).maybeSingle(); verification = ag?.verification_status ?? null
      const { data: els } = await sbAdmin.from('agency_commercial_elections').select('model,status,subscription_id').eq('agency_id', p.submitting_agency_id).in('status', ['active', 'proposed'])
      const cur = els?.find(e => e.status === 'active') ?? els?.[0]
      if (cur) route = { model: cur.model, status: cur.status }
      const { data: subs } = await sbAdmin.from('agency_subscriptions').select('activation_status,period_end,coverage_scope,coverage_development_ids').eq('agency_id', p.submitting_agency_id).eq('activation_status', 'active')
      const live = (subs ?? []).find(s => !s.period_end || s.period_end >= new Date().toISOString().slice(0, 10))
      if (live) subscription = { active: true, coversThisDevelopment: live.coverage_scope === 'all_current_and_future' || (live.coverage_development_ids ?? []).includes(p.id) }
    }
    const cov = await executedCoverageFor(p.id)          // exact coverage from a completed record that names this development
    const agreementRequest = await agreementRequestFor(p.id)
    const progress = developmentProgress({
      publishStatus: p.publish_status, reviewedAt: p.reviewed_at, manopRequestNote: p.manop_flag_note, submittedViaAgency: !!p.submitting_agency_id,
      mandate, agencyVerification: verification, executedAgreement: !!cov, agreementRequest, route, subscription,
    })
    return NextResponse.json({ progress })
  } catch (e) { console.error('GET development workflow', e); return NextResponse.json({ error: 'Could not load the status.' }, { status: 500 }) }
}
