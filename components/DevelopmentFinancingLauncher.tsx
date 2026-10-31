'use client'
// components/DevelopmentFinancingLauncher.tsx
//
// Self-contained client wrapper for the Get Financed button on /development/[id]
// (that page is a server component, so the open/close state cannot live there).
//
// UNIT SELECTION FIX: this used to receive ONE unit's id and price — the page passed
// units[0] whatever the buyer wanted — so a buyer interested in a 2-bedroom was shown
// and recorded against the first unit's price. It now receives the development's whole
// unit list and FinancingModal makes the buyer choose the unit and the request type.
// Nothing here picks a unit or a price.
//
// The button is available whenever the development has unit types, including units with
// no recorded price: those can still be used to ask MANOP to confirm price and availability.
// It is disabled, with an explanation, only when no unit types are recorded at all.
// `developerId` stays nullable: an agency-managed development may have no developer account.

import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { getDesignColors } from '../lib/theme'
import type { UnitRow } from '../lib/unit-selection'
import FinancingModal from './FinancingModal'

interface Props {
  developerId: string | null
  projectId: string
  units: UnitRow[]
  developmentName: string
  dark?: boolean
}

export default function DevelopmentFinancingLauncher({ developerId, projectId, units, developmentName, dark = true }: Props) {
  const [open, setOpen] = useState(false)
  const c = getDesignColors(dark)

  if (!units || units.length === 0) {
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
          No unit types are recorded for this development yet, so there is nothing to request financing or a price
          confirmation for. Use the enquiry button to ask MANOP directly.
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
          units={units}
          propertyAddress={developmentName}
          onClose={() => setOpen(false)}
          dark={dark}
        />
      )}
    </>
  )
}