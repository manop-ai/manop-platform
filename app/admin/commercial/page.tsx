'use client'
// app/admin/commercial/page.tsx — admin: commercial terms, Agency Subscriptions and agency routes. Admin only (RLS is the real enforcement).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { getInitialDark, listenTheme } from '../../../lib/theme'
import ManopLoader from '../../../components/ManopLoader'
import AdminCommercialPanel from '../../../components/AdminCommercialPanel'
import AdminSubscriptionRequestsPanel from '../../../components/AdminSubscriptionRequestsPanel'

export default function AdminCommercialPage() {
  const { user, checking } = useAuth('admin')
  const [dark, setDark] = useState(true)
  useEffect(() => { setDark(getInitialDark()); return listenTheme(setDark) }, [])
  if (checking || !user) return <ManopLoader dark={dark} label="Loading…" />
  return (
    <div style={{ background: dark ? '#0F172A' : '#F8FAFC', color: dark ? '#F8FAFC' : '#0F172A', minHeight: '100vh', padding: 'clamp(1rem,4vw,2rem)' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/admin" style={{ fontSize: 13, textDecoration: 'none', color: 'inherit', opacity: 0.7 }}>← Command Center</Link>{' · '}
        <Link href="/admin/agreements" style={{ fontSize: 13, textDecoration: 'none', color: 'inherit', opacity: 0.7 }}>Agreement requests</Link>
        <AdminSubscriptionRequestsPanel />
        <AdminCommercialPanel />
      </div>
    </div>
  )
}