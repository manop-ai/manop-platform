// ============================================================
// MANOP — Association Server-Side Data Layer
// lib/association.ts
// ============================================================

import { createClient } from '@/lib/supabase-server' // your existing server client
import type {
  AssociationUserContext,
  AssociationIntelligence,
  AssociationMembership,
  AssociationChapter,
  VerificationRequest,
  AssociationAdminInvitation,
} from '@/types/association'

// ── Resolve the current user's association context ────────────
// Call this at the top of every association page.
// Returns null if user has no association role → redirect to /
export async function getAssociationUserContext(
  userId: string
): Promise<AssociationUserContext | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('user_permission_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', [
      'super_admin',
      'country_admin',
      'association_national_admin',
      'chapter_admin',
    ])
    .maybeSingle()

  if (error || !data) return null

  return {
    userId,
    email: data.email,
    role: data.role,
    scopeType: data.scope_type,
    associationId: data.association_id,
    associationName: data.association_name,
    associationCode: data.association_code,
    chapterId: data.chapter_id,
    chapterName: data.chapter_name,
    chapterState: data.chapter_state,
    canSeeAllCountries: data.can_see_all_countries,
    canSeeNationalAggregates: data.can_see_national_aggregates,
    canSeeChapterAggregates: data.can_see_chapter_aggregates,
    canApproveMemberships: data.can_approve_memberships,
    canVerifyMembers: data.can_verify_members,
    canManageAssociations: data.can_manage_associations,
    canManageChapters: data.role === 'association_national_admin',
  }
}

// ── Get national intelligence (most recent month) ─────────────
export async function getNationalIntelligence(
  associationId: string
): Promise<AssociationIntelligence | null> {
  const supabase = createClient()

  const { data } = await supabase
    .from('safe_association_intelligence')
    .select('*')
    .eq('association_id', associationId)
    .is('chapter_id', null)
    .eq('period_type', 'month')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

// ── Get per-chapter intelligence ──────────────────────────────
export async function getChapterIntelligence(
  associationId: string,
  chapterId?: string
): Promise<AssociationIntelligence[]> {
  const supabase = createClient()

  let query = supabase
    .from('safe_association_intelligence')
    .select('*')
    .eq('association_id', associationId)
    .not('chapter_id', 'is', null)
    .eq('period_type', 'month')
    .order('period_start', { ascending: false })

  if (chapterId) {
    query = query.eq('chapter_id', chapterId)
  }

  const { data } = await query
  return data ?? []
}

// ── Get chapters for this association ─────────────────────────
export async function getAssociationChapters(
  associationId: string
): Promise<AssociationChapter[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('association_chapters')
    .select(`
      *,
      member_count:association_memberships(count)
    `)
    .eq('association_id', associationId)
    .order('state')

  return (data ?? []).map((c: any) => ({
    ...c,
    member_count: c.member_count?.[0]?.count ?? 0,
  }))
}

// ── Get pending verification requests for this association ────
export async function getPendingVerifications(
  associationId: string,
  chapterId?: string
): Promise<VerificationRequest[]> {
  const supabase = createClient()

  let query = supabase
    .from('verification_requests')
    .select(`
      *,
      agency_name:data_partners(name),
      agency_cities:data_partners(cities),
      agency_mape_score:data_partners(mape_score)
    `)
    .eq('association_id', associationId)
    .eq('verification_type', 'association_membership')
    .in('status', ['pending', 'under_review'])
    .order('submitted_at', { ascending: true })

  const { data } = await query

  return (data ?? []).map((r: any) => ({
    ...r,
    agency_name: r.agency_name?.name,
    agency_cities: r.agency_cities?.cities,
    agency_mape_score: r.agency_mape_score?.mape_score,
  }))
}

// ── Get all active members for this association ───────────────
export async function getAssociationMembers(
  associationId: string,
  chapterId?: string,
  page = 0,
  pageSize = 50
): Promise<{ members: AssociationMembership[]; total: number }> {
  const supabase = createClient()

  let query = supabase
    .from('association_memberships')
    .select(`
      *,
      agency_name:data_partners(name),
      agency_badge:data_partners(badge_level),
      agency_mape_score:data_partners(mape_score),
      agency_verification_status:data_partners(verification_status),
      chapter_name:association_chapters(name)
    `, { count: 'exact' })
    .eq('association_id', associationId)
    .order('submitted_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (chapterId) query = query.eq('chapter_id', chapterId)

  const { data, count } = await query

  const members = (data ?? []).map((m: any) => ({
    ...m,
    agency_name: m.agency_name?.name,
    agency_badge: m.agency_badge?.badge_level,
    agency_mape_score: m.agency_mape_score?.mape_score,
    agency_verification_status: m.agency_verification_status?.verification_status,
    chapter_name: m.chapter_name?.name,
  }))

  return { members, total: count ?? 0 }
}

// ── Get pending invitations ───────────────────────────────────
export async function getPendingInvitations(
  associationId: string
): Promise<AssociationAdminInvitation[]> {
  const supabase = createClient()

  const { data } = await supabase
    .from('association_admin_invitations')
    .select(`
      *,
      chapter_name:association_chapters(name)
    `)
    .eq('association_id', associationId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return (data ?? []).map((i: any) => ({
    ...i,
    chapter_name: i.chapter_name?.name,
  }))
}

// ── Approve a membership verification ─────────────────────────
export async function approveMemberVerification(
  verificationRequestId: string,
  approvedByUserId: string,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('verification_requests')
    .update({
      status: 'approved',
      approved_by_assoc_user: approvedByUserId,
      approved_by_assoc_at: new Date().toISOString(),
      verification_note: note ?? 'Approved by association admin',
    })
    .eq('id', verificationRequestId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Reject a membership verification ──────────────────────────
export async function rejectMemberVerification(
  verificationRequestId: string,
  rejectedByUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  const { error } = await supabase
    .from('verification_requests')
    .update({
      status: 'rejected',
      reviewed_by: rejectedByUserId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', verificationRequestId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}