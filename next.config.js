/** @type {import('next').NextConfig} */

// ============================================================
// MAPBOX CSP FIX — ROOT CAUSE OF INFINITE SPINNER
// ============================================================
// mapbox-gl v3 spawns a Web Worker using a blob: URL internally.
// Without `worker-src blob:` and `child-src blob:` in CSP,
// the browser silently kills the worker. No worker = no tile
// decoding = no map tiles = 'load' event never fires = spinner
// loops forever. This was the only reason the map wasn't loading.
//
// Changes from previous config:
//   connect-src: added blob: *.mapbox.com events.mapbox.com
//   worker-src:  added blob: (new — required for mapbox-gl v3)
//   child-src:   added blob: (fallback for older browsers)
//   img-src:     added data: blob: *.mapbox.com (map tiles are
//                served as images in some render paths)
// ============================================================

const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin',  value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,X-Partner-Key,Accept' },
          { key: 'X-Content-Type-Options',       value: 'nosniff' },
          { key: 'X-Frame-Options',              value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection',             value: '1; mode=block' },
          { key: 'Referrer-Policy',              value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security',    value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options',    value: 'nosniff' },
          { key: 'X-Frame-Options',           value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' https:",

              // Scripts — unsafe-eval needed by mapbox-gl WebGL shader compilation
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: blob:",

              // Styles
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",

              // Fonts
              "font-src 'self' https://fonts.gstatic.com https://api.mapbox.com",

              // Images — blob: and data: needed for mapbox tile rendering
              "img-src 'self' https: data: blob: *.mapbox.com",

              // Connections — blob: and mapbox domains critical for tile fetching
              "connect-src 'self' https: wss: blob: *.mapbox.com events.mapbox.com",

              // Workers — mapbox-gl v3 creates workers via blob: URLs
              // Without this line the map worker is killed silently and the map never loads
              "worker-src blob:",

              // child-src — fallback for browsers that check this instead of worker-src
              "child-src blob:",

              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'propertyproimg.com' },
      { protocol: 'https', hostname: '*.propertyproimg.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async redirects() {
    return [
      {
        source:      '/:path*',
        destination: 'https://manopintel.com/:path*',
        permanent:   true,
        basePath:    false,
        has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
      },
    ]
  },

  compress: true,
}

module.exports = nextConfig