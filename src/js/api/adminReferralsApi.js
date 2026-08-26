// Version 7, Milestone 172B.3: admin API client for Seasonedz's own
// affiliate/referral programme. Reuses the existing adminRequest()
// wrapper (admin session cookie, credentials: "include") — nothing new
// on the transport layer. Every call here hits /api/admin/referrals/*,
// a completely separate path from /api/admin/affiliate/* (172B's
// dormant external-merchant admin area) — see adminReferrals.routes.ts's
// own header comment.

import { adminRequest } from "./adminApiClient.js";

function buildQuery(params) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", params.page);
  if (params.limit) query.set("limit", params.limit);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.affiliateId) query.set("affiliateId", params.affiliateId);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export function getReferralsOverview() {
  return adminRequest("/admin/referrals/overview", { method: "GET" });
}

export function getAdminAffiliates(params = {}) {
  return adminRequest(`/admin/referrals/affiliates${buildQuery(params)}`, { method: "GET" });
}

export function getAdminAffiliate(id) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}`, { method: "GET" });
}

export function createAdminAffiliate(payload) {
  return adminRequest("/admin/referrals/affiliates", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAdminAffiliate(id, payload) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function approveAdminAffiliate(id) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}/approve`, { method: "PATCH" });
}

export function rejectAdminAffiliate(id) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}/reject`, { method: "PATCH" });
}

export function suspendAdminAffiliate(id) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}/suspend`, { method: "PATCH" });
}

export function reactivateAdminAffiliate(id) {
  return adminRequest(`/admin/referrals/affiliates/${encodeURIComponent(id)}/reactivate`, { method: "PATCH" });
}

export function getReferralSettings() {
  return adminRequest("/admin/referrals/settings", { method: "GET" });
}

export function updateReferralSettings(payload) {
  return adminRequest("/admin/referrals/settings", { method: "PATCH", body: JSON.stringify(payload) });
}

// Foundation only — the list is expected to be empty until Milestone
// 172B.4/172B.5 wire real commission creation into checkout.
export function getAdminReferralCommissions(params = {}) {
  return adminRequest(`/admin/referrals/commissions${buildQuery(params)}`, { method: "GET" });
}
