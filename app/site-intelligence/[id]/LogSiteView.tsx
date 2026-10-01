'use client'
// app/site-intelligence/[id]/LogSiteView.tsx

import { useEffect } from 'react'

export default function LogSiteView({
  siteId, city, neighborhood, countryCode,
}: { siteId: string; city: string; neighborhood: string | null; countryCode: string }) {
  useEffect(() => {
    fetch('/api/signals/site-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, city, neighborhood, countryCode }),
    }).catch(() => {}) // best-effort — never block or alert on this
  }, [siteId, city, neighborhood, countryCode])

  return null
}