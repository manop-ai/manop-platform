// lib/supabase.ts — kept for backward compatibility with existing imports.
// New code should import
// { sb } from 'lib/supabase/client' directly. This file now re-exports
// the SAME singleton instance instead of creating a second one.
import { sb } from './supabase/client'

export const supabase = sb