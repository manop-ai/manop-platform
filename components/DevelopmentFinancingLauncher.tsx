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
//
// FIX: this used to `return null` outright when the first unit had no
// price_ngn set — on a real development with unpriced units (the "Test"
// development the button was reported missing on), the entire Get
// Financed entry point silently vanished with nothing on the page to
// explain why, which reads as broken rather than "working as designed".
// It now always renders something: a disabled, explained state when
// there's no price to run an assessment against, and the real button
// once there is one. `developerId` is also now nullable — an
// agency-managed development can have a null developer_id (see the
// agency-mandate fallback in app/api/developer-leads/route.ts), and this
// component shouldn't assume a developer account exists.

import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { getDesignColors } from '../lib/theme'
import FinancingModal from './FinancingModal'

interface Props {
  developerId: string | null
  projectId: string
  unitTypeId: string | null
  estimatedPriceNgn: number | null
  developmentName: string
  dark?: boolean
}

export default function DevelopmentFinancingLauncher({
  developerId, projectId, unitTypeId, estimatedPriceNgn, developmentName, dark = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const c = getDesignColors(dark)

  // No priced unit yet — nothing to run an affordability assessment
  // against. Previously this returned null and the button just
  // disappeared; now it stays visible but explains the gap, matching
  // DevelopmentEnquiryModal's own posture of always rendering something.
  if (!estimatedPriceNgn) {
    return (
      <div>
        <button
          disabled
          style={{
            width: '100%', background: c.surfaceCardHigh, color: c.textFaint,
            border: `1px solid ${c.border}`, borderRadius: 10,
            padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 700,
            cursor: 'not-allowed', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <Landmark size={16} /> Get Financed
        </button>
        <div style={{ fontSize: 11, color: c.textFaint, marginTop: 8, lineHeight: 1.5 }}>
          Financing tools need a published unit price. This will become available once the
          developer or submitting agency confirms pricing for this development.
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', background: c.intelligencePurpleBg, color: c.intelligencePurple,
          border: `1px solid ${c.intelligencePurple}40`, borderRadius: 10,
          padding: '0.7rem 1rem', fontSize: '0.85rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <Landmark size={16} /> Get Financed
      </button>

      {open && (
        <FinancingModal
          developerId={developerId || undefined}
          projectId={projectId}
          unitTypeId={unitTypeId}
          propertyAddress={developmentName}
          estimatedPriceNgn={estimatedPriceNgn}
          onClose={() => setOpen(false)}
          dark={dark}
        />
      )}
    </>
  )
}