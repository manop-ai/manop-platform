// lib/fetch-json.ts
//
// A same-origin fetch that can never leave a button stuck on "Saving…". It always settles: with a
// parsed body, or with a plain-language error (timeout, network failure, or a non-JSON reply such as
// a Next.js error page). Callers show `error` instead of hanging.

// One flat shape (not a union): this project compiles without strictNullChecks, where a boolean-tagged
// union does not narrow. On success `error` is ''; on failure `error` is always a readable message.
export interface FetchJsonResult<T = any> {
  ok: boolean
  status: number
  data: T
  error: string
}

export async function fetchJson<T = any>(
  input: string,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<FetchJsonResult<T>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal })
    const text = await res.text()
    let data: any = null
    if (text) { try { data = JSON.parse(text) } catch { /* not JSON */ } }
    if (!res.ok) {
      const msg = data?.error || (data == null
        ? `The server returned an unexpected response (HTTP ${res.status}). Check the terminal running npm run dev for the error.`
        : `Request failed (HTTP ${res.status}).`)
      return { ok: false, status: res.status, error: msg, data }
    }
    if (data == null) return { ok: false, status: res.status, error: 'The server returned an empty or non-JSON response.', data: null as any }
    return { ok: true, status: res.status, data, error: '' }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      return { ok: false, status: 0, data: null as any, error: `No response from the server after ${Math.round(timeoutMs / 1000)} seconds. Check the terminal running npm run dev.` }
    }
    return { ok: false, status: 0, data: null as any, error: e?.message || 'Network error.' }
  }
}

// Resolve with the fallback if the promise has not settled in time (used for session reads so a stuck
// auth lock surfaces as "sign in again" instead of an endless spinner).
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })
}