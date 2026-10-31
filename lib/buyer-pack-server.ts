// lib/buyer-pack-server.ts — loads the CURRENT public record for a Buyer Pack (server only).
// Uses sbServerRead (anonymous, RLS applies): the pack can never contain more than the public page can already read.
// Developer identity is read as the CALLER (signed-in users only), mirroring the public page's gating.

import { unstable_noStore as noStore } from 'next/cache'
import { sbServerRead as sb } from './supabase/server-read'
import { fetchPackImages, type PackData } from './buyer-pack'

export async function loadPackData(projectId: string, caller: { signedIn: boolean; developerName: (developerId: string) => Promise<string | null> }): Promise<PackData | null> {
  noStore()
  const { data: project } = await sb.from('developer_projects').select(`
      id,name,neighborhood,city,state,country_code,stage,total_units,handover_date,virtual_viewing,remote_purchase,poa_process,international_payment,
      images,description,manop_checked_note,manop_flag_note,reviewed_at,publish_status,developer_id`)
    .eq('id', projectId).eq('publish_status', 'published').maybeSingle()
  if (!project) return null                                   // only published developments are eligible

  const [units, updates, docs, evidence, images] = await Promise.all([
    sb.from('developer_unit_types').select('unit_type,size_sqm,price_ngn,price_usd,currency_code,available_count,quantity,deposit_pct,installment_months,completion_payment_pct,last_price_verified_at').eq('project_id', projectId).order('created_at', { ascending: true }),
    sb.from('development_updates').select('title,body,stage_at_time,completion_pct_at_time,posted_by_role,verification_status,posted_at').eq('project_id', projectId).order('posted_at', { ascending: false }).limit(6),
    // NOTE: document_url is deliberately NOT selected. The pack lists public documents as metadata only.
    sb.from('developer_documents').select('id,document_type,document_name,status,publicly_visible,verified').eq('project_id', projectId),
    sb.from('development_evidence').select('category,status').eq('project_id', projectId),
    fetchPackImages(project.images),
  ])

  const developerName = caller.signedIn && project.developer_id ? await caller.developerName(project.developer_id) : null
  return {
    generatedAt: new Date(),
    project,
    developerName,
    developerNote: caller.signedIn ? 'Developer name not available' : 'Developer identity is shown to signed-in users',
    units: units.data ?? [], updates: updates.data ?? [], documents: docs.data ?? [], evidence: evidence.data ?? [], images,
  }
}