'use client'

// components/DevelopmentCompleteness.tsx
//
// Shows how a development measures against the shared intake standard
// (lib/development-standard.ts). Same component for admin, developer and agency.
// tier="submitter": only what the submitter can provide (developers/agencies).
// tier="all": also the MANOP evidence register + area comparables (admin only,
// because the evidence register is MANOP's record).

import { useEffect, useMemo, useState } from 'react'
import { sb } from '../lib/supabase/client'
import { evaluateStandard, summarise, type StandardItem } from '../lib/development-standard'

interface Props {
  projectId: string
  dark: boolean
  tier: 'submitter' | 'all'
  /** change this value to make the panel reload after the parent saved something */
  reloadToken?: string | number
}

export default function DevelopmentCompleteness({ projectId, dark, tier, reloadToken }: Props) {
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)'
  const text3 = dark ? 'rgba(248,250,252,0.4)' : 'rgba(15,23,42,0.45)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.1)'
  const teal = '#14B8A6'

  const [items, setItems] = useState<StandardItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data: p, error } = await sb.from('developer_projects')
        .select('name,neighborhood,city,stage,total_units,handover_date,description,images,submitting_agency_id,mandate_document_url')
        .eq('id', projectId).maybeSingle()
      if (error || !p) { if (live) setFailed(true); return }
      const [u, d, up] = await Promise.all([
        sb.from('developer_unit_types').select('size_sqm').eq('project_id', projectId),
        sb.from('developer_documents').select('document_type,document_name').eq('project_id', projectId),
        sb.from('development_updates').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      ])
      let evidence: { category: string; status: string }[] | null = null
      let comparablesCount: number | null = null
      if (tier === 'all') {
        const ev = await sb.from('development_evidence').select('category,status').eq('project_id', projectId)
        evidence = ev.error ? null : ((ev.data as { category: string; status: string }[]) || [])
        if (p.neighborhood && p.city) {
          const esc = (v: string) => v.replace(/[\\%_]/g, m => '\\' + m)
          const cmp = await sb.from('development_comparables').select('id', { count: 'exact', head: true })
            .ilike('neighborhood', esc(p.neighborhood)).ilike('city', esc(p.city))
          comparablesCount = cmp.error ? null : (cmp.count ?? 0)
        } else comparablesCount = 0
      }
      if (!live) return
      setItems(evaluateStandard({
        project: p, units: (u.data as { size_sqm: number | null }[]) || [],
        docs: (d.data as { document_type: string; document_name: string }[]) || [],
        evidence, updatesCount: up.error ? null : (up.count ?? 0), comparablesCount,
      }))
    })()
    return () => { live = false }
  }, [projectId, tier, reloadToken])

  const sum = useMemo(() => (items ? summarise(items) : null), [items])
  const groups = useMemo(() => {
    const g: Record<string, StandardItem[]> = {}
    for (const i of items ?? []) (g[i.group] ||= []).push(i)
    return g
  }, [items])

  const box: React.CSSProperties = { border: `1px solid ${border}`, borderRadius: 12, padding: 'clamp(0.85rem,3vw,1.25rem)', color: text }
  if (failed) return <div style={{ ...box, fontSize: 13, color: text3 }}>Completeness could not be loaded.</div>
  if (!items || !sum) return <div style={{ ...box, fontSize: 13, color: text3 }}>Checking completeness…</div>

  const pct = sum.requiredTotal ? Math.round((sum.requiredOk / sum.requiredTotal) * 100) : 0
  return (
    <div style={box}>
      <div style={{ fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
        Intake standard
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>
        {sum.requiredOk} of {sum.requiredTotal} required items complete
        {sum.recommendedMissing > 0 && <span style={{ fontWeight: 400, color: text3 }}> · {sum.recommendedMissing} recommended still open</span>}
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 6, borderRadius: 3, background: border, overflow: 'hidden', margin: '10px 0 14px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: teal }} />
      </div>
      {tier === 'submitter' && (
        <div style={{ fontSize: 12, color: text3, marginBottom: 12, lineHeight: 1.6 }}>
          MANOP records the evidence behind each claim during review. You only need to supply the items below.
        </div>
      )}
      {Object.entries(groups).map(([name, list]) => (
        <div key={name} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: text2, marginBottom: 6 }}>{name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '4px 16px' }}>
            {list.map(i => (
              <div key={i.key} title={i.state === 'ok' ? undefined : i.hint} style={{ fontSize: 13, lineHeight: 1.5, color: i.state === 'ok' ? text2 : i.required ? '#F59E0B' : text3 }}>
                <span aria-hidden>{i.state === 'ok' ? '✓' : i.state === 'partial' ? '◐' : '○'}</span>{' '}
                {i.label}
                {i.state !== 'ok' && <span style={{ fontSize: 11 }}> — {i.required ? 'required' : 'recommended'}</span>}
                {i.detail && <span style={{ fontSize: 11.5, color: text3 }}> · {i.detail}</span>}
                {i.state !== 'ok' && <div style={{ fontSize: 11.5, color: text3 }}>{i.hint}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}