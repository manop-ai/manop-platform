'use client'

// components/SurroundingDevelopments.tsx
//
// Review context: what MANOP already knows about the area around a development.
// Real data only: published MANOP developments in the same neighbourhood, and the
// comparables already recorded for that neighbourhood. Empty states are stated plainly.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '../lib/supabase/client'

interface Nearby { id: string; name: string; stage: string | null; total_units: number | null; handover_date: string | null; fromPrice: number | null }
interface Comp { id: string; comparable_name: string; developer_name: string | null; unit_size_class: string; price_local: number; currency_code: string; construction_stage: string | null; source_type: string; recorded_at: string }

const SOURCE: Record<string, string> = {
  manop_direct_listing: 'MANOP direct listing', agency_listing: 'Agency listing on MANOP',
  market_research: 'Market research', developer_disclosed: 'Developer disclosed',
}
const money = (n: number, cur: string) => (cur === 'NGN' ? '₦' : cur + ' ') + (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString())

export default function SurroundingDevelopments({ projectId, neighborhood, city, dark }: {
  projectId: string; neighborhood: string | null; city: string | null; dark: boolean
}) {
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const teal = '#14B8A6'

  const [nearby, setNearby] = useState<Nearby[] | null>(null)
  const [comps, setComps] = useState<Comp[] | null>(null)

  useEffect(() => {
    let live = true
    setNearby(null); setComps(null)
    if (!neighborhood) { setNearby([]); setComps([]); return }
    const esc = (v: string) => v.replace(/[\\%_]/g, m => '\\' + m)
    ;(async () => {
      const { data: ps } = await sb.from('developer_projects')
        .select('id,name,stage,total_units,handover_date')
        .eq('publish_status', 'published').neq('id', projectId)
        .ilike('neighborhood', esc(neighborhood)).limit(10)
      const rows = (ps as Omit<Nearby, 'fromPrice'>[]) || []
      let prices: Record<string, number> = {}
      if (rows.length) {
        const { data: us } = await sb.from('developer_unit_types').select('project_id,price_ngn').in('project_id', rows.map(r => r.id))
        for (const u of (us as { project_id: string; price_ngn: number | null }[]) || []) {
          if (u.price_ngn && (!prices[u.project_id] || u.price_ngn < prices[u.project_id])) prices[u.project_id] = u.price_ngn
        }
      }
      let c: Comp[] = []
      if (city) {
        const { data: cs } = await sb.from('development_comparables')
          .select('id,comparable_name,developer_name,unit_size_class,price_local,currency_code,construction_stage,source_type,recorded_at')
          .ilike('neighborhood', esc(neighborhood)).ilike('city', esc(city))
          .order('recorded_at', { ascending: false }).limit(10)
        c = (cs as Comp[]) || []
      }
      if (!live) return
      setNearby(rows.map(r => ({ ...r, fromPrice: prices[r.id] ?? null })))
      setComps(c)
    })()
    return () => { live = false }
  }, [projectId, neighborhood, city])

  const box: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 12, padding: 'clamp(0.85rem,3vw,1.25rem)', color: text }
  const lab: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }
  const area = [neighborhood, city].filter(Boolean).join(', ') || 'this area'

  return (
    <div style={box}>
      <div style={lab}>Around {area}</div>
      {(nearby === null || comps === null) ? (
        <div style={{ fontSize: 13, color: text3 }}>Looking up the area…</div>
      ) : (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: text2, marginBottom: 6 }}>Developments on MANOP</div>
          {nearby.length === 0 && <div style={{ fontSize: 13, color: text3, marginBottom: 12 }}>No other published MANOP developments in {neighborhood || 'this neighbourhood'} yet.</div>}
          {nearby.map(n => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0.45rem 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
              <Link href={`/development/${n.id}`} target="_blank" style={{ color: teal, textDecoration: 'none', fontWeight: 600 }}>{n.name}</Link>
              <span style={{ color: text3 }}>
                {[n.stage, n.total_units ? `${n.total_units} units` : null, n.fromPrice ? `from ${money(n.fromPrice, 'NGN')}` : null].filter(Boolean).join(' · ') || 'No details recorded'}
              </span>
            </div>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700, color: text2, margin: '14px 0 6px' }}>Recorded comparables</div>
          {comps.length === 0 && <div style={{ fontSize: 13, color: text3 }}>No comparables recorded for this area yet.</div>}
          {comps.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '0.45rem 0', borderBottom: `1px solid ${border}`, fontSize: 13 }}>
              <span>{c.comparable_name}{c.developer_name ? <span style={{ color: text3 }}> · {c.developer_name}</span> : null}</span>
              <span style={{ color: text3 }}>
                {c.unit_size_class} · {money(c.price_local, c.currency_code)}{c.construction_stage ? ` · ${c.construction_stage}` : ''} · {SOURCE[c.source_type] || c.source_type}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: text3, marginTop: 12 }}>
            Found another development nearby? <Link href="/admin/comparables" style={{ color: teal }}>Record it as a comparable</Link>.
          </div>
        </>
      )}
    </div>
  )
}