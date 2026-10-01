'use client'
// components/VerifiedBadge.tsx
//
// One shared badge for "verified" anywhere it appears — agencies
// (data_partners.verification_status / verified), developers
// (developer_accounts.verified), or anything else with the same
// concept later. Nothing in the schema changes; this only standardizes
// how verified status is DISPLAYED, since right now every page that
// shows it (developer dashboard header, admin lists, etc.) invents its
// own little green pill independently, with slightly different colors
// and wording each time.
//
// Deliberately does NOT claim more than MANOP actually verifies —
// no "guaranteed", no shield/lock icons implying legal/financial
// certainty. Matches the existing MAPE philosophy: a badge means MANOP
// reviewed specific submitted information within a stated scope, not
// a blanket endorsement.

interface VerifiedBadgeProps {
  verified: boolean
  label?: string       // defaults to "Verified"
  size?: 'sm' | 'md'
  dark?: boolean
}

export default function VerifiedBadge({ verified, label = 'Verified', size = 'md', dark = true }: VerifiedBadgeProps) {
  if (!verified) return null

  const isSmall = size === 'sm'

  return (
    <span
      title="MANOP has reviewed this account's submitted identity information"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: isSmall ? '0.62rem' : '0.7rem',
        fontWeight: 700,
        color: '#fff',
        background: '#1D9BF0',
        borderRadius: 20,
        padding: isSmall ? '1px 7px' : '2px 9px',
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
      }}
    >
      <svg width={isSmall ? 10 : 12} height={isSmall ? 10 : 12} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2l2.36 2.18 3.2-.42.99 3.11 2.9 1.5-.9 3.2.9 3.2-2.9 1.5-.99 3.11-3.2-.42L12 22l-2.36-2.18-3.2.42-.99-3.11-2.9-1.5.9-3.2-.9-3.2 2.9-1.5.99-3.11 3.2.42L12 2z"
          fill="#1D9BF0"
        />
        <path d="M9 12.5l2 2 4-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  )
}