// lib/supabase/safe-lock.ts
//
// supabase-js serialises every auth read/write behind a browser lock (navigator.locks). If one holder
// never lets go (a hot-reload orphan, a callback that awaited a supabase call inside onAuthStateChange,
// a second tab), every later auth call, including the getSession() inside every sb.from(...) query,
// waits forever, which looks like an endless spinner or a "Saving…" button that never finishes.
//
// This wrapper keeps the cross-tab lock but refuses to wait forever: if the lock is not granted within
// waitMs it runs the operation unlocked instead. The worst case is two tabs refreshing a token at the
// same moment, which Supabase tolerates; the alternative is a frozen app.

export interface LockManagerLike {
  request(name: string, options: { signal?: AbortSignal }, cb: () => Promise<any>): Promise<any>
}

export type AuthLock = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>

export function makeSafeLock(getLocks: () => LockManagerLike | undefined, waitMs = 4000): AuthLock {
  return async function safeLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    const locks = getLocks()
    if (!locks) return fn()
    const ctrl = new AbortController()
    let started = false
    const timer = setTimeout(() => ctrl.abort(), waitMs)
    try {
      return await locks.request(name, { signal: ctrl.signal }, async () => {
        started = true
        clearTimeout(timer)
        return fn()
      })
    } catch (e: any) {
      // Only a failure to GET the lock falls through; an error from the operation itself is rethrown.
      if (!started && e?.name === 'AbortError') return fn()
      throw e
    } finally {
      clearTimeout(timer)
    }
  }
}

export const browserSafeLock: AuthLock = makeSafeLock(
  () => (typeof navigator !== 'undefined' ? (navigator as any).locks : undefined),
)