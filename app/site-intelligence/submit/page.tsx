'use client'
// app/site-intelligence/submit/page.tsx
//
// The Identify → Capture → Spatial Object → Documents intake form
// (blueprint §5-8). Deliberately asks for the CRS explicitly rather
// than assuming lat/lng — if the submitter doesn't know it, that's a
// valid answer and the site is created with crs_status left at its
// DB default ('requires_verification'), not silently guessed.
//
// Two additions on top of the original form:
//  - Documents are now individually typed (DocumentUploader), not one
//    shared type forced across a whole batch.
//  - Agency submissions get a distinct, required Mandate Evidence
//    upload — this is what site_has_mandate_evidence() actually
//    checks (mandate_document_url OR an 'allocation' document), so
//    an agency can no longer reach the publish gate later having
//    never been told this was required at submission time.
//  - A required consent checkbox, recorded durably on the site row
//    (submitter_consent_confirmed / _at), not just a UI-only gate.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DocumentUploader, { UploadedDocument } from '../../../components/DocumentUploader'
import SiteIntelligenceNav from '../../../components/SiteIntelligenceNav'
import { getInitialDark, getDesignColors, designTokens } from '../../../lib/theme'
import { OPPORTUNITY_TYPE_LABEL, OpportunityType, EntrySource } from '../../../lib/site-intelligence'
import { authedFetch } from '../../../lib/authed-fetch'

const DOCUMENT_TYPES = [
  { value: 'survey', label: 'Survey Plan' },
  { value: 'land_title', label: 'Title Document' },
  { value: 'deed', label: 'Deed' },
  { value: 'allocation', label: 'Allocation Document' },
  { value: 'site_plan', label: 'Site Plan' },
  { value: 'planning_document', label: 'Planning Document' },
  { value: 'photograph', label: 'Photograph' },
  { value: 'other', label: 'Other' },
]

export default function SubmitSitePage() {
  const router = useRouter()
  const dark = getInitialDark()
  const c = getDesignColors(dark)

  const [entrySource, setEntrySource] = useState<EntrySource>('developer_self')
  const [opportunityType, setOpportunityType] = useState<OpportunityType>('vacant_land')
  const [countryCode, setCountryCode] = useState('NG')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [addressDescription, setAddressDescription] = useState('')
  const [areaSqm, setAreaSqm] = useState('')
  const [askingPrice, setAskingPrice] = useState('')

  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [coordinateSource, setCoordinateSource] = useState('')
  const [crsKnown, setCrsKnown] = useState<'yes' | 'no' | 'unsure'>('unsure')
  const [crs, setCrs] = useState('')

  const [documents, setDocuments] = useState<UploadedDocument[]>([])
  const [mandateDocs, setMandateDocs] = useState<UploadedDocument[]>([])
  const [consentConfirmed, setConsentConfirmed] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedSite, setSubmittedSite] = useState<{ id: string; reference?: string; site_status: string } | null>(null)

  const isAgency = entrySource === 'agency_submission'
  const mandateSatisfied = !isAgency || mandateDocs.length > 0
  const canSubmit = city.trim() && consentConfirmed && mandateSatisfied

  async function handleSubmit() {
    setError('')
    if (!city.trim()) { setError('City is required.'); return }
    if (!consentConfirmed) { setError('Please confirm the consent statement before submitting.'); return }
    if (isAgency && mandateDocs.length === 0) {
      setError('Agency submissions require mandate evidence — upload an allocation letter or mandate document below.')
      return
    }

    setSubmitting(true)
    try {
      const allDocuments = [
        ...mandateDocs.map(d => ({ document_type: 'allocation', document_name: d.document_name, document_url: d.url })),
        ...documents.map(d => ({ document_type: d.document_type, document_name: d.document_name, document_url: d.url })),
      ]

      const res = await authedFetch('/api/sites/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_type: opportunityType,
          entry_source: entrySource,
          country_code: countryCode,
          state: state || undefined,
          city,
          neighborhood: neighborhood || undefined,
          address_description: addressDescription || undefined,
          area_sqm: areaSqm ? Number(areaSqm) : undefined,
          asking_price: askingPrice ? Number(askingPrice) : undefined,
          lat: lat ? Number(lat) : undefined,
          lng: lng ? Number(lng) : undefined,
          coordinate_source: coordinateSource || undefined,
          coordinate_reference_system: crsKnown === 'yes' ? (crs || undefined) : undefined,
          documents: allDocuments,
          consent_confirmed: true,
        }),
      })

      const data = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'Submission failed')

      setSubmittedSite({ id: data.site.id, reference: data.site.reference, site_status: data.site.site_status })
    } catch (err: any) {
      setError(err?.message || 'Something went wrong submitting this site.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: designTokens.radius.sm,
    border: `1px solid ${c.border}`, background: c.surfaceCard, color: c.textPrimary, fontSize: 14,
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, color: c.textMuted, marginBottom: 6, display: 'block' }
  const fieldWrap: React.CSSProperties = { marginBottom: 16 }

  if (submittedSite) {
    return (
      <div style={{
        background: c.background, color: c.textPrimary, minHeight: '100vh',
        fontFamily: designTokens.font.family, padding: '32px',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <SiteIntelligenceNav dark={dark} />
          <div style={{
            border: `1px solid ${c.verificationTeal}`, borderRadius: designTokens.radius.sm,
            padding: '24px', background: c.verificationTealBg,
          }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: c.textPrimary }}>
              Site submitted
            </h1>
            <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
              {submittedSite.reference ? `Reference: ${submittedSite.reference}. ` : ''}
              This site is now {submittedSite.site_status === 'pending_review' ? 'awaiting MANOP review' : 'saved as a draft'} —
              it isn't visible on Site Discovery yet, and won't be until MANOP has reviewed it and
              published it. You'll be notified once that happens.
            </p>
            <button
              onClick={() => router.push('/site-intelligence')}
              style={{
                padding: '10px 16px', borderRadius: designTokens.radius.sm, border: 'none',
                background: c.intelligencePurple, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Back to Site Discovery
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: c.background, color: c.textPrimary, minHeight: '100vh',
      fontFamily: designTokens.font.family, padding: '32px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <SiteIntelligenceNav dark={dark} />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Submit a Site</h1>
      <p style={{ fontSize: 13.5, color: c.textMuted, marginBottom: 28 }}>
        This establishes the site's existence in MANOP — it does not assess or verify it.
        Review happens separately, after submission.
      </p>

      {/* Identify */}
      <Section title="1. Identify" c={c}>
        <div style={fieldWrap}>
          <label style={labelStyle}>Who is submitting this site?</label>
          <select style={inputStyle} value={entrySource} onChange={(e) => setEntrySource(e.target.value as EntrySource)}>
            <option value="developer_self">Developer</option>
            <option value="agency_submission">Agency (under mandate)</option>
            <option value="landowner">Landowner</option>
            <option value="manop_sourced">MANOP research</option>
          </select>
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>Opportunity type</label>
          <select style={inputStyle} value={opportunityType} onChange={(e) => setOpportunityType(e.target.value as OpportunityType)}>
            {Object.entries(OPPORTUNITY_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </Section>

      {/* Capture */}
      <Section title="2. Capture" c={c}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Country</label>
            <input style={inputStyle} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>State</label>
            <input style={inputStyle} value={state} onChange={(e) => setState(e.target.value)} />
          </div>
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>City *</label>
          <input style={inputStyle} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" />
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>Neighborhood / locality</label>
          <input style={inputStyle} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Lekki Phase 1" />
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>Address / location description</label>
          <input style={inputStyle} value={addressDescription} onChange={(e) => setAddressDescription(e.target.value)} placeholder="Off Admiralty Way, 2nd Roundabout" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Land area (sqm), if known</label>
            <input style={inputStyle} type="number" value={areaSqm} onChange={(e) => setAreaSqm(e.target.value)} />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Asking price (₦), if applicable</label>
            <input style={inputStyle} type="number" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
          </div>
        </div>
      </Section>

      {/* Spatial object */}
      <Section title="3. Location & Coordinates" c={c}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={fieldWrap}>
            <label style={labelStyle}>Latitude, if known</label>
            <input style={inputStyle} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="6.4387" />
          </div>
          <div style={fieldWrap}>
            <label style={labelStyle}>Longitude, if known</label>
            <input style={inputStyle} value={lng} onChange={(e) => setLng(e.target.value)} placeholder="3.4783" />
          </div>
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>Where did these coordinates come from?</label>
          <input style={inputStyle} value={coordinateSource} onChange={(e) => setCoordinateSource(e.target.value)} placeholder="e.g. Survey plan SP/LA/2024/1123, or GPS estimate" />
        </div>
        <div style={fieldWrap}>
          <label style={labelStyle}>Do you know the coordinate reference system used?</label>
          <select style={inputStyle} value={crsKnown} onChange={(e) => setCrsKnown(e.target.value as any)}>
            <option value="unsure">Not sure</option>
            <option value="no">No — a surveyor will need to confirm this</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        {crsKnown === 'yes' && (
          <div style={fieldWrap}>
            <label style={labelStyle}>Coordinate reference system</label>
            <input style={inputStyle} value={crs} onChange={(e) => setCrs(e.target.value)} placeholder="e.g. UTM Zone 31N, WGS84" />
          </div>
        )}
        {crsKnown !== 'yes' && (
          <div style={{ fontSize: 12.5, color: c.textFaint, marginTop: -8, marginBottom: 16 }}>
            That's fine — MANOP won't guess a coordinate system. This will be flagged as
            requiring professional verification before any parcel boundary is derived.
          </div>
        )}
      </Section>

      {/* Mandate evidence — agency submissions only, required */}
      {isAgency && (
        <Section title="4. Mandate Evidence (required)" c={c}>
          <div style={{
            fontSize: 12.5, color: c.textMuted, marginBottom: 14, padding: '10px 12px',
            border: `1px solid ${c.statusAmber}`, borderRadius: designTokens.radius.sm,
            background: c.statusAmberBg,
          }}>
            Agency submissions can't be published without proof you're authorized to represent
            this land — an allocation letter, agency agreement, or equivalent mandate document.
            This is MANOP's anti-fraud gate: it's enforced by the database, not just this form.
          </div>
          <DocumentUploader
            dark={dark}
            documents={mandateDocs}
            onChange={setMandateDocs}
            typeOptions={[{ value: 'allocation', label: 'Mandate / Allocation Document' }]}
            defaultType="allocation"
            label="Mandate document"
            hint="Allocation letter, agency mandate, or written authorization from the landowner"
            maxDocuments={4}
          />
        </Section>
      )}

      {/* Documents */}
      <Section title={isAgency ? '5. Other Documents' : '4. Documents'} c={c}>
        <DocumentUploader
          dark={dark}
          documents={documents}
          onChange={setDocuments}
          typeOptions={DOCUMENT_TYPES}
          defaultType="survey"
          label="Upload documents"
          hint="Survey plans, title documents, site plans, photos — add as many as you have, each tagged individually"
          maxDocuments={12}
        />
      </Section>

      {/* Consent */}
      <Section title={isAgency ? '6. Consent' : '5. Consent'} c={c}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: c.textPrimary, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={consentConfirmed}
            onChange={(e) => setConsentConfirmed(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>
            {isAgency
              ? 'I confirm I am authorized to submit this site on behalf of the landowner or a party with legal standing, and that the information and documents provided are accurate to the best of my knowledge.'
              : 'I confirm the information and documents provided are accurate to the best of my knowledge.'}
          </span>
        </label>
      </Section>

      {error && (
        <div style={{ color: c.statusRed, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !canSubmit}
        style={{
          width: '100%', padding: '12px', borderRadius: designTokens.radius.sm, border: 'none',
          background: c.intelligencePurple, color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: submitting || !canSubmit ? 'default' : 'pointer', opacity: submitting || !canSubmit ? 0.6 : 1,
        }}
      >
        {submitting ? 'Submitting…' : 'Submit Site'}
      </button>
      </div>
    </div>
  )
}

function Section({ title, c, children }: { title: string; c: any; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${c.border}` }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  )
}