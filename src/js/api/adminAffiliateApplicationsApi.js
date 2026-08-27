// Version 7, Milestone 176: admin API client for affiliate application
// review. Reuses the existing adminRequest() wrapper — nothing new on
// the transport layer. Every call hits /api/admin/affiliate-applications/*,
// a completely separate path from /api/admin/referrals/* (the existing
// Affiliate list/approve/reject/suspend management, unchanged).

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getAdminAffiliateApplicationsOverview() {
  return adminRequest("/admin/affiliate-applications/overview", { method: "GET" });
}

export function getAdminAffiliateApplications(params = {}) {
  return adminRequest(`/admin/affiliate-applications${buildQuery(params)}`, { method: "GET" });
}

export function getAdminAffiliateApplication(id) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}`, { method: "GET" });
}

export function getAdminAffiliateApplicationEvents(id) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/events`, { method: "GET" });
}

// Only ever called explicitly (a dedicated "Reveal" action) — never
// bundled into the ordinary detail load (brief section 26).
export function revealAdminAffiliateApplicationIdentityNumber(id) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/identity-number`, { method: "GET" });
}

export function getAdminAffiliateApplicationDocumentSignedUrl(id, documentId) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/signed-url`, { method: "GET" });
}

export function requestAdminAffiliateApplicationCorrection(id, { reason, area }) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/request-correction`, {
    method: "PATCH",
    body: JSON.stringify({ reason, area }),
  });
}

export function approveAdminAffiliateApplication(id) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/approve`, { method: "PATCH" });
}

export function rejectAdminAffiliateApplication(id, reason) {
  return adminRequest(`/admin/affiliate-applications/${encodeURIComponent(id)}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
}
