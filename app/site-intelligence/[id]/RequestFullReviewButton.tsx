'use client'
// app/site-intelligence/[id]/RequestFullReviewButton.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authedFetch } from '../../../lib/authed-fetch'

export default function RequestFullReviewButton({ siteId }: { siteId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await authedFetch(`/api/sites/${siteId}/request-review`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error || 'Request failed')
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        whiteSpace: 'nowrap', padding: '8px 14px', fontSize: 12.5, fontWeight: 600,
        borderRadius: 4, border: 'none', background: '#6D28D9', color: '#fff',
        cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Submitting…' : 'Request Full MANOP Review'}
    </button>
  )
}