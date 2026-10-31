'use client'
// Buyer dashboard: the Buyer Packs this person has been issued, with a re-download that always generates the CURRENT pack.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authedFetch } from '../lib/authed-fetch'
import BuyerPackButton from './BuyerPackButton'

export default function MyBuyerPacksPanel({ dark }: { dark: boolean }) {
  const [packs, setPacks] = useState<any[] | null>(null)
  const [error, setError] = useState('')
  const border = dark ? 'rgba(248,250,252,0.15)' : 'rgba(15,23,42,0.15)'
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await authedFetch('/api/me/buyer-packs'); const j = await res.json().catch(() => null)
        if (!live) return
        if (!res.ok) { setError(j?.error || `Could not load your Buyer Packs (HTTP ${res.status}).`); setPacks([]); return }
        setPacks(j.packs ?? [])
      } catch (e: any) { if (live) { setError(e?.message || 'Network error.'); setPacks([]) } }
    })()
    return () => { live = false }
  }, [])
  if (packs === null) return <div style={{ padding: '1rem 0' }}>Loading your Buyer Packs…</div>
  return (
    <section aria-label="Your Buyer Packs">
      <p style={{ fontSize: 13, maxWidth: 640, lineHeight: 1.6 }}>Each pack is built from MANOP&apos;s current record when you download it, so a re-download always shows the latest prices, stage and documents.</p>
      {error && <div role="alert" style={{ padding: '0.7rem', border: '1px solid #EF4444', marginBottom: 10, fontSize: 13 }}>{error}</div>}
      {!error && packs.length === 0 && (
        <div style={{ padding: '1.5rem', border: `1px solid ${border}`, textAlign: 'center' }}>
          <p>You have not downloaded a Buyer Pack yet.</p>
          <Link href="/developments">Browse reviewed developments</Link>
        </div>
      )}
      {packs.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '0.8rem', border: `1px solid ${border}`, marginBottom: 8 }}>
          <div>
            <strong>{p.development?.name ?? 'Development no longer available'}</strong>
            <div style={{ fontSize: 12 }}>{[p.development?.neighborhood, p.development?.city].filter(Boolean).join(', ')} · {p.status === 'granted' ? `issued ${new Date(p.granted_at).toLocaleDateString('en-GB')}` : p.status}{p.basis === 'free_access' ? ' · free access' : ''}{!p.formatCurrent ? ' · older format' : ''}</div>
          </div>
          {p.development?.available && p.status === 'granted' ? <BuyerPackButton projectId={p.project_id} dark={dark} compact /> : <span style={{ fontSize: 12 }}>Not available to download</span>}
        </div>
      ))}
    </section>
  )
}