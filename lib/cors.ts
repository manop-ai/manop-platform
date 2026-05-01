// lib/cors.ts — CORS helper for API routes
// Fixes "Can't connect to server" errors for users in different regions

import { NextRequest, NextResponse } from 'next/server'

export function addCORSHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Partner-Key,Accept')
  response.headers.set('Access-Control-Max-Age', '3600')
  return response
}

export function handleCORSPreflight() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Partner-Key,Accept',
      'Access-Control-Max-Age': '3600',
    },
  })
}
