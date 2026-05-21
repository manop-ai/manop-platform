// lib/useAuth.ts — SPRINT 1
// Shared session guard for all protected pages.
//
// ROOT CAUSE OF OLD DASHBOARDS:
// Agency and developer dashboards checked localStorage for custom tokens.
// Race condition between localStorage read and session validation → auth loop.
//
// NEW SYSTEM:
// Single hook. Calls sb.auth.getSession(). If null → redirect to /login.
// No localStorage tokens. No custom session tables.
// This runs on every protected page load.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, User } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
)

interface AuthState {
  user:     User | null
  role:     string | null
  checking: boolean
}

export function useAuth(requiredRole?: string): AuthState {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user:     null,
    role:     null,
    checking: true,
  })

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const { data: { session } } = await sb.auth.getSession()

      if (!mounted) return

      if (!session?.user) {
        // No session — redirect to login
        router.replace('/login')
        return
      }

      const role = session.user.user_metadata?.user_role || 'buyer'

      // Optional: enforce role — wrong role redirects to correct dashboard
      if (requiredRole && role !== requiredRole && role !== 'admin') {
        const ROLE_ROUTES: Record<string, string> = {
          buyer:     '/search',
          diaspora:  '/search',
          agency:    '/agency/dashboard',
          developer: '/developer/dashboard',
          admin:     '/admin',
        }
        router.replace(ROLE_ROUTES[role] || '/search')
        return
      }

      setState({ user: session.user, role, checking: false })
    }

    checkSession()

    // Subscribe to auth state changes (token refresh, sign out)
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/login')
        return
      }
      if (event === 'TOKEN_REFRESHED' && session) {
        setState(prev => ({ ...prev, user: session.user }))
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router, requiredRole])

  return state
}

// Convenience: get the supabase client (shared, anon key)
export { sb }