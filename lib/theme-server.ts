// lib/theme-server.ts
//
// Server Component / Route Handler only — reads the theme cookie that
// lib/theme.ts's setTheme() now writes alongside localStorage, so
// server-rendered pages (Site Discovery, the Site Intelligence
// Profile, the admin Site queue) render in whatever mode the user
// actually chose, instead of a hardcoded `const dark = true`.
//
// Never imported from a 'use client' file — importing next/headers
// there would break the client bundle.

import { cookies } from 'next/headers'
import { THEME_KEY } from './theme'

export async function getServerDark(): Promise<boolean> {
  const saved = (await cookies()).get(THEME_KEY)?.value
  if (saved !== undefined) return saved === 'true'
  return true // same default as getInitialDark() / THEME_SCRIPT
}