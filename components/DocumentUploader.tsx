'use client'
// components/DocumentUploader.tsx
//
// ImageUploader renders every URL as an <img> thumbnail and forces one
// shared type across a whole batch — fine for photo galleries, wrong
// for mandate/title/survey documents, which are usually PDFs and each
// need their own document_type. This is a separate component rather
// than overloading ImageUploader with modes it wasn't designed for.

import { useState, useRef } from 'react'

export interface UploadedDocument {
  url: string
  document_type: string
  document_name: string
}

interface DocumentUploaderProps {
  documents: UploadedDocument[]
  onChange: (docs: UploadedDocument[]) => void
  typeOptions: { value: string; label: string }[]
  defaultType?: string
  maxDocuments?: number
  dark?: boolean
  label?: string
  hint?: string
}

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
const uploadUrl = cloudName ? `https://api.cloudinary.com/v1_1/${cloudName}/upload` : ''

export default function DocumentUploader({
  documents, onChange, typeOptions, defaultType, maxDocuments = 12,
  dark = true, label = 'Documents', hint = 'PDF, JPG, or PNG — add as many as you have',
}: DocumentUploaderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const c = {
    text: dark ? '#F8FAFC' : '#0F172A',
    muted: dark ? 'rgba(248,250,252,0.65)' : 'rgba(15,23,42,0.65)',
    border: dark ? 'rgba(248,250,252,0.12)' : 'rgba(15,23,42,0.08)',
    bg: dark ? 'rgba(255,255,255,0.05)' : 'rgba(248,250,252,0.9)',
    rowBg: dark ? '#111827' : '#F1F5F9',
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (!cloudName || !uploadPreset) {
      setError('Cloudinary is not configured. Please set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.')
      return
    }

    const selected = Array.from(files).slice(0, maxDocuments - documents.length)
    if (selected.length === 0) return

    setError('')
    setLoading(true)
    try {
      const uploaded: UploadedDocument[] = []
      for (const file of selected) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('upload_preset', uploadPreset)

        const resp = await fetch(uploadUrl, { method: 'POST', body: formData })
        if (!resp.ok) throw new Error(`Upload failed: ${resp.status} ${await resp.text()}`)
        const result = await resp.json()
        if (!result?.secure_url) throw new Error('Upload response missing secure_url')

        uploaded.push({
          url: result.secure_url,
          document_type: defaultType || typeOptions[0]?.value || 'other',
          document_name: file.name,
        })
      }
      onChange([...documents, ...uploaded].slice(0, maxDocuments))
    } catch (err: any) {
      setError(err?.message || 'Unable to upload documents')
    } finally {
      setLoading(false)
    }
  }

  const updateType = (index: number, type: string) => {
    const next = [...documents]
    next[index] = { ...next[index], document_type: type }
    onChange(next)
  }

  const remove = (index: number) => onChange(documents.filter((_, i) => i !== index))

  return (
    <div style={{ borderRadius: 14, background: c.bg, border: `1px solid ${c.border}`, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 11, color: c.muted }}>{hint}</div>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading || documents.length >= maxDocuments}
          style={{
            fontSize: 12, fontWeight: 700, color: '#fff', background: '#5B2EFF', border: 'none',
            borderRadius: 10, padding: '0.55rem 0.9rem',
            cursor: loading || documents.length >= maxDocuments ? 'not-allowed' : 'pointer',
          }}
        >
          {documents.length >= maxDocuments ? 'Limit reached' : loading ? 'Uploading…' : 'Add document(s)'}
        </button>
      </div>

      <input
        ref={fileRef} type="file" accept="application/pdf,image/*" multiple
        style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)}
      />

      {error && <div style={{ marginBottom: 10, color: '#EF4444', fontSize: 12, lineHeight: 1.5 }}>{error}</div>}

      {documents.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {documents.map((doc, i) => (
            <div key={doc.url} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: c.rowBg,
              borderRadius: 10, padding: '8px 10px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {doc.document_name}
                </div>
              </div>
              <select
                value={doc.document_type}
                onChange={e => updateType(i, e.target.value)}
                style={{
                  fontSize: 11.5, padding: '5px 8px', borderRadius: 6, border: `1px solid ${c.border}`,
                  background: 'transparent', color: c.text,
                }}
              >
                {typeOptions.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button
                type="button" onClick={() => remove(i)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', border: 'none',
                  background: 'rgba(239,68,68,0.15)', color: '#EF4444', cursor: 'pointer', fontSize: 12, flexShrink: 0,
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