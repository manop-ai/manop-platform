'use client'
// app/site-intelligence/DiscoveryHero.tsx
//
// Reuses components/HeroSearchBlock.tsx (already built, not yet used
// anywhere) and the same real Cloudinary asset already live on the
// homepage — no new or fabricated image. Per the "images work better
// than writeups" note: this replaces what was a plain text heading
// with the same big-image, search-on-top pattern the homepage uses,
// so Discovery feels like part of the same product, not a bolt-on
// admin-tool-looking page.

import { useRouter } from 'next/navigation'
import HeroSearchBlock from '../../components/HeroSearchBlock'

// Same named Cloudinary asset the homepage hero uses (Third Mainland
// Bridge, Lagos) — one consistent brand image, not a second one to
// maintain. If a Site-Intelligence-specific image is wanted later,
// swap this constant only.
const HERO_IMAGE = 'https://res.cloudinary.com/dkmb8uazj/image/upload/f_auto,q_auto,w_2000,c_fill/third_mainland_bridge_hsrqwb'

export default function DiscoveryHero({ dark, initialCity }: { dark: boolean; initialCity?: string }) {
  const router = useRouter()

  return (
    <HeroSearchBlock
      dark={dark}
      heroImage={HERO_IMAGE}
      heading="Site Intelligence"
      subheading="Structured evidence on land and development opportunities — what's known, what isn't, and what needs investigating before you commit resources."
      placeholder="Search by city or neighborhood…"
      onSearch={(query) => router.push(`/site-intelligence?city=${encodeURIComponent(query)}`)}
      primaryAction={{ label: 'Submit a Site', onClick: () => router.push('/site-intelligence/submit') }}
      secondaryAction={{ label: 'Run a Quick Review', onClick: () => router.push('/site-intelligence/quick-review') }}
    />
  )
}