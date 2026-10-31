'use client'
// components/UnitRequestSummary.tsx
//
// Shows which unit a buyer asked about, the price MANOP recorded for that unit at
// the moment of the request, what the request was for, and where it was routed.
// Read from the lead's own stored snapshot (sql/phase14_unit_request.sql), never
// re-derived from the current listing, so a later price edit cannot rewrite it.
// One component for the Deal Room, the admin lead list and the developer pipeline.

import { Building2 } from 'lucide-react'
import { summariseUnitRequest, type StoredUnitRequest } from '../lib/unit-selection'

interface Props {
  lead: StoredUnitRequest & { note?: string | null }
  dark?: boolean
  compact?: boolean   // one-line form for list rows
}

export default function UnitRequestSummary({ lead, dark = true, compact = false }: Props) {
  const s = summariseUnitRequest(lead)
  const text = dark ? '#F8FAFC' : '#0F172A'
  const text2 = dark ? 'rgba(248,250,252,0.75)' : 'rgba(15,23,42,0.72)'
  const text3 = dark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.6)'
  const border = dark ? 'rgba(248,250,252,0.1)' : 'rgba(15,23,42,0.16)'

  if (compact) {
    if (!s.recorded && !s.purposeLabel) return null
    return (
      <div style={{ fontSize: '0.72rem', color: text2, marginTop: 3 }}>
        {s.recorded ? <><strong style={{ color: text }}>{s.unitLabel}</strong> · {s.priceLine} (recorded at request)</> : s.unitLabel}
        {s.purposeLabel ? ` · ${s.purposeLabel}` : ''}
      </div>
    )
  }

  if (!s.recorded && !s.purposeLabel && !s.routingLabel && !s.note) return null
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: '0.7rem', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: text3, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        <Building2 size={13} /> Unit requested
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4, color: text }}>{s.unitLabel}</div>
      {s.recorded && (
        <>
          <div style={{ fontSize: 13, color: text, marginTop: 2 }}>{s.priceLine}</div>
          <div style={{ fontSize: 11.5, color: text3, marginTop: 2 }}>{s.priceNote}</div>
          <div style={{ fontSize: 11.5, color: text3 }}>{s.availabilityNote}</div>
        </>
      )}
      {s.purposeLabel && <div style={{ fontSize: 12, color: text2, marginTop: 6 }}>Request: {s.purposeLabel}</div>}
      {s.financingLabel && <div style={{ fontSize: 12, color: text2 }}>Financing type: {s.financingLabel}</div>}
      {s.routingLabel && <div style={{ fontSize: 12, color: text2 }}>{s.routingLabel}</div>}
      {s.snapshotAt && <div style={{ fontSize: 11, color: text3, marginTop: 4 }}>Recorded {new Date(s.snapshotAt).toLocaleString()}. This is a record of the request, not an offer, a price guarantee or financing approval.</div>}
      {s.note && <div style={{ fontSize: 11.5, color: text3, marginTop: 4 }}>{s.note}</div>}
    </div>
  )
}