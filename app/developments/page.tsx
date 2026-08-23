// app/developments/page.tsx
// Public discovery page — server component, queries developer_projects
// where publish_status = 'published' only. Filters: city, unit type,
// price range, handover year.

import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

const RECOMMENDATION_LABEL: Record<string, { label: string; color: string }> = {
  recommended:          { label: 'Recommended',          color: '#22C55E' },
  proceed_with_caution: { label: 'Proceed with caution', color: '#F59E0B' },
  not_recommended:      { label: 'Not recommended',      color: '#EF4444' },
}

interface DevProject {
  id: string
  name: string
  neighborhood: string | null
  city: string | null
  country_code: string
  stage: string | null
  handover_date: string | null
  manop_recommendation: string | null
  images: string[] | null
  developer_id: string
  developer_accounts: { company_name: string } | null
}

export default async function DevelopmentsPage({
  searchParams,
}: {
  searchParams: { city?: string; stage?: string }
}) {
  let q = sb
    .from('developer_projects')
    .select('id,name,neighborhood,city,country_code,stage,handover_date,manop_recommendation,images,developer_id,developer_accounts(company_name)')
    .eq('publish_status', 'published')
    .order('reviewed_at', { ascending: false })

  if (searchParams.city)  q = q.eq('city', searchParams.city)
  if (searchParams.stage) q = q.eq('stage', searchParams.stage)

  const { data } = await q
  const projects = (data as unknown as DevProject[]) || []

  return (
    <div style={{ background: '#0F172A', minHeight: '100vh', color: '#F8FAFC' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#14B8A6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          MANOP Reviewed Developments
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px' }}>Off-plan &amp; new-build developments</h1>
        <p style={{ color: 'rgba(248,250,252,0.65)', fontSize: 14, maxWidth: 620, marginBottom: 24 }}>
          Every development here has been independently reviewed by MANOP against real market data before
          being listed. MANOP earns a success fee from the developer only if a transaction closes — never
          from you.
        </p>

        {projects.length === 0 && (
          <div style={{ padding: '3rem 0', textAlign: 'center', color: 'rgba(248,250,252,0.35)' }}>
            No developments published yet — check back soon.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {projects.map(p => {
            const rec = p.manop_recommendation ? RECOMMENDATION_LABEL[p.manop_recommendation] : null
            return (
              <Link key={p.id} href={`/development/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: '#162032', border: '1px solid rgba(248,250,252,0.08)', borderRadius: 14, overflow: 'hidden', height: '100%' }}>
                  <div style={{ height: 160, background: p.images?.[0] ? `url(${p.images[0]}) center/cover` : 'rgba(91,46,255,0.08)' }} />
                  <div style={{ padding: '1rem' }}>
                    {rec && (
                      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: rec.color, background: `${rec.color}1a`, border: `1px solid ${rec.color}44`, borderRadius: 20, padding: '2px 9px', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {rec.label}
                      </span>
                    )}
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'rgba(248,250,252,0.5)', marginTop: 4 }}>
                      {p.developer_accounts?.company_name} · {p.neighborhood || p.city}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(248,250,252,0.35)', marginTop: 6, textTransform: 'capitalize' }}>
                      {p.stage} {p.handover_date ? `· Handover ${new Date(p.handover_date).getFullYear()}` : ''}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}