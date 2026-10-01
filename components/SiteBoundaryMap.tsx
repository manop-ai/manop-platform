'use client'
// components/SiteBoundaryMap.tsx
//
// A minimal Mapbox wrapper for a single site: point + optional
// confirmed boundary polygon. Deliberately NOT built on top of
// ManopMap — that component's pin system carries verdict language
// (buy/negotiate/watch/wait) for property listings, which has no
// place in Site Intelligence. This component only ever shows
// location and, where confirmed, a parcel outline.

import { useEffect, useRef } from 'react'
import { getDesignColors } from '../lib/theme'

export interface SiteBoundaryMapProps {
  lat: number | null
  lng: number | null
  boundary?: GeoJSON.Polygon | null   // confirmed WGS84 polygon, or undefined/null
  height: number
  className?: string
  mapStyle?: 'satellite-streets' | 'satellite' | 'dark' | 'light'
  dark?: boolean
}

const MAP_STYLES: Record<string, string> = {
  'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v12',
  'satellite':         'mapbox://styles/mapbox/satellite-v9',
  'dark':              'mapbox://styles/mapbox/dark-v11',
  'light':             'mapbox://styles/mapbox/light-v11',
}

export default function SiteBoundaryMap({
  lat, lng, boundary, height, className, mapStyle = 'satellite-streets', dark = true,
}: SiteBoundaryMapProps) {
  const c = getDesignColors(dark)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('mapbox-gl').Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || lat == null || lng == null) return
    let cancelled = false

    import('mapbox-gl').then((mapboxgl) => {
      if (cancelled || !containerRef.current) return
      mapboxgl.default.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''

      const map = new mapboxgl.default.Map({
        container: containerRef.current,
        style: MAP_STYLES[mapStyle],
        center: [lng, lat],
        zoom: boundary ? 16 : 14,
        attributionControl: false,
      })
      mapRef.current = map

      map.on('load', () => {
        // Site location marker — plain, no verdict/badge styling
        new mapboxgl.default.Marker({ color: c.intelligencePurple })
          .setLngLat([lng, lat])
          .addTo(map)

        if (boundary) {
          map.addSource('site-boundary', {
            type: 'geojson',
            data: { type: 'Feature', geometry: boundary, properties: {} },
          })
          map.addLayer({
            id: 'site-boundary-fill',
            type: 'fill',
            source: 'site-boundary',
            paint: { 'fill-color': c.verificationTeal, 'fill-opacity': 0.15 },
          })
          map.addLayer({
            id: 'site-boundary-line',
            type: 'line',
            source: 'site-boundary',
            paint: { 'line-color': c.verificationTeal, 'line-width': 2 },
          })

          const coords = boundary.coordinates[0]
          const bounds = coords.reduce(
            (b, coord) => b.extend(coord as [number, number]),
            new mapboxgl.default.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
          )
          map.fitBounds(bounds, { padding: 40, maxZoom: 18 })
        }
      })

      map.addControl(new mapboxgl.default.NavigationControl({ showCompass: false }), 'top-right')
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, boundary, mapStyle])

  if (lat == null || lng == null) {
    return (
      <div
        className={className}
        style={{
          height, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: c.surfaceCardHigh, borderRadius: 4, color: c.textMuted, fontSize: 13,
        }}
      >
        Coordinates unavailable
      </div>
    )
  }

  return <div ref={containerRef} className={className} style={{ height, borderRadius: 4, overflow: 'hidden' }} />
}