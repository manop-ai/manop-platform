'use client'
// components/SaveDevelopmentButton.tsx
// Saves/removes a development from the diaspora buyer's watchlist.
// Reuses investor_watchlist (already built for resale properties) via
// its new project_id column, rather than a separate saved-developments table.
//
// toggle() takes the click event and stops it here — this button sits
// nested inside a Link (the development card) in a Server Component
// page, so a Server Component can't attach the "stop this click from
// also navigating" handler itself (event handlers can only live in
// Client Components). This is the one place that responsibility can
// correctly live, since this file already has 'use client'.

import { useState, useEffect } from 'react'
import { supabase as sb } from '../lib/supabase'
import { Check, Plus } from 'lucide-react'

export default function SaveDevelopmentButton({ projectId }: { projectId: string }) {
  const [saved, setSaved] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null)
      if (data.user?.id) {
        sb.from('investor_watchlist')
          .select('id')
          .eq('user_id', data.user.id)
          .eq('project_id', projectId)
          .maybeSingle()
          .then(({ data: existing }) => setSaved(!!existing))
      }
    })
  }, [projectId])

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!userId) {
      // Not logged in — send to register, same pattern as the rest of the site
      window.location.href = `/register?next=/developments`
      return
    }
    setLoading(true)
    if (saved) {
      await sb.from('investor_watchlist').delete().eq('user_id', userId).eq('project_id', projectId)
      setSaved(false)
    } else {
      await sb.from('investor_watchlist').insert({ user_id: userId, project_id: projectId, status: 'watching' })
      setSaved(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: '100%', padding: '0.55rem', borderRadius: 8, fontSize: 12, fontWeight: 600,
        cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
        background: saved ? 'rgba(91,46,255,0.15)' : 'transparent',
        border: `1px solid ${saved ? 'rgba(91,46,255,0.4)' : 'rgba(248,250,252,0.15)'}`,
        color: saved ? '#8B6BFF' : 'rgba(248,250,252,0.65)',
      }}
    >
      {saved ? <Check size={13} /> : <Plus size={13} />}
      {saved ? 'Saved to your dashboard' : 'Save to dashboard'}
    </button>
  )
}