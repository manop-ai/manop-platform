'use client'
// app/admin/sites/page.tsx
//
// Was a Server Component using the plain anon-key client — meaning
// every query ran as a fully anonymous visitor, regardless of who
// was actually logged in. RLS only permits anonymous reads of
// site_status = 'published', so this page could never show pending
// or draft sites no matter who viewed it. Converted to a Client
// Component (matching app/admin/page.tsx) so it runs with the real
// logged-in admin's session, and relies on the new
// sites_admin_read_all RLS policy for the actual security boundary —
// the role check below is UX only, not the thing keeping this data
// safe.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, FileEdit } from 'lucide-react'
import { sb } from '../../../lib/supabase/client'
import { Card, Muted, SiteStatusBadge } from '../../../components/site-intelligence-ui'
import { Site, OPPORTUNITY_TYPE_LABEL, ENTRY_SOURCE_LABEL, formatArea } from '../../../lib/site-intelligence'
import { getInitialDark, getDesignColors, designTokens, listenTheme } from '../../../lib/theme'

export default function AdminSitesPage() {
  const router = useRouter()
  const [dark, setDark] = useState(getInitialDark())
  useEffect(() => listenTheme(setDark), [])
  const c = getDesignColors(dark)

  const [sites, setSites] = useState<Site[] | null>(null)
  const [error, setError] = useState('')
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await sb.auth.getSession()
      const role = session?.user?.user_metadata?.user_role
      if (!session || !['admin', 'super_admin'].includes(role)) {
        setAuthorized(false)
        router.replace('/login')
        return
      }
      setAuthorized(true)

      const { data, error: qError } = await sb
        .from('sites')
        .select('*')
        .eq('is_sandbox', false)
        .in('site_status', ['pending_review', 'draft', 'published'])
        .order('created_at', { ascending: false })

      if (qError) {
        setError(
          qError.message.includes('is_sandbox')
            ? 'This query references is_sandbox, which is not on the live sites table yet — run the matching migration.'
            : `Could not load the review queue: ${qError.message}`,
        )
        return
      }
      setSites((data || []) as Site[])
    }
    load()
  }, [router])

  if (authorized === false) return null
  if (authorized === null || sites === null) {
    return (
      <div style={{ background: c.background, color: c.textMuted, minHeight: '100vh', fontFamily: designTokens.font.family, padding: 32 }}>
        Loading…
      </div>
    )
  }

  const pending = sites.filter(s => s.site_status === 'pending_review')
  const drafts = sites.filter(s => s.site_status === 'draft')
  const published = sites.filter(s => s.site_status === 'published')

  return (
    <div style={{ background: c.background, color: c.textPrimary, minHeight: '100vh', fontFamily: designTokens.font.family, padding: '32px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Site Review Queue</h1>
      <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 28 }}>
        Internal moderation for Site Intelligence submissions — separate from the Reviewed Developments admin queue.
      </p>

      {error && (
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.statusRed}`, color: c.statusRed, fontSize: 13 }}>
          {error}
        </div>
      )}

      <QueueSection title="Awaiting Review" icon={<Clock size={15} />} sites={pending} emptyLabel="Nothing waiting on review right now." c={c} dark={dark} />
      <QueueSection title="Drafts (Quick Reviews and unfinished submissions)" icon={<FileEdit size={15} />} sites={drafts} emptyLabel="No open drafts." c={c} dark={dark} />
      <QueueSection title="Published" icon={undefined} sites={published} emptyLabel="Nothing published yet." c={c} dark={dark} />
    </div>
  )
}

function QueueSection({
  title, icon, sites, emptyLabel, c, dark,
}: { title: string; icon?: React.ReactNode; sites: Site[]; emptyLabel: string; c: ReturnType<typeof getDesignColors>; dark: boolean }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon} {title} ({sites.length})
      </h2>
      {sites.length === 0
        ? <Muted c={c}>{emptyLabel}</Muted>
        : sites.map(s => (
          <Link key={s.id} href={`/admin/sites/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card c={c}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {s.neighborhood ? `${s.neighborhood}, ` : ''}{s.city}
                    {s.is_quick_review && <span style={{ fontSize: 11, color: c.textFaint, marginLeft: 8 }}>(Quick Review)</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: c.textMuted }}>
                    {OPPORTUNITY_TYPE_LABEL[s.opportunity_type]} · via {ENTRY_SOURCE_LABEL[s.entry_source]} · {formatArea(s.area_sqm)}
                  </div>
                </div>
                <SiteStatusBadge status={s.site_status} dark={dark} />
              </div>
            </Card>
          </Link>
        ))}
    </div>
  )
}