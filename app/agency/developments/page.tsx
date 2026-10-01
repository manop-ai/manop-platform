'use client'
// app/agency/developments/page.tsx
//
// This used to be a separate, standalone development-submission page —
// but the real, more complete implementation now lives directly inside
// app/agency/dashboard/page.tsx (the "Developments" tab: AgencyDevelopmentsTab).
// That version has the mandate requirement, unit types + pricing,
// documents, and unclaimed-developer auto-creation that this standalone
// page never had, and it's the one agencies would actually find, since
// nothing in the dashboard's own navigation ever linked to this route —
// it was only reachable by typing the URL directly.
//
// Rather than maintain two parallel, drifting implementations of the
// same thing, this is now just a redirect into the real one.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AgencyDevelopmentsRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/agency/dashboard?tab=developments')
  }, [router])
  return null
}