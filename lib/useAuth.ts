// lib/useAuth.ts — UPDATED
// Added association role support.
// Now checks association_user_roles table in addition to user_metadata.
// All other logic identical to original.

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
  // New: association context
  associationId:   string | null
  associationRole: string | null
}

const ROLE_ROUTES: Record<string, string> = {
  buyer:                      '/search',
  diaspora:                   '/search',
  investor:                   '/investor/dashboard',
  agency:                     '/agency/dashboard',
  developer:                  '/developer/dashboard',
  admin:                      '/admin',
  association_national_admin: '/association/dashboard',
  chapter_admin:              '/association/dashboard',
  super_admin:                '/admin',
  country_admin:              '/association/dashboard',
  analyst:                    '/association/dashboard',
}

export function useAuth(requiredRole?: string): AuthState {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user:            null,
    role:            null,
    checking:        true,
    associationId:   null,
    associationRole: null,
  })

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const { data: { session } } = await sb.auth.getSession()

      if (!mounted) return

      if (!session?.user) {
        router.replace('/login')
        return
      }

      const metaRole = session.user.user_metadata?.user_role || 'buyer'

      // Check association roles — these take priority
      const { data: assocRole } = await sb
        .from('association_user_roles')
        .select('role, association_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .in('role', [
          'super_admin', 'country_admin',
          'association_national_admin', 'chapter_admin', 'analyst',
        ])
        .maybeSingle()

      const resolvedRole = assocRole?.role ?? metaRole

      // Wrong role for this page → redirect
      if (requiredRole && resolvedRole !== requiredRole && resolvedRole !== 'admin' && resolvedRole !== 'super_admin') {
        router.replace(ROLE_ROUTES[resolvedRole] || '/search')
        return
      }

      if (mounted) {
        setState({
          user:            session.user,
          role:            resolvedRole,
          checking:        false,
          associationId:   assocRole?.association_id ?? null,
          associationRole: assocRole?.role ?? null,
        })
      }
    }

    checkSession()

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
export function useSupabase() {
  return sb
}