'use client'
// components/SitesOverviewMap.tsx
//
// Multi-marker map for Site Discovery's map-view toggle. Separate
// from SiteBoundaryMap (single site + polygon, used on Review) and
// from ManopMap (property listings with buy/negotiate/watch/wait
// verdict pins — not reused here for the same reason noted elsewhere:
// that verdict language doesn't belong in Site Intelligence).
//
// Markers are plain and uniform — no status-based coloring that could
// read as a ranking or recommendation. Clicking a marker navigates to
// that site's Review page.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export interface SiteMapMarker {
  id: string
  lat: number
  lng: number
  label: string
}

export default function SitesOverviewMap({
  markers, height, linkPrefix = '/site-intelligence',
}: { markers: SiteMapMarker[]; height: number; linkPrefix?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let map: import('mapbox-gl').Map | null = null

    import('mapbox-gl').then((mapboxgl) => {
      if (cancelled || !containerRef.current) return
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

      const withCoords = markers.filter((m) => m.lat != null && m.lng != null)
      const center: [number, number] = withCoords.length > 0
        ? [withCoords[0].lng, withCoords[0].lat]
        : [3.3792, 6.5244] // Lagos, as a sensible default when nothing has coordinates yet

      map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center,
        zoom: withCoords.length > 0 ? 11 : 9,
        attributionControl: false,
      })

      map.on('load', () => {
        if (!map) return
        const bounds = new mapboxgl.default.LngLatBounds()

        withCoords.forEach((m) => {
          const el = document.createElement('div')
          el.style.width = '14px'
          el.style.height = '14px'
          el.style.borderRadius = '50%'
          el.style.background = '#6D28D9'
          el.style.border = '2px solid rgba(255,255,255,0.8)'
          el.style.cursor = 'pointer'
          el.addEventListener('click', () => router.push(`${linkPrefix}/${m.id}`))

          new mapboxgl.default.Marker({ element: el })
            .setLngLat([m.lng, m.lat])
            .setPopup(new mapboxgl.default.Popup({ offset: 12 }).setText(m.label))
            .addTo(map!)

          bounds.extend([m.lng, m.lat])
        })

        if (withCoords.length > 1) map.fitBounds(bounds, { padding: 50, maxZoom: 14 })
      })

      map.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'top-right')
    })

    return () => {
      cancelled = true
      map?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers])

  return <div ref={containerRef} style={{ height, borderRadius: 4, overflow: 'hidden' }} />
}