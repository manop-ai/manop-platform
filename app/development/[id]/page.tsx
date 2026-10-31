// app/development/[id]/page.tsx
// Public detail page for one published development. Redirects unpublished
// IDs — this route only ever shows what has cleared the review gate.
//
// dynamic/revalidate below are load-bearing, not decoration: without
// them, Next.js statically caches this page's render — including a
// notFound() result. If anyone visits a development's URL while it's
// still a draft, that 404 gets cached and stays cached even after the
// development is published in Supabase, since nothing tells Next.js the
// underlying row changed. This forces a fresh query on every request.
//
// REDESIGN (30 Oct): presentation moved to components/dossier/* (tabbed sections, gallery, evidence explorer, responsive). This file now
// only fetches and gates data. Every query, the published-only filter and the view signal are unchanged.
//
// THEME FIX: this page previously hardcoded `dark={true}` for every
// child component and a fixed dark palette for its own background/card/
// text colors, regardless of the site-wide theme cookie. That's why
// toggling light/dark mode visibly did nothing here — this route simply
// never read the theme at all. It now calls the same getServerDark() +
// getDesignColors() pair every other reconciled server page uses (see
// app/site-intelligence/[id]/page.tsx), and passes the real `dark` value
// down to MediaLightbox, GatedDeveloperName and DevelopmentEnquiryModal,
// which already supported a `dark` prop and were just never given it.
//
// Known remaining gap, not fixed in this pass: FinancingModal (opened
// from DevelopmentFinancingLauncher below) is still hardcoded dark-only
// — flagged in its own file header as a separate retrofit, not bundled
// in here since it's a 600-line component with no theme awareness yet,
// not a one-line prop miss like this page was.

export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { sbServerRead as sb } from '../../../lib/supabase/server-read'
import { getServerDark } from '../../../lib/theme-server'
import DossierView from '../../../components/dossier/DossierView'

export default async function DevelopmentDetailPage({ params }: { params: { id: string } }) {
  const dark = await getServerDark()

  const { data: project } = await sb
    .from('developer_projects')
    .select(`
      id,name,neighborhood,city,state,country_code,stage,total_units,
      handover_date,virtual_viewing,remote_purchase,poa_process,international_payment,
      images,video_urls,description,manop_checked_note,manop_flag_note,
      reviewed_at,publish_status,developer_id
    `)
    .eq('id', params.id)
    .eq('publish_status', 'published')
    .maybeSingle()

  if (!project) return notFound()

  // Real signal, matching the existing property_view weight (2) — this is
  // the piece that was missing: development page views previously never
  // reached activity_log/neighborhood_intelligence at all.
  void sb.from('activity_log').insert({
    event_type:      'development_view',
    signal_category: 'demand',
    signal_weight:   2,
    message:         `Development view: ${project.name}`,
    neighborhood:    project.neighborhood || null,
    city:            project.city || null,
    country_code:    project.country_code || 'NG',
    metadata:        { project_id: project.id, developer_id: project.developer_id },
  }).then(undefined, () => { /* never block page render on this */ })

  // Developer identity is withheld from logged-out visitors — this is
  // why it isn't fetched here at all. See components/GatedDeveloperName
  // for why that has to be a client-side check, not a server condition:
  // this app has no server-side auth cookies to check against.

  const { data: units } = await sb
    .from('developer_unit_types')
    .select('id,unit_type,price_ngn,price_usd,currency_code,size_sqm,available_count,deposit_pct,installment_months,last_price_verified_at')
    .eq('project_id', project.id)
    // A stable order. The list used to come back in whatever order the database chose, which is also
    // what made "the first unit" arbitrary. Nothing below treats any position as special.
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  const { data: documents } = await sb
    .from('developer_documents')
    .select('id,document_type,document_name,verified,verified_at,status,publicly_visible')
    .eq('project_id', project.id)

  // The per-claim evidence register — what distinguishes this from a
  // marketing page. Public-read via RLS only for published developments,
  // same gate as everything else on this page.
  const { data: evidence } = await sb
    .from('development_evidence')
    .select('category,claim,source,status,next_action')
    .eq('project_id', project.id)
    .order('category', { ascending: true })

  // Construction timeline — actual history, not just the single
  // current stage/completion_pct fields shown above. Posted by admin
  // (on behalf of unclaimed developers), the developer, or the
  // submitting agency — each one labeled, never blurred together.
  const { data: updates } = await sb
    .from('development_updates')
    .select('id,title,body,stage_at_time,completion_pct_at_time,posted_by_role,verification_status,posted_at')
    .eq('project_id', project.id)
    .order('posted_at', { ascending: false })

  // Unit availability changes recorded with each update (append-only history). If the table is not readable for the public the result is simply empty and
  // the timeline shows no availability lines; nothing else on the page depends on it.
  const { data: availChanges } = await sb
    .from('development_update_changes')
    .select('update_id,unit_label,field,previous_value,new_value')
    .eq('project_id', project.id)
    .eq('field', 'available_count')

  // Comparables read — averaged, not shown row-by-row to the buyer
  // One line per unit type, each against that unit's OWN price and class (this used to describe units[0] only).
  const priceContextLines: string[] = []
  if (project.neighborhood && units && units.length > 0) {
    const classes = Array.from(new Set(units.map(u => u.unit_type).filter(Boolean)))
    const { data: comps } = await sb
      .from('development_comparables')
      .select('price_local,unit_size_class')
      .eq('country_code', project.country_code)
      .eq('neighborhood', project.neighborhood)
      .in('unit_size_class', classes)

    for (const u of units) {
      const mine = (comps ?? []).filter(cmp => cmp.unit_size_class === u.unit_type)
      const thisPrice = Number(u.price_ngn || 0)
      if (mine.length > 0 && thisPrice > 0) {
        const avg = mine.reduce((s, cmp) => s + Number(cmp.price_local), 0) / mine.length
        const pctDiff = Math.round(((thisPrice - avg) / avg) * 100)
        const direction = pctDiff > 0 ? 'above' : pctDiff < 0 ? 'below' : 'in line with'
        priceContextLines.push(`${u.unit_type}: priced ${Math.abs(pctDiff)}% ${direction} the average of ${mine.length} comparable${mine.length > 1 ? 's' : ''} in ${project.neighborhood}, based on ${mine.length < 3 ? 'limited' : 'available'} recorded data.`)
      }
    }
    if (priceContextLines.length === 0) {
      priceContextLines.push(`No comparable data recorded yet for ${project.neighborhood} — price context will appear here as more developments are reviewed in this area.`)
    }
  }
  const media: { url: string; type: 'image' | 'video' }[] = [
    ...((project.images || []) as string[]).map(url => ({ url, type: 'image' as const })),
    ...((project.video_urls || []) as string[]).map(url => ({ url, type: 'video' as const })),
  ]

  return (
    <DossierView
      dark={dark}
      data={{
        project,
        units: units ?? [],
        documents: documents ?? [],
        evidence: (evidence ?? []) as any,
        updates: (updates ?? []).map((u: any) => ({ ...u, availability: (availChanges ?? []).filter((c: any) => c.update_id === u.id) })),
        priceContextLines,
        media,
      }}
    />
  )
}