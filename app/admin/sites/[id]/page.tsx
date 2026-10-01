'use client'
// app/admin/sites/[id]/page.tsx
//
// Converted to a Client Component for the same reason as the queue
// page — needs the real logged-in admin's session, which a Server
// Component using the plain anon-key client never had. Security
// boundary is the sites_admin_read_all RLS policy; the role check
// below is UX (redirect non-admins away cleanly), not the thing
// actually protecting this data.

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { sb } from '../../../../lib/supabase/client'
import { Card, Muted } from '../../../../components/site-intelligence-ui'
import DocumentReviewRow from './DocumentReviewRow'
import AddEvidenceForm from './AddEvidenceForm'
import {
  Site, SharedDocument, OPPORTUNITY_TYPE_LABEL, ENTRY_SOURCE_LABEL, formatArea,
} from '../../../../lib/site-intelligence'
import { getInitialDark, getDesignColors, designTokens, listenTheme } from '../../../../lib/theme'
import AdminSiteReviewForm from './AdminSiteReviewForm'

export default function AdminSiteReviewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [dark, setDark] = useState(getInitialDark())
  useEffect(() => listenTheme(setDark), [])
  const c = getDesignColors(dark)

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [site, setSite] = useState<Site | null | undefined>(undefined)
  const [docs, setDocs] = useState<SharedDocument[]>([])
  const [queue, setQueue] = useState<string[]>([])

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

      const [{ data: siteData }, { data: docData }, { data: queueData }] = await Promise.all([
        sb.from('sites').select('*').eq('id', params.id).single(),
        sb.from('developer_documents').select('*').eq('site_id', params.id),
        sb.from('sites').select('id').eq('is_sandbox', false).in('site_status', ['pending_review', 'draft']).order('created_at', { ascending: false }),
      ])

      setSite((siteData as Site) ?? null)
      setDocs((docData || []) as SharedDocument[])
      setQueue((queueData || []).map(r => r.id as string))
    }
    load()
  }, [params.id, router])

  if (authorized === false) return null
  if (authorized === null || site === undefined) {
    return <div style={{ background: c.background, color: c.textMuted, minHeight: '100vh', fontFamily: designTokens.font.family, padding: 32 }}>Loading…</div>
  }
  if (site === null) {
    return <div style={{ background: c.background, color: c.textMuted, minHeight: '100vh', fontFamily: designTokens.font.family, padding: 32 }}>Site not found.</div>
  }

  const s = site
  const hasMandateEvidence = !!s.mandate_document_url || docs.some(d => d.document_type === 'allocation')
  const currentIndex = queue.indexOf(params.id)
  const prevId = currentIndex > 0 ? queue[currentIndex - 1] : null
  const nextId = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null

  const navBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600,
    padding: '7px 12px', borderRadius: designTokens.radius.sm,
    border: `1px solid ${c.border}`, background: 'transparent',
    color: disabled ? c.textFaint : c.textPrimary,
    textDecoration: 'none', pointerEvents: disabled ? 'none' : 'auto',
    opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer',
  })

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px', maxWidth: 760, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <a href="/admin/sites" style={{ fontSize: 13, color: c.textMuted }}>← Site Review Queue</a>
        {queue.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: c.textFaint }}>
              {currentIndex >= 0 ? `${currentIndex + 1} of ${queue.length}` : ''}
            </span>
            <a href={prevId ? `/admin/sites/${prevId}` : '#'} style={navBtn(!prevId)}>
              <ChevronLeft size={14} /> Previous
            </a>
            <a href={nextId ? `/admin/sites/${nextId}` : '#'} style={navBtn(!nextId)}>
              Next <ChevronRight size={14} />
            </a>
          </div>
        )}
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
        {s.neighborhood ? `${s.neighborhood}, ` : ''}{s.city}
      </h1>
      <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 24 }}>
        {OPPORTUNITY_TYPE_LABEL[s.opportunity_type]} · Submitted via {ENTRY_SOURCE_LABEL[s.entry_source]}
        {s.reference && ` · ${s.reference}`}
      </div>

      <Card c={c}>
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>SUBMITTER CONSENT</div>
        {s.submitter_consent_confirmed
          ? <div style={{ fontSize: 13.5, color: c.verificationTeal }}>
              Confirmed{s.submitter_consent_confirmed_at ? ` — ${new Date(s.submitter_consent_confirmed_at).toLocaleString()}` : ''}
            </div>
          : <div style={{ fontSize: 13.5, color: c.statusRed }}>
              Not on file — this site predates the consent requirement, or was created directly.
            </div>}
      </Card>

      {s.entry_source === 'agency_submission' && (
        <Card c={c}>
          <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 6 }}>MANDATE EVIDENCE</div>
          {hasMandateEvidence
            ? <div style={{ fontSize: 13.5, color: c.verificationTeal }}>On file — publishing is allowed.</div>
            : <div style={{ fontSize: 13.5, color: c.statusRed }}>
                Missing. This is an agency submission with no mandate document or allocation
                evidence on file. Publishing will be rejected by the database until this is provided —
                this is the anti-fraud gate, working as intended.
              </div>}
        </Card>
      )}

      <Card c={c}>
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>SITE FACTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13.5 }}>
          <div>Area: {formatArea(s.area_sqm ?? s.boundary_area_sqm)}</div>
          <div>Coordinates: {s.lat && s.lng ? `${s.lat}, ${s.lng}` : 'Not provided'}</div>
          <div>Coordinate source: {s.coordinate_source || 'Not provided'}</div>
          <div>CRS status: {s.crs_status}</div>
        </div>
      </Card>

      <Card c={c}>
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
          DOCUMENTS ({docs.length})
        </div>
        {docs.length === 0
          ? <Muted c={c}>None supplied.</Muted>
          : docs.map(d => <DocumentReviewRow key={d.id} doc={d} />)}
      </Card>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: c.textMuted, marginBottom: 10 }}>
          EVIDENCE / DATA SOURCES ON RECORD
        </div>
        <AddEvidenceForm siteId={s.id} />
      </div>

      <AdminSiteReviewForm
        siteId={s.id}
        initialReviewNotes={s.review_notes || ''}
        initialConsiderations={s.considerations || ''}
        alreadyReviewed={!!s.reviewed_at}
        currentStatus={s.site_status}
      />

      {queue.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <a href={prevId ? `/admin/sites/${prevId}` : '#'} style={navBtn(!prevId)}>
            <ChevronLeft size={14} /> Previous request
          </a>
          <a href={nextId ? `/admin/sites/${nextId}` : '#'} style={navBtn(!nextId)}>
            Next request <ChevronRight size={14} />
          </a>
        </div>
      )}
    </div>
  )
}