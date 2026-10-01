'use client'
// app/admin/sites/[id]/AddEvidenceForm.tsx
//
// This is what "adding our review or any data source obtained"
// means concretely — a MANOP staff member manually records a finding
// (a planning fact they confirmed by phone, a market observation from
// a site visit, a dataset lookup that isn't automated yet) directly
// into site_intelligence_layers, with the same source/confidence/
// evidence-status provenance every other row in that table carries.
// This is NOT a shortcut around the automated spatial intersection —
// it's the manual counterpart to it, for evidence that has no
// dataset to intersect against yet.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayerCategory, Confidence, EvidenceStatus,
  LAYER_CATEGORY_LABEL,
} from '../../../../lib/site-intelligence'
import { getDesignColors, designTokens } from '../../../../lib/theme'
import { authedFetch } from '../../../../lib/authed-fetch'

const dark = true
const c = getDesignColors(dark)

const EVIDENCE_STATUS_OPTIONS: EvidenceStatus[] = [
  'provided', 'source_derived', 'cross_referenced', 'reviewed', 'unable_to_establish', 'requires_further_verification',
]
const CONFIDENCE_OPTIONS: Confidence[] = ['high', 'medium', 'low', 'unconfirmed']
const SOURCE_TYPE_OPTIONS = [
  'official_government', 'professional_survey', 'user_submitted', 'third_party_public', 'manop_derived',
] as const

export default function AddEvidenceForm({ siteId }: { siteId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<LayerCategory>('planning')
  const [label, setLabel] = useState('')
  const [valueSummary, setValueSummary] = useState('')
  const [fact, setFact] = useState('')
  const [consideration, setConsideration] = useState('')
  const [source, setSource] = useState('')
  const [sourceType, setSourceType] = useState<typeof SOURCE_TYPE_OPTIONS[number]>('manop_derived')
  const [sourceDate, setSourceDate] = useState('')
  const [confidence, setConfidence] = useState<Confidence>('medium')
  const [evidenceStatus, setEvidenceStatus] = useState<EvidenceStatus>('reviewed')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, marginBottom: 10,
    borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`,
    background: c.surfaceCard, color: c.textPrimary,
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: c.textMuted, marginBottom: 4, display: 'block' }

  async function handleSave() {
    setError('')
    if (!label.trim() || !source.trim()) { setError('Label and source are required.'); return }
    setSaving(true)
    try {
      const res = await authedFetch(`/api/admin/sites/${siteId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layer_category: category,
          layer_type: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60),
          label, value_summary: valueSummary || undefined,
          fact: fact || undefined, consideration: consideration || undefined,
          source, source_type: sourceType, source_date: sourceDate || undefined,
          confidence, evidence_status: evidenceStatus,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed')
      setLabel(''); setValueSummary(''); setFact(''); setConsideration(''); setSource(''); setSourceDate('')
      setOpen(false)
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 13, padding: '8px 14px', borderRadius: designTokens.radius.sm,
          border: `1px solid ${c.border}`, background: 'transparent', color: c.textPrimary, cursor: 'pointer',
        }}
      >
        + Add Evidence / Data Source
      </button>
    )
  }

  return (
    <div style={{
      background: c.surfaceCard, border: `1px solid ${c.border}`,
      borderRadius: designTokens.radius.sm, padding: 16, marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Add Evidence / Data Source</div>

      <label style={labelStyle}>Category</label>
      <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value as LayerCategory)}>
        {Object.entries(LAYER_CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      <label style={labelStyle}>Label *</label>
      <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Confirmed with LASPPPA by phone" />

      <label style={labelStyle}>Short summary (shown on the site profile)</label>
      <input style={inputStyle} value={valueSummary} onChange={(e) => setValueSummary(e.target.value)} />

      <label style={labelStyle}>Fact (what was observed/confirmed)</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={fact} onChange={(e) => setFact(e.target.value)} />

      <label style={labelStyle}>Consideration (what the developer should examine)</label>
      <textarea style={{ ...inputStyle, minHeight: 60 }} value={consideration} onChange={(e) => setConsideration(e.target.value)} />

      <label style={labelStyle}>Source *</label>
      <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. LASPPPA phone confirmation, 4 Sept 2026" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Source type</label>
          <select style={inputStyle} value={sourceType} onChange={(e) => setSourceType(e.target.value as any)}>
            {SOURCE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Source date</label>
          <input type="date" style={inputStyle} value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Confidence</label>
          <select style={inputStyle} value={confidence} onChange={(e) => setConfidence(e.target.value as Confidence)}>
            {CONFIDENCE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Evidence status</label>
          <select style={inputStyle} value={evidenceStatus} onChange={(e) => setEvidenceStatus(e.target.value as EvidenceStatus)}>
            {EVIDENCE_STATUS_OPTIONS.map((v) => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ color: c.statusRed, fontSize: 12, marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => setOpen(false)}
          style={{ fontSize: 13, padding: '8px 14px', borderRadius: designTokens.radius.sm, border: `1px solid ${c.border}`, background: 'transparent', color: c.textMuted, cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: designTokens.radius.sm, border: 'none', background: c.intelligencePurple, color: '#fff', cursor: saving ? 'default' : 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save Evidence'}
        </button>
      </div>
    </div>
  )
}