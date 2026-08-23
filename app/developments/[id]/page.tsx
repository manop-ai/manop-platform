// app/development/[id]/page.tsx
// Public detail page for one published development. Redirects unpublished
// IDs — this route only ever shows what has cleared the review gate.

import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import DevelopmentEnquiryModal from '../../../components/DevelopmentEnquiryModal'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const RECOMMENDATION_LABEL: Record<string, { label: string; color: string }> = {
  recommended:          { label: 'Recommended',          color: '#22C55E' },
  proceed_with_caution: { label: 'Proceed with caution', color: '#F59E0B' },
  not_recommended:      { label: 'Not recommended',      color: '#EF4444' },
}

export default async function DevelopmentDetailPage({ params }: { params: { id: string } }) {
  const { data: project } = await sb
    .from('developer_projects')
    .select(`
      id,name,neighborhood,city,state,country_code,stage,total_units,
      handover_date,virtual_viewing,remote_purchase,poa_process,international_payment,
      images,description,manop_checked_note,manop_flag_note,manop_recommendation,
      reviewed_at,publish_status,developer_id,
      developer_accounts(id,company_name,years_active,track_record_notes,account_status)
    `)
    .eq('id', params.id)
    .eq('publish_status', 'published')
    .maybeSingle()

  if (!project) return notFound()

  const developer = Array.isArray((project as any).developer_accounts)
    ? (project as any).developer_accounts[0]
    : (project as any).developer_accounts

  const { data: units } = await sb
    .from('developer_unit_types')
    .select('id,unit_type,price_ngn,price_usd,currency_code,size_sqm,available_count,deposit_pct,installment_months,last_price_verified_at')
    .eq('project_id', project.id)

  const { data: documents } = await sb
    .from('developer_documents')
    .select('document_type,document_name,verified,verified_at')
    .eq('project_id', project.id)

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

  const rec = project.manop_recommendation ? RECOMMENDATION_LABEL[project.manop_recommendation] : null

  const bg = '#0F172A', bg3 = '#162032', text = '#F8FAFC'
  const text2 = 'rgba(248,250,252,0.65)', text3 = 'rgba(248,250,252,0.35)'
  const border = 'rgba(248,250,252,0.08)'

  const card: React.CSSProperties = { background: bg3, border: `1px solid ${border}`, borderRadius: 14, padding: '1.25rem', marginBottom: 16 }

  return (
    <div style={{ background: bg, minHeight: '100vh', color: text }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Hero */}
        <div style={{ height: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 20, background: project.images?.[0] ? `url(${project.images[0]}) center/cover` : 'rgba(91,46,255,0.08)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' as const, gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              MANOP Reviewed Development
            </div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>{project.name}</h1>
            <div style={{ color: text2, fontSize: 14, marginTop: 4 }}>
              {developer?.company_name} · {project.neighborhood}, {project.city}
            </div>
          </div>
          {rec && (
            <span style={{ fontSize: 12, fontWeight: 700, color: rec.color, background: `${rec.color}1a`, border: `1px solid ${rec.color}44`, borderRadius: 20, padding: '5px 14px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}>
              {rec.label}
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
                  <span key={label as string} style={{ fontSize: 12, background: 'rgba(34,197,94,0.1)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '4px 10px' }}>
                    ✓ {label as string}
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
              {units?.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${border}` }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.unit_type}{u.size_sqm ? ` · ${u.size_sqm}sqm` : ''}</div>
                    <div style={{ fontSize: 11, color: text3 }}>{u.available_count ?? '—'} available</div>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <div style={{ fontWeight: 700 }}>{u.price_ngn ? `₦${Number(u.price_ngn).toLocaleString()}` : '—'}</div>
                    {u.price_usd && <div style={{ fontSize: 11, color: text3 }}>≈ ${Number(u.price_usd).toLocaleString()}</div>}
                  </div>
                </div>
              ))}
              {priceContext && (
                <div style={{ fontSize: 12, color: text2, marginTop: 12, padding: '10px 12px', background: 'rgba(91,46,255,0.08)', borderRadius: 8 }}>
                  {priceContext}
                </div>
              )}
            </div>

            {/* MANOP Take — visually separated, own voice */}
            <div style={{ ...card, borderColor: 'rgba(91,46,255,0.35)', background: 'rgba(91,46,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8B6BFF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>MANOP's take</div>
              <div style={{ fontSize: 13, color: text2, marginBottom: 10 }}><strong style={{ color: text }}>What we checked:</strong> {project.manop_checked_note || 'Not yet documented.'}</div>
              <div style={{ fontSize: 13, color: text2, marginBottom: 4 }}><strong style={{ color: text }}>What to know:</strong> {project.manop_flag_note || 'No specific flags recorded.'}</div>
              <div style={{ fontSize: 11, color: text3, marginTop: 10 }}>
                {project.reviewed_at ? `Reviewed ${new Date(project.reviewed_at).toLocaleDateString()}` : ''}
              </div>
            </div>

            {/* Documents */}
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Documents</div>
              {(!documents || documents.length === 0) && <div style={{ fontSize: 13, color: text3 }}>No documents recorded yet.</div>}
              {documents?.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
                  <span style={{ textTransform: 'capitalize' }}>{d.document_type.replace(/_/g, ' ')}</span>
                  <span style={{ color: d.verified ? '#22C55E' : text3, fontSize: 12 }}>
                    {d.verified ? '✓ Independently confirmed' : 'Provided by developer — not independently verified'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div style={card}>
              <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Developer</div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{developer?.company_name}</div>
              <div style={{ fontSize: 12, color: text3, marginBottom: 8 }}>
                {developer?.years_active ? `${developer.years_active} years active` : 'Track record on file'}
              </div>
              {developer?.track_record_notes && <div style={{ fontSize: 12, color: text2 }}>{developer.track_record_notes}</div>}
            </div>

            <div style={card}>
              <DevelopmentEnquiryModal
                developerId={project.developer_id}
                projectId={project.id}
                unitTypeId={units?.[0]?.id || null}
                dark={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}