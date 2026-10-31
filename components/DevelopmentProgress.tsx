'use client'
// Shows where one development stands: submission, mandate letter, MANOP review, agreement, commercial coverage, publication. Read-only.
import { useEffect, useState } from 'react'
import { authedFetch } from '../lib/authed-fetch'

const COLOR: Record<string, string> = { done: '#14B8A6', current: '#6366F1', waiting: '#F59E0B', blocked: '#EF4444', not_started: '#94A3B8', not_applicable: '#94A3B8' }

export default function DevelopmentProgress({ projectId, dark = true, onRequestAgreement, onOpenAgreement }: { projectId: string; dark?: boolean; onRequestAgreement?: (projectId: string) => void; onOpenAgreement?: (requestId: string) => void }) {
  const [p, setP] = useState<any>(null); const [err, setErr] = useState('')
  useEffect(() => { let live = true; (async () => {
    try { const r = await authedFetch(`/api/developments/${projectId}/workflow`); const j = await r.json().catch(() => null); if (!live) return; if (!r.ok) setErr(j?.error || 'Could not load the status.'); else setP(j.progress) } catch { if (live) setErr('Could not load the status.') }
  })(); return () => { live = false } }, [projectId])
  const border = dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.12)'
  if (err) return <div style={{ fontSize: 12 }}>{err}</div>
  if (!p) return <div style={{ fontSize: 12 }}>Loading status…</div>
  return (
    <div style={{ marginTop: 8 }}>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
        {p.steps.map((s: any) => (
          <li key={s.key} style={{ display: 'flex', gap: 8, fontSize: 12, borderTop: `1px solid ${border}`, paddingTop: 4 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: COLOR[s.state], marginTop: 5, flexShrink: 0 }} />
            <span><strong>{s.label}</strong>: {s.detail}</span>
          </li>
        ))}
      </ol>
      {onRequestAgreement && p.agreement?.canRequest && <button type="button" onClick={() => onRequestAgreement(projectId)} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, padding: '0.4rem 0.8rem' }}>Request an agreement for this development</button>}
      {onOpenAgreement && p.agreement?.requestId && !['declined', 'withdrawn'].includes(p.agreement.status) && <button type="button" onClick={() => onOpenAgreement(p.agreement.requestId)} style={{ marginTop: 8, fontSize: 12, padding: '0.4rem 0.8rem' }}>View agreement request {p.agreement.reference}</button>}
      {p.agencyNextSteps.length > 0 && <div style={{ fontSize: 12, marginTop: 6 }}><strong>Next:</strong> {p.agencyNextSteps.join(' ')}</div>}
    </div>
  )
}
