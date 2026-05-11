/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── CORS + Security headers ───────────────────────────────
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
          { key: 'Content-Security-Policy',   value: "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https: wss:; frame-ancestors 'self';" },
        ],
      },
    ]
  },

  // ─── Image optimization ────────────────────────────────────
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

  // ─── HTTP → HTTPS redirect ─────────────────────────────────
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

  // ─── Performance ───────────────────────────────────────────
  // NOTE: swcMinify removed — deprecated in Next.js 14 (enabled by default)
  // NOTE: productionBrowserSourceMaps removed — not a valid Next.js option
  compress: true,
}

module.exports = nextConfig