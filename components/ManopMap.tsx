'use client'
// components/ManopMap.tsx
//
// ROOT CAUSE OF INFINITE SPINNER — now permanently fixed:
//
// The CSP header in next.config.js was missing:
//   worker-src blob;   ← mapbox-gl v3 creates its worker via blob: URL
//   child-src blob:    ← fallback for older browsers
//   connect-src blob:  ← tile fetch path
//
// The browser silently killed the Mapbox Web Worker.
// No worker = no tile decoding = 'load' event never fires = spinner loops.
// Fix is in next.config.js. This file adds a 15s timeout as a safety net
// so the spinner NEVER loops forever regardless of what blocks the map.
//
// Additional guard: initialised.current never resets in cleanup,
// preventing React StrictMode double-init race.

import { useEffect, useRef, useState } from 'react'

export interface PropertyPin {
  id:            string
  lng:           number
  lat:           number
  price:         string
  yield?:        string
  verdict?:      'buy' | 'negotiate' | 'watch' | 'wait' | null
  badge?:        'listed' | 'verified' | 'trust' | 'elite' | null
  beds?:         number
  neighborhood?: string
  propertyType?: string
  onClick?:      (id: string) => void
}

interface ManopMapProps {
  center?:       [number, number]
  zoom?:         number
  pins?:         PropertyPin[]
  mapStyle?:     'satellite-streets' | 'satellite' | 'dark' | 'light'
  height:        number
  className?:    string
  showControls?: boolean
}

const MAP_STYLES: Record<string, string> = {
  'satellite-streets': 'mapbox://styles/mapbox/satellite-streets-v12',
  'satellite':         'mapbox://styles/mapbox/satellite-v9',
  'dark':              'mapbox://styles/mapbox/dark-v11',
  'light':             'mapbox://styles/mapbox/light-v11',
}

const VERDICT_BG: Record<string, string> = {
  buy: '#22C55E', negotiate: '#F59E0B', watch: '#14B8A6',
  wait: '#94A3B8', default: '#5B2EFF',
}
const BADGE_BORDER: Record<string, string> = {
  elite: '#F59E0B', trust: '#14B8A6', verified: '#60A5FA',
  listed: 'rgba(255,255,255,0.5)', default: 'rgba(255,255,255,0.5)',
}
const VERDICT_LABEL: Record<string, string> = {
  buy: '✓ BUY', negotiate: '⟳ NEGOTIATE', watch: '◉ WATCH', wait: '— WAIT',
}

export default function ManopMap({
  center       = [3.3792, 6.5244],
  zoom         = 13,
  pins         = [],
  mapStyle     = 'satellite-streets',
  height,
  className    = '',
  showControls = true,
}: ManopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const markersRef   = useRef<any[]>([])
  const popupRef     = useRef<any>(null)
  const initialised  = useRef(false)
  const [loaded,      setLoaded]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [activeStyle, setActiveStyle] = useState(mapStyle)

  useEffect(() => {
    if (initialised.current || !containerRef.current) return
    initialised.current = true

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      const msg = 'NEXT_PUBLIC_MAPBOX_TOKEN missing — add it to .env.local (free token at mapbox.com/account)'
      console.error('[ManopMap]', msg)
      setError(msg)
      return
    }

    console.log('[ManopMap] Init — token:', token.slice(0, 14) + '…')

    // Safety timeout — if 'load' hasn't fired in 15s something is blocking it
    // Most likely cause: CSP blocking the worker or tiles
    const loadTimeout = setTimeout(() => {
      if (!loaded) {
        const msg = 'Map timed out loading (15s). Check browser console for CSP errors or verify NEXT_PUBLIC_MAPBOX_TOKEN is valid.'
        console.error('[ManopMap] TIMEOUT —', msg)
        console.error('[ManopMap] Check: Application tab → Frames → top → Content-Security-Policy')
        console.error('[ManopMap] Mapbox GL v3 requires worker-src blob: and connect-src blob: in CSP')
        setError(msg)
      }
    }, 15_000)

    import('mapbox-gl')
      .then(({ default: mapboxgl }) => {
        if (!containerRef.current || mapRef.current) {
          console.warn('[ManopMap] Skipping — container gone or already mounted')
          clearTimeout(loadTimeout)
          return
        }

        mapboxgl.accessToken = token

        const map = new mapboxgl.Map({
          container:          containerRef.current,
          style:              MAP_STYLES[mapStyle] || MAP_STYLES['satellite-streets'],
          center:             center as [number, number],
          zoom,
          attributionControl: false,
          logoPosition:       'bottom-right',
          trackResize:        true,
        })

        if (showControls) {
          map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
          map.addControl(new mapboxgl.ScaleControl({ maxWidth: 80, unit: 'metric' }), 'bottom-right')
        }
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

        map.on('load', () => {
          console.log('[ManopMap] ✓ Map loaded')
          clearTimeout(loadTimeout)
          map.resize()
          setLoaded(true)
        })

        map.on('click', () => {
          if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }
        })

        map.on('error', (e: any) => {
          const msg = e?.error?.message || String(e)
          if (!msg.includes('404') && !msg.includes('tile') && !msg.includes('source')) {
            console.error('[ManopMap] Error:', msg)
          }
        })

        mapRef.current = map
        console.log('[ManopMap] Instance created — waiting for load event')
      })
      .catch(err => {
        clearTimeout(loadTimeout)
        console.error('[ManopMap] Failed to import mapbox-gl:', err)
        setError(`Failed to load map library: ${err.message}`)
      })

    return () => {
      clearTimeout(loadTimeout)
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      // intentionally NOT resetting initialised.current — prevents StrictMode double-init
    }
  }, []) // eslint-disable-line

  // Fly when center/zoom changes (filter change)
  useEffect(() => {
    if (!mapRef.current || !loaded) return
    mapRef.current.flyTo({ center, zoom, duration: 900, essential: true })
  }, [center[0], center[1], zoom, loaded]) // eslint-disable-line

  // Re-render pins when list changes
  useEffect(() => {
    if (!loaded || !mapRef.current) return

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current = []
      if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }

      pins.forEach(pin => {
        const bg     = VERDICT_BG[pin.verdict || 'default']
        const border = BADGE_BORDER[pin.badge  || 'default']

        const el = document.createElement('div')
        el.style.cssText = [
          'display:flex;align-items:center;gap:4px',
          `background:${bg}`,
          `border:2px solid ${border}`,
          'border-radius:20px;padding:3px 8px 3px 5px',
          'cursor:pointer',
          'box-shadow:0 2px 10px rgba(0,0,0,0.5)',
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
          'white-space:nowrap;user-select:none',
          'transition:transform 0.12s,box-shadow 0.12s',
          'z-index:1',
        ].join(';')

        if (pin.beds) {
          const dot = document.createElement('div')
          dot.style.cssText = 'width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0'
          dot.textContent = String(pin.beds)
          el.appendChild(dot)
        }

        const lbl = document.createElement('span')
        lbl.style.cssText = 'font-size:11px;font-weight:700;color:#fff;letter-spacing:-0.01em'
        lbl.textContent = pin.price
        el.appendChild(lbl)

        if (pin.yield) {
          const y = document.createElement('span')
          y.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.75);margin-left:2px'
          y.textContent = pin.yield
          el.appendChild(y)
        }

        el.addEventListener('mouseenter', () => {
          el.style.transform = 'scale(1.12) translateY(-2px)'
          el.style.boxShadow = '0 6px 18px rgba(0,0,0,0.65)'
          el.style.zIndex    = '10'
        })
        el.addEventListener('mouseleave', () => {
          el.style.transform = 'none'
          el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)'
          el.style.zIndex    = '1'
        })

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          if (popupRef.current) { popupRef.current.remove(); popupRef.current = null }

          const verdict  = pin.verdict ? (VERDICT_LABEL[pin.verdict] || '') : ''
          const badgeTxt = pin.badge && pin.badge !== 'listed' ? pin.badge.toUpperCase() : ''

          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0F172A;border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:10px 12px;min-width:190px;box-shadow:0 8px 24px rgba(0,0,0,0.7);color:#F8FAFC;">
              ${verdict ? `<div style="display:inline-block;background:${bg};color:#fff;font-size:9px;font-weight:800;letter-spacing:0.1em;border-radius:4px;padding:2px 6px;margin-bottom:6px;">${verdict}</div>` : ''}
              <div style="font-size:16px;font-weight:800;color:#C4B5FD;letter-spacing:-0.03em;margin-bottom:2px;">${pin.price}</div>
              <div style="font-size:11px;color:rgba(248,250,252,0.55);margin-bottom:6px;line-height:1.4;">
                ${pin.beds ? `${pin.beds}-bed ` : ''}${pin.propertyType || 'Property'}
                ${pin.neighborhood ? `<br/>📍 ${pin.neighborhood}` : ''}
              </div>
              ${pin.yield ? `<div style="font-size:10px;color:#22C55E;font-weight:600;margin-bottom:6px;">~${pin.yield} est. yield</div>` : ''}
              ${badgeTxt ? `<div style="display:inline-block;font-size:8px;font-weight:700;border-radius:20px;padding:1px 7px;border:1px solid ${border};color:${border};margin-bottom:6px;">◈ ${badgeTxt}</div>` : ''}
              <div id="manop-view-${pin.id}" style="background:rgba(91,46,255,0.2);border:1px solid rgba(91,46,255,0.4);border-radius:5px;padding:4px 8px;font-size:10px;font-weight:700;color:#A78BFA;cursor:pointer;text-align:center;margin-top:4px;">View property →</div>
            </div>
          `

          const popup = new mapboxgl.Popup({
            closeButton: true, closeOnClick: false,
            maxWidth: '240px', offset: [0, -12], className: 'manop-popup',
          }).setLngLat([pin.lng, pin.lat]).setHTML(html).addTo(mapRef.current)

          popupRef.current = popup

          setTimeout(() => {
            const btn = document.getElementById(`manop-view-${pin.id}`)
            if (btn && pin.onClick) {
              btn.addEventListener('click', () => {
                pin.onClick!(pin.id)
                popupRef.current?.remove()
                popupRef.current = null
              })
            }
          }, 80)
        })

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pin.lng, pin.lat])
          .addTo(mapRef.current)
        markersRef.current.push(marker)
      })

      console.log(`[ManopMap] ${pins.length} pins rendered`)
    })
  }, [loaded, pins]) // eslint-disable-line

  // Style toggle
  function switchStyle(s: string) {
    if (!mapRef.current) return
    setActiveStyle(s as any)
    mapRef.current.setStyle(MAP_STYLES[s])
  }

  // ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.resize() })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  if (error) return (
    <div style={{ height, borderRadius: 12, background: '#0A0F1E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '1.5rem' }}>
      <span style={{ fontSize: '1.5rem' }}>🗺️</span>
      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 300, lineHeight: 1.65 }}>
        {error}
      </span>
      <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 1.5 }}>
        Check browser console (F12) for details
      </span>
    </div>
  )

  return (
    <>
      <style>{`
        .manop-popup .mapboxgl-popup-content{background:transparent!important;padding:0!important;box-shadow:none!important;border-radius:10px!important}
        .manop-popup .mapboxgl-popup-tip{border-top-color:#0F172A!important}
        .manop-popup .mapboxgl-popup-close-button{color:rgba(255,255,255,0.5)!important;font-size:16px!important;top:6px!important;right:8px!important;background:none!important}
        .manop-popup .mapboxgl-popup-close-button:hover{color:#fff!important}
        @keyframes mmSpin{to{transform:rotate(360deg)}}
      `}</style>

      <div className={className} style={{ position: 'relative', height, borderRadius: 12, overflow: 'hidden' }}>

        {!loaded && !error && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'linear-gradient(135deg,#0A0F1E,#111827)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, border: '3px solid rgba(91,46,255,0.2)', borderTopColor: '#5B2EFF', borderRadius: '50%', animation: 'mmSpin 0.75s linear infinite' }} />
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)' }}>Loading map…</span>
          </div>
        )}

        {loaded && pins.length > 0 && (
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, background: 'rgba(10,15,30,0.82)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '4px 12px', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)', pointerEvents: 'none' }}>
            {pins.length} propert{pins.length === 1 ? 'y' : 'ies'}
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {loaded && (
          <div style={{ position: 'absolute', bottom: 36, right: 10, zIndex: 2, display: 'flex', gap: 3 }}>
            {[{ label: '🛰 Satellite', val: 'satellite-streets' }, { label: '🗺 Streets', val: 'dark' }].map(s => (
              <button key={s.val} onClick={() => switchStyle(s.val)}
                style={{ fontSize: '0.62rem', fontWeight: 600, padding: '4px 8px', borderRadius: 7, background: activeStyle === s.val ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.75)', color: activeStyle === s.val ? '#0F172A' : 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', backdropFilter: 'blur(4px)', fontFamily: 'inherit' }}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}