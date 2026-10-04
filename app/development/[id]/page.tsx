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
import { sb } from '../../../lib/supabase/client'
import { getDesignColors, designTokens } from '../../../lib/theme'
import { getServerDark } from '../../../lib/theme-server'
import { CheckCircle2 } from 'lucide-react'
import { calculateUnitPaymentPlan } from '../../../lib/finance-intelligence'
import DevelopmentEnquiryModal from '../../../components/DevelopmentEnquiryModal'
import DevelopmentFinancingLauncher from '../../../components/DevelopmentFinancingLauncher'
import MediaLightbox, { MediaItem } from '../../../components/MediaLightbox'
import GatedDeveloperName from '../../../components/GatedDeveloperName'

export default async function DevelopmentDetailPage({ params }: { params: { id: string } }) {
  const dark = await getServerDark()
  const c = getDesignColors(dark)

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

  const { data: documents } = await sb
    .from('developer_documents')
    .select('document_type,document_name,verified,verified_at')
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
    .select('title,body,stage_at_time,completion_pct_at_time,posted_by_role,verification_status,posted_at')
    .eq('project_id', project.id)
    .order('posted_at', { ascending: false })

  const POSTED_BY_LABEL: Record<string, string> = {
    admin: 'MANOP',
    developer: 'The developer',
    agency: 'Submitting agency',
  }

  const EVIDENCE_STATUS_LABEL: Record<string, string> = {
    developer_stated: 'Developer-stated',
    documented: 'Documented',
    manop_observed: 'MANOP-observed',
    manop_derived: 'MANOP-derived',
    independently_verified: 'Independently verified',
    professional_opinion: 'Professional opinion',
    unknown: 'Unknown',
    contradictory_clarification_required: 'Contradictory — clarification required',
  }
  // Status colors are semantic accents (amber = stated-not-verified, teal/
  // purple = MANOP-sourced, red = contradictory) that carry meaning
  // independent of light/dark mode — same treatment Site Intelligence
  // gives its own evidence-status colors. Where a direct design-token
  // equivalent exists it's used (amber/teal/purple/red); the others
  // (blue/green/violet/slate) have no token in lib/theme.ts and stay
  // fixed, which is intentional, not an oversight.
  const EVIDENCE_STATUS_COLOR: Record<string, string> = {
    developer_stated: c.statusAmber,
    documented: '#3B82F6',
    manop_observed: c.verificationTeal,
    manop_derived: c.verificationTeal,
    independently_verified: '#22C55E',
    professional_opinion: c.intelligencePurple,
    unknown: c.textMuted,
    contradictory_clarification_required: c.statusRed,
  }

  // Comparables read — averaged, not shown row-by-row to the buyer
  let priceContext: string | null = null
  if (project.neighborhood && units && units.length > 0) {
    const unitClass = units[0].unit_type
    const { data: comps } = await sb
      .from('development_comparables')
      .select('price_local')
      .eq('country_code', project.country_code)
      .eq('neighborhood', project.neighborhood)
      .eq('unit_size_class', unitClass)

    if (comps && comps.length > 0) {
      const avg = comps.reduce((s, c) => s + Number(c.price_local), 0) / comps.length
      const thisPrice = Number(units[0].price_ngn || 0)
      if (thisPrice > 0) {
        const pctDiff = Math.round(((thisPrice - avg) / avg) * 100)
        const direction = pctDiff > 0 ? 'above' : pctDiff < 0 ? 'below' : 'in line with'
        priceContext = `Priced ${Math.abs(pctDiff)}% ${direction} the average of ${comps.length} comparable ${unitClass}${comps.length > 1 ? 's' : ''} in ${project.neighborhood}, based on ${comps.length < 3 ? 'limited' : 'available'} recorded data.`
      }
    } else {
      priceContext = `No comparable data recorded yet for ${project.neighborhood} — price context will appear here as more developments are reviewed in this area.`
    }
  }

  const media: MediaItem[] = [
    ...((project.images || []) as string[]).map(url => ({ url, type: 'image' as const })),
    ...((project.video_urls || []) as string[]).map(url => ({ url, type: 'video' as const })),
  ]

  const bg = c.background, bg3 = c.surfaceCard, text = c.textPrimary
  const text2 = c.textMuted, text3 = c.textFaint
  const border = c.border

  const card: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 16 }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text, fontFamily: designTokens.font.family }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Hero — real gallery (images + video), not a single cropped cover */}
        <div style={{ marginBottom: 20 }}>
          <MediaLightbox dark={dark} media={media} alt={project.name} height={320} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.verificationTeal, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              MANOP Reviewed Development
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>{project.name}</h1>
            <div style={{ color: text2, fontSize: 14, marginTop: 4 }}>
              <GatedDeveloperName developerId={project.developer_id} dark={dark} /> · {project.neighborhood}, {project.city}
            </div>
          </div>
          {project.reviewed_at && (
            <span style={{ fontSize: 12, fontWeight: 700, color: c.verificationTeal, background: c.verificationTealBg, border: `1px solid ${c.verificationTeal}4D`, borderRadius: 20, padding: '5px 14px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
              MANOP Reviewed · {new Date(project.reviewed_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginTop: 20 }}>
          <div>
            {/* Overview */}
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Overview</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                <div><span style={{ color: text3 }}>Stage</span><br /><span>{project.stage}</span></div>
                <div><span style={{ color: text3 }}>Total units</span><br />{project.total_units ?? '—'}</div>
                <div><span style={{ color: text3 }}>Expected handover</span><br />{project.handover_date ? new Date(project.handover_date).toLocaleDateString() : '—'}</div>
                <div><span style={{ color: text3 }}>Location</span><br />{project.state}, {project.country_code}</div>
              </div>
              {project.description && <p style={{ fontSize: 13, color: text2, marginTop: 14, lineHeight: 1.6 }}>{project.description}</p>}
            </div>

            {/* Diaspora logistics */}
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>For diaspora buyers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                {[
                  [project.virtual_viewing, 'Virtual viewing available'],
                  [project.remote_purchase, 'Remote purchase supported'],
                  [project.poa_process, 'Power of Attorney process supported'],
                  [project.international_payment, 'International payment accepted'],
                ].filter(([v]) => v).map(([, label]) => (
                  <span key={label as string} style={{ fontSize: 12, background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={13} /> {label as string}
                  </span>
                ))}
                {![project.virtual_viewing, project.remote_purchase, project.poa_process, project.international_payment].some(Boolean) && (
                  <span style={{ fontSize: 12, color: text3 }}>Diaspora logistics not yet confirmed by the developer for this project.</span>
                )}
              </div>
            </div>

            {/* Unit types */}
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Unit types &amp; pricing</div>
              {(!units || units.length === 0) && <div style={{ fontSize: 13, color: text3 }}>Pricing not yet published.</div>}
              {units?.map(u => {
                // Payment Plan Intelligence (Phase 4) — real schema only:
                // developer_unit_types.deposit_pct + .installment_months,
                // nothing richer exists yet (confirmed against the table's
                // only two consumers, not assumed). Returns null and shows
                // nothing extra when either field is unset, same posture
                // as every other "not yet published" gap on this page.
                const plan = u.price_ngn && u.deposit_pct && u.installment_months
                  ? calculateUnitPaymentPlan({
                      price_ngn: Number(u.price_ngn),
                      deposit_pct: Number(u.deposit_pct),
                      installment_months: Number(u.installment_months),
                    })
                  : null
                return (
                  <div key={u.id} style={{ padding: '10px 0', borderBottom: `1px solid ${border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{u.unit_type}{u.size_sqm ? ` · ${u.size_sqm}sqm` : ''}</div>
                        <div style={{ fontSize: 11, color: text3 }}>{u.available_count ?? '—'} available</div>
                      </div>
                      <div style={{ textAlign: 'right' as const }}>
                        <div style={{ fontWeight: 700 }}>{u.price_ngn ? `₦${Number(u.price_ngn).toLocaleString()}` : '—'}</div>
                        {u.price_usd && <div style={{ fontSize: 11, color: text3 }}>≈ ${Number(u.price_usd).toLocaleString()}</div>}
                      </div>
                    </div>
                    {plan && (
                      <div style={{ fontSize: 11, color: text2, marginTop: 6, padding: '6px 10px', background: c.surfaceCardHigh, borderRadius: 6 }}>
                        Developer plan: ₦{plan.deposit_ngn.toLocaleString()} deposit ({u.deposit_pct}%), then ₦{Math.round(plan.monthly_installment_ngn).toLocaleString()}/month for {plan.installment_months} months
                      </div>
                    )}
                  </div>
                )
              })}
              {priceContext && (
                <div style={{ fontSize: 12, color: text2, marginTop: 12, padding: '10px 12px', background: c.intelligencePurpleBg, borderRadius: 8 }}>
                  {priceContext}
                </div>
              )}
            </div>

            {/* MANOP Take — visually separated, own voice */}
            <div style={{ ...card, borderColor: `${c.intelligencePurple}59`, background: c.intelligencePurpleBg }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.intelligencePurple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>MANOP review</div>
              <div style={{ fontSize: 13, color: text2, marginBottom: 10 }}><strong style={{ color: text }}>What we checked:</strong> {project.manop_checked_note || 'Not yet documented.'}</div>
              <div style={{ fontSize: 13, color: text2, marginBottom: 4 }}><strong style={{ color: text }}>Identified considerations:</strong> {project.manop_flag_note || 'No specific considerations recorded.'}</div>
              <div style={{ fontSize: 11, color: text3, marginTop: 10 }}>
                {project.reviewed_at ? `Reviewed ${new Date(project.reviewed_at).toLocaleDateString()}` : 'Not yet reviewed by MANOP.'}
              </div>
              <div style={{ fontSize: 11, color: text3, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${border}`, lineHeight: 1.5 }}>
                Information reviewed by MANOP. This is not financial, legal, or investment advice —
                independent due diligence is required before any decision.
              </div>
            </div>

            {/* What MANOP Knows — the per-claim evidence register, not
                just one review-notes paragraph. Grouped by category so
                a buyer can see, fact by fact, what's confirmed vs. what
                is only the developer's own claim vs. what's genuinely
                unknown — the distinction this entire product exists to
                make visible. */}
            {evidence && evidence.length > 0 && (
              <div style={{ ...card, marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.intelligencePurple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  What MANOP knows
                </div>
                <div style={{ fontSize: 12, color: text3, marginBottom: 14, lineHeight: 1.5 }}>
                  Every claim below is tagged with where it comes from — a developer's own statement is
                  never presented the same way as something MANOP has independently confirmed.
                </div>
                {Object.entries(
                  evidence.reduce((acc: Record<string, typeof evidence>, e) => {
                    (acc[e.category] = acc[e.category] || []).push(e)
                    return acc
                  }, {})
                ).map(([category, rows]) => (
                  <div key={category} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                      {category.replace(/_/g, ' ')}
                    </div>
                    {rows.map((e, i) => (
                      <div key={i} style={{ marginBottom: 8, paddingLeft: 10, borderLeft: `2px solid ${EVIDENCE_STATUS_COLOR[e.status] || text3}` }}>
                        <div style={{ fontSize: 13, color: text2, lineHeight: 1.5 }}>{e.claim}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' as const }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                            color: EVIDENCE_STATUS_COLOR[e.status] || text3,
                          }}>
                            {EVIDENCE_STATUS_LABEL[e.status] || e.status}
                          </span>
                          {e.source && <span style={{ fontSize: 11, color: text3 }}>· {e.source}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Construction timeline — real history, each entry labeled
                by who posted it, never blurred into one "current status"
                number that quietly overwrites the last one. */}
            {updates && updates.length > 0 && (
              <div style={{ ...card, marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: c.intelligencePurple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
                  Construction timeline
                </div>
                {updates.map((u, i) => (
                  <div key={i} style={{ marginBottom: 14, paddingLeft: 12, borderLeft: `2px solid ${u.verification_status === 'manop_confirmed' ? '#22C55E' : c.statusAmber}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' as const }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: text }}>{u.title}</div>
                      <div style={{ fontSize: 11, color: text3, whiteSpace: 'nowrap' as const }}>
                        {new Date(u.posted_at).toLocaleDateString()}
                      </div>
                    </div>
                    {u.body && <div style={{ fontSize: 13, color: text2, marginTop: 3, lineHeight: 1.5 }}>{u.body}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' as const }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                        color: u.verification_status === 'manop_confirmed' ? '#22C55E' : c.statusAmber,
                      }}>
                        {u.verification_status === 'manop_confirmed' ? 'MANOP-confirmed' : `Reported by ${POSTED_BY_LABEL[u.posted_by_role] || u.posted_by_role}`}
                      </span>
                      {u.stage_at_time && <span style={{ fontSize: 11, color: text3 }}>· {u.stage_at_time}</span>}
                      {u.completion_pct_at_time != null && <span style={{ fontSize: 11, color: text3 }}>· {u.completion_pct_at_time}% complete</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Documents */}
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Documents</div>
              {(!documents || documents.length === 0) && <div style={{ fontSize: 13, color: text3 }}>No documents recorded yet.</div>}
              {documents?.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
                  <span style={{ textTransform: 'capitalize' }}>{d.document_type.replace(/_/g, ' ')}</span>
                  <span style={{ color: d.verified ? '#22C55E' : text3, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {d.verified ? <><CheckCircle2 size={13} /> Independently confirmed</> : 'Provided by developer — not independently verified'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Developer</div>
              <GatedDeveloperName developerId={project.developer_id} fields="full" dark={dark} />
            </div>

            <div style={card}>
              <DevelopmentEnquiryModal
                developerId={project.developer_id}
                projectId={project.id}
                unitTypeId={units?.[0]?.id || null}
                neighborhood={project.neighborhood}
                city={project.city}
                countryCode={project.country_code}
                dark={dark}
              />
            </div>

            {/* Get Financed — new. This was previously only reachable
                from the legacy resale property page; this is the fix
                flagged in the architecture reconciliation. Always
                rendered now (see DevelopmentFinancingLauncher) — it no
                longer disappears without explanation when a unit has no
                price set yet; it explains why instead. */}
            <div style={card}>
              <DevelopmentFinancingLauncher
                developerId={project.developer_id}
                projectId={project.id}
                unitTypeId={units?.[0]?.id || null}
                estimatedPriceNgn={units?.[0]?.price_ngn ? Number(units[0].price_ngn) : null}
                developmentName={project.name}
                dark={dark}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}