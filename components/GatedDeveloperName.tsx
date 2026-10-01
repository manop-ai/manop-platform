'use client'
// components/GatedDeveloperName.tsx
//
// Developer identity is withheld from logged-out visitors — a real
// business decision (per Joel's advisor), not a UI nicety. This is why
// it's a client component and not just a conditional render in the
// server page: this app has no server-side auth cookies (sessions live
// in browser localStorage only), so a server component genuinely cannot
// know whether the visitor is logged in at request time. If the
// developer name were fetched server-side and then hidden with CSS/JS,
// it would still be sitting in the HTML response for anyone to read —
// that's a cosmetic hide, not a real gate.
//
// This component is the real version: the parent page/query never
// fetches developer_accounts at all. This component runs entirely in
// the browser, checks for a session first, and only then queries
// developer_accounts directly — which is only a real boundary once the
// RLS policy is tightened to require authentication (see the migration
// note below). Until that migration runs, treat this as "hidden from
// the UI for logged-out users" rather than "provably inaccessible."
//
// REQUIRED migration for this to be a hard boundary, not just a UI gate:
//   ALTER POLICY / new policy on developer_accounts restricting SELECT
//   of company_name (or the whole row) to `auth.uid() IS NOT NULL`.
//   Send this to whoever owns developer_accounts RLS before relying on
//   this for anything commercially sensitive.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase as sb } from '../lib/supabase'

interface DeveloperInfo {
  company_name: string
  years_active: number | null
  track_record_notes: string | null
}

export default function GatedDeveloperName({
  developerId, fields = 'name', dark = true,
}: {
  developerId: string
  fields?: 'name' | 'full'
  dark?: boolean
}) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [info, setInfo] = useState<DeveloperInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      const { data: { session } } = await sb.auth.getSession()
      if (cancelled) return
      setLoggedIn(!!session)
      if (!session) return

      const { data } = await sb.from('developer_accounts')
        .select('company_name,years_active,track_record_notes')
        .eq('id', developerId)
        .maybeSingle()
      if (!cancelled && data) setInfo(data as DeveloperInfo)
    }
    run()
    return () => { cancelled = true }
  }, [developerId])

  const textColor = dark ? '#F8FAFC' : '#0F172A'
  const mutedColor = dark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.5)'
  const linkColor = '#5B2EFF'

  if (loggedIn === null) {
    // Brief, deliberately generic — never render a placeholder shaped
    // like a real name (e.g. skeleton bars sized to typical text) that
    // could imply info that isn't actually available yet.
    return <span style={{ color: mutedColor, fontSize: 'inherit' }}>—</span>
  }

  if (!loggedIn) {
    return (
      <Link href="/login" style={{ color: linkColor, fontSize: 'inherit', textDecoration: 'none', fontWeight: 600 }}>
        Login to view developer
      </Link>
    )
  }

  if (!info) return <span style={{ color: mutedColor, fontSize: 'inherit' }}>—</span>

  if (fields === 'name') return <span style={{ color: textColor }}>{info.company_name}</span>

  return (
    <div>
      <div style={{ color: textColor, fontWeight: 700 }}>{info.company_name}</div>
      {info.years_active != null && (
        <div style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>{info.years_active} years active</div>
      )}
      {info.track_record_notes && (
        <div style={{ fontSize: 12, color: mutedColor, marginTop: 6, lineHeight: 1.5 }}>{info.track_record_notes}</div>
      )}
    </div>
  )
}