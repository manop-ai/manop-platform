// ============================================================
// MANOP — Association System Types
// ============================================================

export type MembershipState = 'pending' | 'active' | 'suspended' | 'expired' | 'revoked'
export type VerificationState = 'draft' | 'pending' | 'under_review' | 'approved' | 'rejected' | 'more_info_needed' | 'resubmitted' | 'expired'
export type VerificationType = 'cac' | 'association_membership' | 'professional_body' | 'manop_review' | 'transaction_history'
export type ManopRole = 'super_admin' | 'country_admin' | 'association_national_admin' | 'chapter_admin' | 'agency_owner' | 'agency_manager' | 'agent' | 'analyst' | 'buyer' | 'investor' | 'developer'
export type ScopeType = 'platform' | 'country' | 'association' | 'chapter' | 'agency'
export type BadgeLevel = 'listed' | 'verified' | 'trust' | 'elite'

export interface Association {
  id: string
  name: string
  short_code: string
  country_code: string
  description: string | null
  website: string | null
  logo_url: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  status: 'pending_setup' | 'active' | 'suspended' | 'inactive'
  is_pilot: boolean
  verification_partner: boolean
  can_see_aggregates: boolean
  can_see_national: boolean
  aggregate_min_count: number
  onboarded_at: string
  created_at: string
  updated_at: string
}

export interface AssociationChapter {
  id: string
  association_id: string
  name: string
  state: string
  city: string | null
  country_code: string
  chapter_admin_user_id: string | null
  active: boolean
  created_at: string
  updated_at: string
  // joined
  member_count?: number
}

export interface AssociationMembership {
  id: string
  association_id: string
  chapter_id: string | null
  data_partner_id: string
  membership_number: string | null
  status: MembershipState
  verified_by_assoc: boolean
  verified_at: string | null
  verification_note: string | null
  joined_at: string | null
  expires_at: string | null
  submitted_at: string
  created_at: string
  // joined
  agency_name?: string
  agency_badge?: BadgeLevel
  agency_mape_score?: number
  agency_verification_status?: string
  chapter_name?: string
}

export interface AssociationUserRole {
  id: string
  user_id: string
  role: ManopRole
  scope_type: ScopeType
  association_id: string | null
  chapter_id: string | null
  agency_id: string | null
  country_code: string | null
  is_active: boolean
  granted_by: string | null
  granted_at: string
  expires_at: string | null
}

export interface VerificationRequest {
  id: string
  data_partner_id: string
  verification_type: VerificationType
  status: VerificationState
  association_id: string | null
  membership_number: string | null
  body_code: string | null
  cac_number: string | null
  cac_doc_url: string | null
  office_address: string | null
  contact_phone: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  more_info_request: string | null
  approved_by_assoc_user: string | null
  approved_by_assoc_at: string | null
  submitted_at: string
  // joined
  agency_name?: string
  agency_cities?: string[]
  agency_mape_score?: number
}

export interface AssociationIntelligence {
  id: string
  association_id: string
  chapter_id: string | null
  period_start: string
  period_end: string
  period_type: 'week' | 'month' | 'quarter' | 'year'
  total_members: number
  active_members: number
  verified_members: number
  elite_members: number
  trust_members: number
  new_members_this_period: number
  verification_rate_pct: number | null
  avg_mape_score: number | null
  median_mape_score: number | null
  avg_mape_i: number | null
  avg_mape_m: number | null
  avg_mape_p: number | null
  total_listings: number
  total_transactions: number
  top_neighborhoods: string[]
  avg_listing_price_ngn: number | null
  median_listing_price_ngn: number | null
  meets_minimum_threshold: boolean
  agency_count_used: number
  computed_at: string
  // from safe_association_intelligence view
  association_name?: string
  association_code?: string
  chapter_name?: string
  chapter_state?: string
}

export interface AssociationAdminInvitation {
  id: string
  association_id: string
  chapter_id: string | null
  invited_by: string
  email: string
  role: ManopRole
  invite_token: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expires_at: string
  accepted_at: string | null
  created_at: string
  // joined
  chapter_name?: string
}

// Dashboard-level resolved context
export interface AssociationUserContext {
  userId: string
  email: string
  role: ManopRole
  scopeType: ScopeType
  associationId: string | null
  associationName: string | null
  associationCode: string | null
  chapterId: string | null
  chapterName: string | null
  chapterState: string | null
  canSeeAllCountries: boolean
  canSeeNationalAggregates: boolean
  canSeeChapterAggregates: boolean
  canApproveMemberships: boolean
  canVerifyMembers: boolean
  canManageAssociations: boolean
  canManageChapters: boolean // national admin only
}