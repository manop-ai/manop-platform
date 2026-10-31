// lib/mandate-letter-server.ts
//
// Server-only Cloudinary operations for mandate letters. Files live in AUTHENTICATED delivery: a plain Cloudinary URL for them does not
// work, and every open goes through a short-lived signed download created here AFTER the caller has been authorised.
// Credentials (CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) exist only on the server. `fetchImpl` is injectable so the logic is unit-tested
// without the network; NONE of this has been exercised against a live Cloudinary account yet (see the delivery notes).

import { signCloudinaryParams, privateDownloadUrl } from './documents-access'
import { sameKind, sniffType, MAX_BYTES } from './mandate-letter'

export interface CloudCfg { cloud: string; apiKey: string; apiSecret: string }
type Fetch = typeof fetch

export function cloudConfig(env: Record<string, string | undefined> = process.env): CloudCfg | null {
  const cloud = env.CLOUDINARY_CLOUD_NAME || env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const apiKey = env.CLOUDINARY_API_KEY, apiSecret = env.CLOUDINARY_API_SECRET
  return cloud && apiKey && apiSecret ? { cloud, apiKey, apiSecret } : null
}

/** Parameters the browser needs to upload ONE file straight to Cloudinary, as authenticated (non-public) delivery. */
export function signedUploadFor(cfg: CloudCfg, publicId: string, now: number = Date.now()) {
  const timestamp = Math.floor(now / 1000)
  const params = { public_id: publicId, timestamp, type: 'authenticated', overwrite: 'false' }
  const signature = signCloudinaryParams(params, cfg.apiSecret)
  return { uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloud}/raw/upload`, fields: { ...params, overwrite: 'false', api_key: cfg.apiKey, signature }, expiresInSeconds: 3600 }
}

const basic = (cfg: CloudCfg) => 'Basic ' + Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')

/** Read at most `n` bytes of a response body, then stop downloading. */
export async function readHead(res: Response, n = 16): Promise<Uint8Array> {
  const reader = res.body?.getReader?.()
  if (!reader) return new Uint8Array((await res.arrayBuffer()).slice(0, n))
  const out = new Uint8Array(n); let got = 0
  while (got < n) {
    const { done, value } = await reader.read(); if (done || !value) break
    const take = Math.min(value.length, n - got); out.set(value.subarray(0, take), got); got += take
  }
  try { await reader.cancel() } catch { /* already closed */ }
  return out.subarray(0, got)
}

export async function deleteAsset(cfg: CloudCfg, publicId: string, f: Fetch = fetch): Promise<boolean> {
  try {
    const url = `https://api.cloudinary.com/v1_1/${cfg.cloud}/resources/raw/authenticated?public_ids[]=${encodeURIComponent(publicId)}&invalidate=true`
    const r = await f(url, { method: 'DELETE', headers: { Authorization: basic(cfg) } })
    return r.ok
  } catch { return false }
}

export type VerifyResult = { ok: true; bytes: number; format: 'pdf' | 'jpg' | 'png' } | { ok: false; error: string }

/**
 * After the browser says "uploaded": ask Cloudinary what is actually stored (size, delivery type), then read the first bytes of the file
 * and check they match the declared kind. Anything that fails is DELETED from Cloudinary so a rejected file does not linger.
 */
export async function verifyUploadedAsset(cfg: CloudCfg, a: { publicId: string; declaredExt: string }, f: Fetch = fetch): Promise<VerifyResult> {
  let meta: any
  try {
    const r = await f(`https://api.cloudinary.com/v1_1/${cfg.cloud}/resources/raw/authenticated/${a.publicId.split('/').map(encodeURIComponent).join('/')}`, { headers: { Authorization: basic(cfg) } })
    if (!r.ok) return { ok: false, error: 'The uploaded file could not be found. Please upload it again.' }
    meta = await r.json()
  } catch { return { ok: false, error: 'We could not confirm the upload. Please try again.' } }

  if (meta?.type !== 'authenticated') { await deleteAsset(cfg, a.publicId, f); return { ok: false, error: 'The file was not stored privately and has been removed. Please try again.' } }
  const bytes = Number(meta?.bytes)
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) { await deleteAsset(cfg, a.publicId, f); return { ok: false, error: 'The file is empty or larger than the 10 MB limit.' } }

  try {
    const dl = privateDownloadUrl({ cloud: cfg.cloud, resourceType: 'raw', deliveryType: 'authenticated', version: null, publicId: a.publicId, format: null }, { apiKey: cfg.apiKey, apiSecret: cfg.apiSecret }, { ttlSeconds: 120 })
    const r = await f(dl.url)
    if (!r.ok) return { ok: false, error: 'We could not read the uploaded file to check it. Please try again.' }
    const kind = sniffType(await readHead(r))
    if (!sameKind(a.declaredExt, kind)) { await deleteAsset(cfg, a.publicId, f); return { ok: false, error: 'The file contents do not match a PDF, JPG or PNG. It has been removed.' } }
    return { ok: true, bytes, format: kind as 'pdf' | 'jpg' | 'png' }
  } catch { return { ok: false, error: 'We could not check the uploaded file. Please try again.' } }
}

/** Short-lived signed link, created only after authorisation. Public viewers get the shortest life. */
export function openUrlFor(cfg: CloudCfg, publicId: string, via: 'admin' | 'owner' | 'public'): { url: string; expiresInSeconds: number } {
  const ttl = via === 'public' ? 60 : 300
  const s = privateDownloadUrl({ cloud: cfg.cloud, resourceType: 'raw', deliveryType: 'authenticated', version: null, publicId, format: null }, { apiKey: cfg.apiKey, apiSecret: cfg.apiSecret }, { ttlSeconds: ttl })
  return { url: s.url, expiresInSeconds: ttl }
}