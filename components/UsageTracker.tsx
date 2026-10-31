'use client'
// Counts one anonymous page view per navigation (see lib/usage.ts). Mounted once in the root layout. Skips the admin area, and visitors whose
// browser sends Do-Not-Track. Stores only a random id in this browser's localStorage. Failure is silent.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { authedFetch } from '../lib/authed-fetch'

function visitorId(): string | null {
  try {
    let v = localStorage.getItem('manop-vid')
    if (!v || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) {
      const bytes = new Uint8Array(16); crypto.getRandomValues(bytes)
      v = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem('manop-vid', v)
    }
    return v
  } catch { return null }
}

export default function UsageTracker() {
  const pathname = usePathname()
  useEffect(() => {
    try {
      if (!pathname || /^\/(admin|api)(\/|$)/.test(pathname)) return
      if (typeof navigator !== 'undefined' && (navigator as any).doNotTrack === '1') return
      const id = visitorId(); if (!id) return
      void authedFetch('/api/usage/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor_id: id, path: pathname, referrer: document.referrer || null }) }).catch(() => {})
    } catch { /* never affects the page */ }
  }, [pathname])
  return null
}
