'use client'
// app/admin/sites/[id]/AdminSiteReviewForm.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDesignColors, designTokens } from '../../../../lib/theme'
import { authedFetch } from '../../../../lib/authed-fetch'

const dark = true
const c = getDesignColors(dark)

export default function AdminSiteReviewForm({
  siteId, initialReviewNotes, initialConsiderations, alreadyReviewed, currentStatus,
}: {
  siteId: string
  initialReviewNotes: string
  initialConsiderations: string
  alreadyReviewed: boolean
  currentStatus: string
}) {
  const router = useRouter()
  const [reviewNotes, setReviewNotes] = useState(initialReviewNotes)
  const [considerations, setConsiderations] = useState(initialConsiderations)
  const [reviewed, setReviewed] = useState(alreadyReviewed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function save(publish: boolean) {
    setError(''); setMessage(''); setSaving(true)
    try {
      const res = await authedFetch(`/api/admin/sites/${siteId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_notes: reviewNotes, considerations, reviewed, publish }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setMessage(publish ? 'Published.' : 'Saved.')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const textareaStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: designTokens.radius.sm,
    border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary,
    fontSize: 14, minHeight: 70, fontFamily: designTokens.font.family,
  }

  return (
    <div style={{
      background: c.surfaceCard, border: `1px solid ${c.border}`,
      borderRadius: designTokens.radius.sm, padding: 16, marginTop: 8,
    }}>
      <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>REVIEW NOTES (what MANOP checked)</div>
      <textarea style={textareaStyle} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />

      <div style={{ fontSize: 12, color: c.textMuted, margin: '14px 0 6px' }}>CONSIDERATIONS (or state none identified)</div>
      <textarea style={textareaStyle} value={considerations} onChange={(e) => setConsiderations(e.target.value)} />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13.5, cursor: 'pointer' }}>
        <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        Mark as reviewed
      </label>
      <div style={{ fontSize: 11.5, color: c.textFaint, marginTop: 4 }}>
        MANOP reviews and structures information — it does not tell users whether to buy.
        This is not a recommendation, safety rating, or approval.
      </div>

      {error && <div style={{ color: c.statusRed, fontSize: 13, marginTop: 12 }}>{error}</div>}
      {message && <div style={{ color: c.verificationTeal, fontSize: 13, marginTop: 12 }}>{message}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={() => save(false)}
          disabled={saving}
          style={{
            padding: '10px 16px', fontSize: 13.5, borderRadius: designTokens.radius.sm,
            border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          Save
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || !reviewed}
          title={!reviewed ? 'Mark as reviewed before publishing' : undefined}
          style={{
            padding: '10px 16px', fontSize: 13.5, fontWeight: 600, borderRadius: designTokens.radius.sm,
            border: 'none', background: c.intelligencePurple, color: '#fff',
            cursor: saving || !reviewed ? 'default' : 'pointer', opacity: !reviewed ? 0.5 : 1,
          }}
        >
          {currentStatus === 'published' ? 'Published' : 'Publish'}
        </button>
      </div>
    </div>
  )
}