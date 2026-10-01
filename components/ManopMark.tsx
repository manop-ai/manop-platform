// components/ManopMark.tsx
//
// MANOP's own visual language for its proprietary claims — "MANOP
// Review" today, and whatever the redefined trust/intelligence
// hierarchy becomes later. Deliberately NOT a generic checkmark, star,
// or lock icon: those read as "the internet's idea of verified," not
// "MANOP specifically reviewed this." Standard UI actions (search, a
// map pin, a document) still use lucide-react — this component is only
// for MANOP's own claims, and should stay that way. Never use this mark
// decoratively or where MANOP hasn't actually reviewed something.

export function ManopMark({ size = 16, color = '#0D9488' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Outer form — a rounded diamond, not a circle or shield, so it
          doesn't borrow the visual grammar of official/government seals */}
      <path
        d="M10 1L18.5 10L10 19L1.5 10L10 1Z"
        stroke={color} strokeWidth="1.4" strokeLinejoin="round"
        fill={`${color}14`}
      />
      {/* Inner mark — two offset strokes, not a standard checkmark */}
      <path d="M6.3 10.2L9 12.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 12.6L13.8 7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// The tag itself — icon + label + optional date, one consistent unit
// used everywhere MANOP asserts a review happened. Never render the
// bare word "Reviewed" or a checkmark alone for this claim — always
// through this component, so it stays visually and semantically
// consistent as the product grows.
export function ManopReviewTag({ date, size = 'sm' }: { date?: string | null; size?: 'sm' | 'md' }) {
  const fontSize = size === 'md' ? 13 : 11
  const iconSize = size === 'md' ? 16 : 13
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize, fontWeight: 700, color: '#0D9488',
      background: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.28)',
      borderRadius: 20, padding: size === 'md' ? '4px 11px' : '3px 8px',
      textTransform: 'uppercase' as const, letterSpacing: '0.04em', whiteSpace: 'nowrap' as const,
    }}>
      <ManopMark size={iconSize} color="#0D9488" />
      MANOP Review{date ? ` · ${date}` : ''}
    </span>
  )
}