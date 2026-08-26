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
  // Version 7, Milestone 172B.5.
  if (params.eligibleOnly) query.set("eligibleOnly", "true");
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
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

export function getAdminReferralCommissions(params = {}) {
  return adminRequest(`/admin/referrals/commissions${buildQuery(params)}`, { method: "GET" });
}

// Version 7, Milestone 172B.5: commission lifecycle + payout. Every
// eligibility/threshold/balance decision is made server-side — this
// file never computes any of it, only relays the admin's action and
// displays whatever the backend decides.
export function getAdminReferralCommission(id) {
  return adminRequest(`/admin/referrals/commissions/${encodeURIComponent(id)}`, { method: "GET" });
}

export function approveAdminReferralCommission(id) {
  return adminRequest(`/admin/referrals/commissions/${encodeURIComponent(id)}/approve`, { method: "PATCH" });
}

export function reverseAdminReferralCommission(id, { reason, confirmClawback = false } = {}) {
  return adminRequest(`/admin/referrals/commissions/${encodeURIComponent(id)}/reverse`, {
    method: "PATCH",
    body: JSON.stringify({ reason, confirmClawback }),
  });
}

export function getAdminReferralPayoutOverview() {
  return adminRequest("/admin/referrals/payouts", { method: "GET" });
}

export function payAdminAffiliateCommissions(affiliateId, commissionIds) {
  return adminRequest(`/admin/referrals/payouts/${encodeURIComponent(affiliateId)}/pay`, {
    method: "POST",
    body: JSON.stringify(commissionIds ? { commissionIds } : {}),
  });
}
