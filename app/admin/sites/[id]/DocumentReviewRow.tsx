'use client'
// app/admin/sites/[id]/DocumentReviewRow.tsx
//
// Lets admin staff change a document's status (authenticity check),
// control whether it's shown on the published Dossier, and, if a
// document_url exists, run AI extraction on it and then explicitly
// confirm or reject what came back. Extraction is never auto-applied
// — see app/api/documents/extract/route.ts's header.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DocStatusBadge } from '../../../../components/site-intelligence-ui'
import { DocumentStatus, SharedDocument, getDocumentStatusStyle } from '../../../../lib/site-intelligence'
import { getInitialDark, getDesignColors, designTokens, listenTheme } from '../../../../lib/theme'

const STATUS_OPTIONS: DocumentStatus[] = [
  'provided', 'under_review', 'reviewed', 'unable_to_verify', 'requires_further_verification',
]

export default function DocumentReviewRow({ doc }: { doc: SharedDocument }) {
  const router = useRouter()
  const [dark, setDark] = useState(getInitialDark())
  useEffect(() => listenTheme(setDark), [])
  const c = getDesignColors(dark)

  const [status, setStatus] = useState<DocumentStatus>(doc.status)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [visible, setVisible] = useState(!!doc.publicly_visible)
  const [visibilitySaving, setVisibilitySaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractedData, setExtractedData] = useState(doc.extracted_data)
  const [extractionStatus, setExtractionStatus] = useState(doc.extraction_status)

  async function updateStatus(newStatus: DocumentStatus) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, verification_note: note || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setStatus(newStatus)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update document status.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleVisibility() {
    const next = !visible
    setVisibilitySaving(true)
    try {
      const res = await fetch(`/api/admin/documents/${doc.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicly_visible: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setVisible(next)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not update visibility.')
    } finally {
      setVisibilitySaving(false)
    }
  }

  async function runExtraction() {
    if (!doc.document_url) return
    setExtracting(true)
    setExtractError('')
    try {
      const res = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: doc.id, document_url: doc.document_url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      setExtractedData(data.extracted_data)
      setExtractionStatus('extracted_pending_confirmation')
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  async function confirmExtraction(confirmed: boolean) {
    try {
      await fetch(`/api/admin/documents/${doc.id}/confirm-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed }),
      })
      setExtractionStatus(confirmed ? 'confirmed' : 'not_attempted')
      router.refresh()
    } catch {
      alert('Could not save that decision — try again.')
    }
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: `1px solid ${c.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13.5 }}>{doc.document_name}</div>
          <div style={{ fontSize: 11, color: c.textMuted, textTransform: 'capitalize' }}>
            {doc.document_type.replace(/_/g, ' ')}
          </div>
        </div>
        <DocStatusBadge status={status} dark={dark} />
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Verification note (optional) — e.g. how authenticity was checked"
        style={{
          width: '100%', padding: '6px 8px', fontSize: 12, marginBottom: 6,
          borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`,
          background: c.surfaceCard, color: c.textPrimary,
        }}
      />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {STATUS_OPTIONS.map((opt) => {
          const s = getDocumentStatusStyle(dark)[opt]
          const active = status === opt
          return (
            <button
              key={opt}
              onClick={() => updateStatus(opt)}
              disabled={saving || active}
              style={{
                fontSize: 11, padding: '4px 8px', borderRadius: designTokens.radius.sm,
                border: `1px solid ${active ? s.color : c.border}`,
                background: active ? s.bg : 'transparent',
                color: active ? s.color : c.textMuted,
                cursor: active || saving ? 'default' : 'pointer',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ── Public visibility control ──────────────────────────── */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.textMuted,
        marginBottom: 10, cursor: visibilitySaving ? 'default' : 'pointer', userSelect: 'none',
      }}>
        <input
          type="checkbox"
          checked={visible}
          disabled={visibilitySaving}
          onChange={toggleVisibility}
        />
        {visible
          ? <span style={{ color: c.verificationTeal }}>Visible on the published Dossier</span>
          : <span>Internal only — not shown to the public</span>}
      </label>

      {/* ── AI-assisted extraction — only for documents with a file attached ── */}
      {doc.document_url && (
        <div style={{ background: c.background, border: `1px solid ${c.border}`, borderRadius: designTokens.radius.sm, padding: 10 }}>
          {!extractedData ? (
            <button
              onClick={runExtraction}
              disabled={extracting}
              style={{
                fontSize: 11.5, padding: '5px 10px', borderRadius: designTokens.radius.sm,
                border: `1px solid ${c.border}`, background: 'transparent', color: c.textMuted,
                cursor: extracting ? 'default' : 'pointer',
              }}
            >
              {extracting ? 'Reading document…' : 'Read document with AI (proposal only, not a fact until you confirm)'}
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: c.textMuted, marginBottom: 6 }}>
                Extracted fields — {extractionStatus === 'confirmed' ? 'confirmed by you' : 'not yet confirmed, do not treat as fact'}
              </div>
              <pre style={{
                fontSize: 11, background: c.surfaceCard, padding: 8, borderRadius: designTokens.radius.sm,
                overflowX: 'auto', margin: 0, marginBottom: 8, color: c.textPrimary,
              }}>
                {JSON.stringify(extractedData, null, 2)}
              </pre>
              {extractionStatus !== 'confirmed' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => confirmExtraction(true)}
                    style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: designTokens.radius.sm, border: 'none', background: c.verificationTeal, color: '#fff', cursor: 'pointer' }}
                  >
                    Confirm — matches the document
                  </button>
                  <button
                    onClick={() => confirmExtraction(false)}
                    style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: 'transparent', color: c.textMuted, cursor: 'pointer' }}
                  >
                    Reject — inaccurate
                  </button>
                </div>
              )}
            </div>
          )}
          {extractError && <div style={{ color: c.statusRed, fontSize: 11, marginTop: 6 }}>{extractError}</div>}
        </div>
      )}
    </div>
  )
}