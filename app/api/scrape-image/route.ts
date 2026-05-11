// app/api/scrape-image/route.ts
// Fetches og:image from a property source URL
// Used by property cards when no image is stored in the DB
// Caches the result back into properties.raw_data to avoid re-fetching
//
// GET /api/scrape-image?url=https://propertypro.ng/property/...&property_id=uuid

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
)

// Cache: URL → image URL (in-memory, resets on server restart)
// In production: use Redis or Supabase KV
const cache = new Map<string, string | null>()

export async function GET(req: NextRequest) {
  const url        = req.nextUrl.searchParams.get('url')
  const propertyId = req.nextUrl.searchParams.get('property_id')

  if (!url) {
    return NextResponse.json({ image: null, error: 'url required' }, { status: 400 })
  }

  // Check in-memory cache first
  if (cache.has(url)) {
    return NextResponse.json({ image: cache.get(url), cached: true })
  }

  try {
    // Fetch the source page HTML
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Zahazi/1.0; +https://zahazi.com)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 86400 }, // cache for 24hr in Next.js
    })

    if (!res.ok) {
      cache.set(url, null)
      return NextResponse.json({ image: null, error: `Source returned ${res.status}` })
    }

    const html = await res.text()

    // Extract og:image — try multiple patterns
    let imageUrl: string | null = null

    const patterns = [
      /og:image[^>]*content="([^"]+)"/i,
      /content="([^"]+)"[^>]*og:image/i,
      /og:image[^>]*content='([^']+)'/i,
      /"og:image"[^>]*content="([^"]+)"/i,
      /twitter:image[^>]*content="([^"]+)"/i,
    ]

    for (const pat of patterns) {
      const match = html.match(pat)
      if (match?.[1] && match[1].startsWith('http')) {
        imageUrl = match[1]
        break
      }
    }

    // Fallback: first large img in the page
    if (!imageUrl) {
      const imgMatch = html.match(/<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"[^>]*(width="[4-9]\d{2,}"|style="[^"]*width:\s*[4-9]\d{2,}")/i)
      if (imgMatch?.[1]) imageUrl = imgMatch[1]
    }

    // Cache the result
    cache.set(url, imageUrl)

    // If we got an image and have a property_id, cache it in the DB
    if (imageUrl && propertyId) {
      try {
        const { data: prop } = await sb.from('properties').select('raw_data').eq('id', propertyId).single()
        if (prop) {
          const rawData = (prop.raw_data || {}) as Record<string, unknown>
          const existingImages = Array.isArray(rawData.images) ? rawData.images as string[] : []
          if (!existingImages.includes(imageUrl)) {
            await sb.from('properties').update({
              raw_data: { ...rawData, images: [imageUrl, ...existingImages] }
            }).eq('id', propertyId)
          }
        }
      } catch { /* non-critical — don't fail the request */ }
    }

    return NextResponse.json({
      image:  imageUrl,
      cached: false,
      source: url,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=172800',
      },
    })

  } catch (err: unknown) {
    cache.set(url, null)
    return NextResponse.json({ image: null, error: String(err) })
  }
}