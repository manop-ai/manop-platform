// lib/location-media.ts
//
// Hero imagery for location pages, keyed by location slug (lib/locations.ts).
// EMPTY ON PURPOSE: MANOP has no licensed or owned photography for locations yet, and a
// placeholder or generated image would be worse than none. When an image is licensed or
// shot, add its Cloudinary URL here (https only) and the page picks it up. A location
// without an entry renders as a clean typographic header.

export interface LocationMedia { src: string; alt: string; credit: string }

export const LOCATION_MEDIA: Record<string, LocationMedia> = {
  // 'lagos': { src: 'https://res.cloudinary.com/…/lagos.jpg', alt: 'Description of the photograph', credit: 'Photographer / licence' },
}

export function mediaFor(...slugs: (string | null | undefined)[]): LocationMedia | null {
  for (const s of slugs) if (s && LOCATION_MEDIA[s]) return LOCATION_MEDIA[s]
  return null
}