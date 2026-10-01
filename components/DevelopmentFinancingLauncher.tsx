'use client'
// components/DevelopmentFinancingLauncher.tsx
//
// FinancingModal expects an external trigger + open/close state (see
// PropertyDetailClient.tsx's `showFinancing` pattern) — it doesn't manage
// its own button the way DevelopmentEnquiryModal does. app/development/[id]
// is a server component, so that state can't live there directly without
// turning the whole page client-side (losing the force-dynamic/notFound
// behavior its own comments are explicit about needing). This is the
// smallest fix: a self-contained client wrapper, mounted next to
// DevelopmentEnquiryModal in the sidebar, that owns the button and the
// open/close state and renders FinancingModal with the Reviewed
// Development's own identifiers — not a resale propertyId.

import { useState } from 'react'
import { Landmark } from 'lucide-react'
import FinancingModal from './FinancingModal'

interface Props {
  developerId: string
  projectId: string
  unitTypeId: string | null
  estimatedPriceNgn: number | null
  developmentName: string
}

export default function DevelopmentFinancingLauncher({
  developerId, projectId, unitTypeId, estimatedPriceNgn, developmentName,
}: Props) {
  const [open, setOpen] = useState(false)

  // No priced unit yet — nothing to run an affordability assessment
  // against. Match DevelopmentEnquiryModal's own posture (it still
  // renders regardless of price) rather than hiding the entry point;
  // just don't offer a broken calculation.
  if (!estimatedPriceNgn) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', background: 'rgba(91,46,255,0.08)', color: '#7C5FFF',
          border: '1px solid rgba(91,46,255,0.25)', borderRadius: 10,
          padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <Landmark size={16} /> Get Financed
      </button>

      {open && (
        <FinancingModal
          developerId={developerId}
          projectId={projectId}
          unitTypeId={unitTypeId}
          propertyAddress={developmentName}
          estimatedPriceNgn={estimatedPriceNgn}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}