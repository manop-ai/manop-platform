/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Headers: CORS + Security (fixes "Can't connect to server" & Safari warnings) ───
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          // CORS headers — allow requests from any origin (global access)
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,X-Partner-Key,Accept' },
          // Security headers
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Strict-Transport-Security (HSTS) — fixes Safari security warnings
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // Content-Security-Policy — allow external resources needed for app
          { key: 'Content-Security-Policy', value: "default-src 'self' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self' https: wss:; frame-ancestors 'self';" },
        ],
      },
    ]
  },

  // ─── Image optimization for external sources ───
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    // Optimize images to reduce load times in Nigeria
    formats: ['image/avif', 'image/webp'],
  },

  // ─── Redirect HTTP to HTTPS (fixes Safari security warnings) ───
  redirects: async () => [
    {
      source: '/:path*',
      destination: 'https://manopintel.com/:path*',
      permanent: true,
      basePath: false,
      has: [{ type: 'header', key: 'x-forwarded-proto', value: 'http' }],
    },
  ],

  // ─── Compression & performance ───
  compress: true,
  swcMinify: true,
  productionBrowserSourceMaps: false, // reduce bundle size
}

module.exports = nextConfig
