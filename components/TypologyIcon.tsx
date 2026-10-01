// components/TypologyIcon.tsx
//
// Flat-shaded isometric icons for each Development Preset — MANOP's
// own artwork, deliberately not a copy of any other product's icon
// set. Used on the public Site Studio page's typology strip. Only
// 'multifamily_residential' currently has full Studio support
// (starter massing template, category-specific defaults); the
// others render the same way visually but the page must say plainly
// which ones are live today versus planned — this file only draws
// the icon, it doesn't decide what to claim about it.

export type TypologyKind = 'multifamily_residential' | 'single_family_residential' | 'townhouse' | 'mixed_use' | 'commercial'

const PURPLE = '#6D28D9'
const PURPLE_LIGHT = '#8B5CF6'
const PURPLE_DARK = '#4C1D95'
const TEAL = '#0D9488'
const AMBER = '#F59E0B'
const BASE = '#1E293B'

function IsoBase() {
  return <polygon points="60,20 100,40 60,60 20,40" fill={BASE} opacity={0.5} />
}

function IsoBlock({ x, y, w, h, topColor, leftColor, rightColor }: { x: number; y: number; w: number; h: number; topColor: string; leftColor: string; rightColor: string }) {
  // A single extruded rectangular volume drawn in isometric
  // projection: top diamond + two shaded side faces.
  const hw = w / 2
  return (
    <g transform={`translate(${x} ${y})`}>
      <polygon points={`0,${-h} ${hw},${-h + hw / 2} 0,${-h + hw} ${-hw},${-h + hw / 2}`} fill={topColor} />
      <polygon points={`${-hw},${-h + hw / 2} 0,${-h + hw} 0,${hw} ${-hw},0`} fill={leftColor} />
      <polygon points={`${hw},${-h + hw / 2} 0,${-h + hw} 0,${hw} ${hw},0`} fill={rightColor} />
    </g>
  )
}

export default function TypologyIcon({ kind, size = 72 }: { kind: TypologyKind; size?: number }) {
  const body = (() => {
    switch (kind) {
      case 'multifamily_residential':
        return <IsoBlock x={60} y={54} w={40} h={44} topColor={PURPLE_LIGHT} leftColor={PURPLE} rightColor={PURPLE_DARK} />
      case 'single_family_residential':
        return (
          <>
            <IsoBlock x={44} y={50} w={18} h={16} topColor={TEAL} leftColor="#0B7A70" rightColor="#065F58" />
            <IsoBlock x={68} y={52} w={18} h={20} topColor={TEAL} leftColor="#0B7A70" rightColor="#065F58" />
            <IsoBlock x={56} y={56} w={18} h={14} topColor={TEAL} leftColor="#0B7A70" rightColor="#065F58" />
          </>
        )
      case 'townhouse':
        return (
          <>
            <IsoBlock x={46} y={54} w={16} h={30} topColor={AMBER} leftColor="#B45309" rightColor="#78350F" />
            <IsoBlock x={60} y={54} w={16} h={34} topColor={AMBER} leftColor="#B45309" rightColor="#78350F" />
            <IsoBlock x={74} y={54} w={16} h={30} topColor={AMBER} leftColor="#B45309" rightColor="#78350F" />
          </>
        )
      case 'mixed_use':
        return (
          <>
            <IsoBlock x={54} y={56} w={22} h={44} topColor={PURPLE_LIGHT} leftColor={PURPLE} rightColor={PURPLE_DARK} />
            <IsoBlock x={72} y={52} w={20} h={20} topColor={TEAL} leftColor="#0B7A70" rightColor="#065F58" />
          </>
        )
      case 'commercial':
      default:
        return <IsoBlock x={60} y={48} w={44} h={26} topColor="#94A3B8" leftColor="#64748B" rightColor="#475569" />
    }
  })()

  return (
    <svg width={size} height={size} viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
      <IsoBase />
      {body}
    </svg>
  )
}