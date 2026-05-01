'use client'

import { useState, useRef } from 'react'

interface ImageUploaderProps {
  onImagesChange: (urls: string[]) => void
  maxImages?: number
  dark?: boolean
  label?: string
  hint?: string
  accept?: string
}

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
const uploadUrl = cloudName ? `https://api.cloudinary.com/v1_1/${cloudName}/upload` : ''

export default function ImageUploader({
  onImagesChange,
  maxImages = 8,
  dark = true,
  label = 'Images',
  hint = 'Upload JPG, PNG, or WebP images',
  accept = 'image/*',
}: ImageUploaderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (!cloudName || !uploadPreset) {
      setError('Cloudinary is not configured. Please set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.')
      return
    }

    const selected = Array.from(files).slice(0, maxImages - urls.length)
    if (selected.length === 0) return

    setError('')
    setLoading(true)
    try {
      const uploadedUrls: string[] = []

      for (const file of selected) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('upload_preset', uploadPreset)

        const resp = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        })

        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`Upload failed: ${resp.status} ${text}`)
        }

        const result = await resp.json()
        if (!result?.secure_url) throw new Error('Upload response missing secure_url')
        uploadedUrls.push(result.secure_url)
      }

      const nextUrls = [...urls, ...uploadedUrls].slice(0, maxImages)
      setUrls(nextUrls)
      onImagesChange(nextUrls)
    } catch (err: any) {
      setError(err?.message || 'Unable to upload images')
    } finally {
      setLoading(false)
    }
  }

  const removeImage = (index: number) => {
    const nextUrls = urls.filter((_, i) => i !== index)
    setUrls(nextUrls)
    onImagesChange(nextUrls)
  }

  return (
    <div style={{ borderRadius: 14, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(248,250,252,0.9)', border: `1px solid ${dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.08)'}`, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: dark ? '#F8FAFC' : '#0F172A', marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 11, color: dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)' }}>{hint}</div>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading || urls.length >= maxImages}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            background: '#5B2EFF',
            border: 'none',
            borderRadius: 10,
            padding: '0.55rem 0.9rem',
            cursor: loading || urls.length >= maxImages ? 'not-allowed' : 'pointer',
          }}
        >
          {urls.length >= maxImages ? 'Limit reached' : loading ? 'Uploading…' : 'Upload'}
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {error && (
        <div style={{ marginBottom: 10, color: '#EF4444', fontSize: 12, lineHeight: 1.5 }}>
          {error}
        </div>
      )}

      {urls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 10 }}>
          {urls.map((url, index) => (
            <div key={url} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#111827' }}>
              <img src={url} alt={`Upload ${index + 1}`} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
              <button
                type="button"
                onClick={() => removeImage(index)}
                style={{
                  position: 'absolute', top: 6, right: 6, width: 22, height: 22,
                  borderRadius: '50%', border: 'none', background: 'rgba(15,23,42,0.85)', color: '#fff', cursor: 'pointer', fontSize: 12,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
