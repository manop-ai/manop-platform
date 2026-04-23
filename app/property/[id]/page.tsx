// app/property/[id]/page.tsx
// Server component — fetches property + live FX rate together
// Then delegates rendering to PropertyDetailClient

import { notFound }       from 'next/navigation'
import { createClient }   from '@supabase/supabase-js'
import { getLiveRates }   from '../../../lib/fx'
import PropertyDetailClient from './PropertyDetailClient'

export const revalidate = 3600

async function getProperty(id: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data } = await sb.from('properties').select('*').eq('id', id).single()
  return data
}

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const [property, rates] = await Promise.all([
    getProperty(params.id),
    getLiveRates(),
  ])

  if (!property) notFound()

  const liveNGNRate = rates.NGN
  const priceUSD    = property.price_usd
    ?? (property.price_local ? Math.round(property.price_local / liveNGNRate) : null)

  return (
    <PropertyDetailClient
      property={{ ...property, price_usd: priceUSD }}
      liveNGNRate={liveNGNRate}
      rateSource={rates.source}
      rateFetchedAt={rates.fetchedAt}
    />
  )
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const p = await getProperty(params.id)
  if (!p) return { title: 'Property — Manop' }
  const rates = await getLiveRates()
  const usd   = p.price_local ? Math.round(p.price_local / rates.NGN) : null
  const loc   = p.neighborhood || p.city || 'Lagos'
  const beds  = p.bedrooms ? `${p.bedrooms}-Bed ` : ''
  return {
    title: `${beds}${p.property_type || 'Property'} in ${loc} — Manop`,
    description: `₦${(p.price_local / 1_000_000).toFixed(0)}M${usd ? ` · ≈ $${Math.round(usd / 1000)}K at live rate` : ''} · Intelligence by Manop.`,
  }
}
