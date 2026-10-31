// app/api/deal-room/mine/route.ts
//
// The introductions the caller is a party to, resolved from database facts
// (not from RLS visibility), so developer/agency/landowner dashboards also see
// land, JV and redevelopment introductions that have no project for the
// existing leads RLS policies to key on. Seller sides never receive buyer
// user ids or fee fields.

import { NextRequest, NextResponse } from 'next/server'
import { sbFromRequest } from '../../../../lib/supabase/route-client'
import { sbAdmin } from '../../../../lib/supabase/admin'
import { visibleLead } from '../../../../lib/deal-room-server'
import { acceptedLetterIds } from '../../../../lib/mandate-on-file'
import { resolveParty, type OpportunityFacts } from '../../../../lib/deal-room-access'

export async function GET(req: NextRequest) {
  const caller = sbFromRequest(req)
  const { data: { user } } = await caller.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })

  const [{ data: isAdmin }, { data: devId }, { data: agencyId }] = await Promise.all([
    caller.rpc('is_manop_admin'), caller.rpc('my_developer_account_id'), caller.rpc('my_agency_id'),
  ])
  const facts = { userId: user.id, isAdmin: isAdmin === true, developerAccountId: devId ?? null, agencyId: agencyId ?? null }
  if (facts.isAdmin) return NextResponse.json({ error: 'Admins use /admin/leads.' }, { status: 400 })

  // Candidate leads: the buyer's own, plus leads on opportunities this caller owns or submitted.
  const owned: string[] = []
  const [{ data: ps }, { data: ss }] = await Promise.all([
    sbAdmin.from('developer_projects').select('id, developer_id, submitting_agency_id, mandate_document_url, mandate_letter_id, publish_status')
      .or([facts.developerAccountId && `developer_id.eq.${facts.developerAccountId}`, facts.agencyId && `submitting_agency_id.eq.${facts.agencyId}`].filter(Boolean).join(',') || 'id.is.null'),
    sbAdmin.from('sites').select('id, developer_id, submitting_agency_id, submitted_by_user_id, entry_source, mandate_document_url, site_status')
      .or([`submitted_by_user_id.eq.${user.id}`, facts.developerAccountId && `developer_id.eq.${facts.developerAccountId}`, facts.agencyId && `submitting_agency_id.eq.${facts.agencyId}`].filter(Boolean).join(',')),
  ])
  const accepted = await acceptedLetterIds((ps || []).map((p: any) => p.mandate_letter_id))
  const oppFacts = new Map<string, OpportunityFacts>()
  for (const p of ps || []) {
    oppFacts.set(`p:${p.id}`, { kind: 'project', developer_id: p.developer_id, submitting_agency_id: p.submitting_agency_id, landowner_user_id: null, mandate_document_url: p.mandate_letter_id ? (accepted.has(p.mandate_letter_id) ? (p.mandate_document_url || 'uploaded-letter') : null) : p.mandate_document_url, published: p.publish_status === 'published' })
    owned.push(`project_id.eq.${p.id}`)
  }
  for (const s of ss || []) {
    oppFacts.set(`s:${s.id}`, { kind: 'site', developer_id: s.developer_id, submitting_agency_id: s.submitting_agency_id, landowner_user_id: s.entry_source === 'landowner' ? s.submitted_by_user_id : null, mandate_document_url: s.mandate_document_url, published: s.site_status === 'published' })
    owned.push(`site_id.eq.${s.id}`)
  }

  const filter = [`user_id.eq.${user.id}`, ...owned.slice(0, 200)].join(',')
  const { data: leads } = await sbAdmin.from('developer_leads').select('*').or(filter).order('created_at', { ascending: false }).limit(100)

  const out = []
  for (const l of leads || []) {
    const opp = l.project_id ? oppFacts.get(`p:${l.project_id}`) : l.site_id ? oppFacts.get(`s:${l.site_id}`) : undefined
    const res = resolveParty({ user_id: l.user_id ?? null, developer_id: l.developer_id ?? null, routing_status: l.routing_status ?? null, referred_to_developer_at: l.referred_to_developer_at ?? null, manop_routing_required: l.manop_routing_required ?? null },
      opp ?? { kind: 'general', developer_id: null, submitting_agency_id: null, landowner_user_id: null, mandate_document_url: null, published: false }, facts)
    if (!res.party) continue
    out.push({ party: res.party, lead: visibleLead(res.party, l) })
  }
  return NextResponse.json({ introductions: out })
}