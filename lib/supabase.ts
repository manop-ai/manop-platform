// lib/supabase.ts — Manop reads from same Manop DB
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export const supabase = createClient(url, key)

export type ManopProperty = {
  id:                  string
  property_type:       string | null
  bedrooms:            number | null
  bathrooms:           number | null
  city:                string | null
  neighborhood:        string | null
  country_code:        string | null
  price_local:         number | null
  currency_code:       string | null
  listing_type:        string | null
  title_document_type: string | null
  agent_phone:         string | null
  source_type:         string | null
  size_sqm:            number | null
  created_at:          string | null
  raw_data:            Record<string, unknown> | null
}

export async function getProperties(opts: {
  city?: string
  neighborhood?: string
  type?: string
  minPrice?: number
  maxPrice?: number
  bedrooms?: number
  limit?: number
} = {}): Promise<ManopProperty[]> {
  let q = supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts.limit || 24)

  if (opts.city && opts.city !== 'all')
    q = q.ilike('city', `%${opts.city}%`)
  if (opts.neighborhood)
    q = q.ilike('neighborhood', `%${opts.neighborhood}%`)
  if (opts.type)
    q = q.eq('property_type', opts.type)
  if (opts.bedrooms)
    q = q.eq('bedrooms', opts.bedrooms)
  if (opts.minPrice)
    q = q.gte('price_local', opts.minPrice)
  if (opts.maxPrice)
    q = q.lte('price_local', opts.maxPrice)

  const { data, error } = await q
  if (error) { console.error(error); return [] }
  return (data as ManopProperty[]) || []
}

export async function getProperty(id: string): Promise<ManopProperty | null> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as ManopProperty
}

export async function getStats() {
  const { count: total }  = await supabase
    .from('properties').select('*', { count: 'exact', head: true })
  const { data: cities }  = await supabase
    .from('properties').select('city')
  const unique = new Set((cities || []).map((r: any) => r.city).filter(Boolean)).size
  return { total: total || 0, cities: unique }
}
