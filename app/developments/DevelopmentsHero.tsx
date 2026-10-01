'use client'
// app/developments/DevelopmentsHero.tsx
//
// Reuses the shared HeroSearchBlock (same component Site Intelligence's
// DiscoveryHero is built on) — this is the "reuse the pattern, don't
// rebuild from scratch" version. Different hero image on purpose: a
// Lagos Island high-rise, distinct from Site Intelligence's Third
// Mainland Bridge image, so the two discovery surfaces read as related
// but not identical.

import { useRouter } from 'next/navigation'
import { Building2, Users } from 'lucide-react'
import HeroSearchBlock from '../../components/HeroSearchBlock'

const HERO_IMAGE = 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/island_view_jb7cfx'

export default function DevelopmentsHero({ dark }: { dark: boolean }) {
  const router = useRouter()

  function handleSearch(q: string) {
    const val = q.trim()
    const params = new URLSearchParams()
    if (val) params.set('area', val)
    router.push(`/developments${params.toString() ? `?${params.toString()}` : ''}`)
  }

  return (
    <HeroSearchBlock
      dark={dark}
      heroImage={HERO_IMAGE}
      heading="Real developments, independently reviewed."
      subheading="What was checked, what was found, and what still needs verification — never a recommendation. Search any area to see what MANOP has reviewed there."
      placeholder="Search an area — e.g. Lekki Phase 1, Ikoyi, East Legon…"
      onSearch={handleSearch}
      primaryAction={{ label: 'For Developers', icon: <Building2 size={15} />, onClick: () => router.push('/developer/onboard') }}
      secondaryAction={{ label: 'For Agencies & Landowners', icon: <Users size={15} />, onClick: () => router.push('/agency/onboard') }}
    />
  )
}