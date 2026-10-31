// lib/submission-origin.ts
//
// Review Submissions is the single review workspace for EVERY development, whoever
// created it (agency, developer, or MANOP's own Add Development form).
// `awaitingReview` decides what appears in that queue; `isSubmission` is only used to
// label who the submitter was. Do not use `submitted_via` to decide where review happens:
// its database default is 'manop_direct', so developer-created projects carry that value.

export const isSubmission = (p: { submitted_via: string | null; submitting_agency_id: string | null }) =>
  !!p.submitting_agency_id || p.submitted_via === 'agency_submission' || (!!p.submitted_via && p.submitted_via !== 'manop_direct')

export const awaitingReview = (p: { publish_status: string; reviewed_at?: string | null }) =>
  p.publish_status === 'pending_review' ||
  (!!p.reviewed_at && p.publish_status !== 'published' && p.publish_status !== 'rejected')